'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { isAssociation } from '@/access'
import { assertCan } from '@/lib/roles'
import {
  findOrCreateCounterparty,
  normalizeInn,
  orgNameKey,
  type MovementKind,
} from '@/lib/movements'
import { recordOperation } from '@/lib/operations'
import { poolOf } from '@/lib/sql'
import { moveOrganizationRefs, type MergeReport } from '@/lib/org-merge'

/**
 * Запись перемещения и разбор справочника хозяйств.
 *
 * Действие делает две вещи подряд, и это не смешение обязанностей,
 * а одна операция глазами человека: он оформляет продажу и в этот же момент
 * впервые называет покупателя. Разделить их на «сначала заведите карточку
 * контрагента, потом вернитесь и оформите продажу» — верный способ получить
 * справочник, полный карточек без единого перемещения.
 */

export type MovementFormState = {
  error?: string
  message?: string
  /** Завели новую карточку контрагента — об этом стоит сказать вслух. */
  createdCounterparty?: string
}

export type CounterpartyMatch = {
  id: number
  name: string
  inn: string | null
  region: string | null
  /** Карточка заведена контрагентом, Ассоциацией не разобрана. */
  referenced: boolean
}

const MIN_QUERY = 2

/**
 * Поиск хозяйства по названию или ИНН.
 *
 * Отдаёт и «упомянутые» карточки тоже: иначе продавец, не найдя покупателя,
 * заведёт вторую такую же — а первую, заведённую соседом месяц назад,
 * он просто не увидел.
 */
export async function searchCounterpartyAction(query: string): Promise<CounterpartyMatch[]> {
  const q = query.trim()
  if (q.length < MIN_QUERY) return []

  const user = await getCurrentUser()
  if (!user) return []

  const payload = await getClient()
  const inn = normalizeInn(q)

  const found = await payload.find({
    collection: 'organizations',
    depth: 0,
    limit: 8,
    sort: 'name',
    overrideAccess: true,
    where: {
      and: [
        /*
         * Слитые дубли из поиска убраны: показывать их значит предлагать
         * человеку выбрать карточку, которая уже признана лишней.
         */
        { mergedInto: { exists: false } },
        {
          or: inn
            ? [{ inn: { equals: inn } }]
            : [{ name: { like: q } }, { nameKey: { like: orgNameKey(q) } }, { inn: { like: q } }],
        },
      ],
    },
  })

  return found.docs.map((o) => ({
    id: o.id,
    name: o.name,
    inn: o.inn ?? null,
    region: o.region ?? null,
    referenced: o.presence === 'referenced',
  }))
}

const iso = (form: FormData, key: string): string | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const num = (form: FormData, key: string): number | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function recordMovementAction(
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const org = relId(user.organization)
  if (!org) return { error: 'У вашей учётной записи нет хозяйства' }

  const guardPayload = await getClient()
  const denied = await assertCan(guardPayload, user, 'move')
  if (denied) return { error: denied }

  const animalId = num(formData, 'animal')
  if (!animalId) return { error: 'Животное не выбрано' }

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата обязательна' }

  const kind = String(formData.get('kind') || '') as MovementKind
  if (!['sale', 'lease', 'transfer', 'import', 'cull', 'death'].includes(kind)) {
    return { error: 'Не выбран вид перемещения' }
  }

  const payload = await getClient()

  const animal = await payload.findByID({
    collection: 'animals',
    id: animalId,
    depth: 0,
    overrideAccess: true,
  })
  if (!animal) return { error: 'Запись не найдена' }

  /*
   * Поступление извне записывает получатель, всё остальное — владелец.
   * Проверка стоит до всякой записи в базу: иначе карточка контрагента
   * успела бы завестись под отказ, и справочник копил бы хозяйства
   * из неудавшихся попыток.
   */
  const owner = relId(animal.owner)
  if (kind === 'import') {
    if (owner !== org && owner !== null) {
      return { error: 'Поступление записывает то хозяйство, к которому животное поступило' }
    }
  } else if (owner !== org) {
    return { error: 'Записать перемещение может только хозяйство-владелец' }
  }

  // ------------------------- контрагент ------------------------- //
  let counterparty: number | null = null
  let created: string | undefined

  if (kind === 'sale' || kind === 'import' || kind === 'lease') {
    const chosen = num(formData, 'counterparty')
    if (chosen) {
      counterparty = chosen
    } else {
      const name = String(formData.get('counterpartyName') || '').trim()
      if (!name) {
        return {
          error:
            kind === 'import'
              ? 'Укажите, откуда поступило животное'
              : 'Укажите хозяйство-получателя: выберите из списка или впишите название',
        }
      }
      const result = await findOrCreateCounterparty(
        payload,
        {
          name,
          inn: String(formData.get('counterpartyInn') || ''),
          region: String(formData.get('counterpartyRegion') || '') || undefined,
        },
        org,
      )
      if ('error' in result) return { error: result.error }
      counterparty = result.org.id
      if (result.org.referenced) created = result.org.name
    }
  }

  const from = kind === 'import' ? counterparty : org
  const to =
    kind === 'cull' || kind === 'death' ? null : kind === 'import' ? org : (counterparty ?? org)

  try {
    await payload.create({
      collection: 'movements',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        kind,
        from,
        to,
        fromHerd: relId(animal.herd),
        toHerd: num(formData, 'toHerd'),
        basis: String(formData.get('basis') || '').trim() || undefined,
        note: String(formData.get('note') || '').trim() || undefined,
      },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать перемещение' }
  }

  revalidatePath(`/animals/${animalId}`)
  await recordOperation(payload, {
    action: 'movement-recorded',
    actor: user,
    organization: org,
    subjectType: 'animal',
    subjectId: animalId,
    subject: String(animal.identNumber ?? ''),
    summary: `${kind}${created ? `, заведена карточка «${created}»` : ''}`,
  })

  revalidatePath('/account')

  return {
    message: 'Перемещение записано',
    ...(created ? { createdCounterparty: created } : {}),
  }
}

/**
 * Слияние дублей справочника — работа Ассоциации.
 *
 * Хозяйство завести карточку может, слить две — нет. Слияние переписывает
 * чужие перемещения и чужие карточки животных, и решение «это одно и то же
 * хозяйство» стоит принимать тому, кто отвечает за справочник целиком.
 *
 * Дубль не удаляется. На него могут ссылаться уже выданные документы
 * и выгрузки, ушедшие наружу; удаление превратило бы их в ссылки в никуда.
 * Он остаётся с отметкой «слито с» и пропадает из поиска — тот же приём,
 * что у реестра удалённых записей.
 */
export async function mergeOrganizationsAction(
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const user = await getCurrentUser()
  if (!user || !isAssociation(user)) return { error: 'Слияние справочника — работа Ассоциации' }

  const duplicate = num(formData, 'duplicate')
  const target = num(formData, 'target')
  if (!duplicate || !target) return { error: 'Выберите обе карточки' }
  if (duplicate === target) return { error: 'Это одна и та же карточка' }

  const payload = await getClient()

  const pool = poolOf(payload)
  if (!pool) return { error: 'Слияние требует прямого доступа к базе' }

  let report: MergeReport
  try {
    /*
     * Перевод ссылок идёт запросами по каталогу внешних ключей, а не
     * перечислением полей через Payload: разбор — в `src/lib/org-merge.ts`.
     * Коротко: полей-ссылок четыре десятка, рукописный список отставал бы
     * от модели молча, и слияние всё равно отчитывалось бы успехом.
     */
    report = await moveOrganizationRefs(pool, duplicate, target)

    await payload.update({
      collection: 'organizations',
      id: duplicate,
      overrideAccess: true,
      user,
      data: { mergedInto: target },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось слить карточки' }
  }

  await recordOperation(payload, {
    action: 'directory-merged',
    actor: user,
    organization: target,
    subjectType: 'organization',
    subjectId: duplicate,
    /*
     * В журнал пишется, сколько строк переехало и по каким полям.
     * Слияние необратимо, и «карточки слиты» без числа не позволяет
     * потом ответить на вопрос, что именно тогда переехало.
     */
    summary:
      `Дубль ${duplicate} слит с ${target}: ` +
      (report.moved.length
        ? report.moved.map((m) => `${m.table}.${m.column} — ${m.rows}`).join(', ')
        : 'ссылок не было') +
      (report.deduped ? `; сдвоенных связей убрано ${report.deduped}` : ''),
  })

  revalidatePath('/association/farms')
  const rows = report.moved.reduce((s, m) => s + m.rows, 0)
  return { message: rows ? `Карточки слиты, переведено записей: ${rows}` : 'Карточки слиты' }
}

/** Признать карточку, заведённую контрагентом, самостоятельным хозяйством. */
export async function confirmReferencedOrgAction(
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const user = await getCurrentUser()
  if (!user || !isAssociation(user)) return { error: 'Разбор справочника — работа Ассоциации' }

  const id = num(formData, 'id')
  if (!id) return { error: 'Карточка не выбрана' }

  const payload = await getClient()
  await payload.update({
    collection: 'organizations',
    id,
    overrideAccess: true,
    user,
    data: { presence: 'registered' },
  })

  await recordOperation(payload, {
    action: 'directory-confirmed',
    actor: user,
    organization: id,
    subjectType: 'organization',
    subjectId: id,
  })

  revalidatePath('/association/farms')
  return { message: 'Карточка признана самостоятельным хозяйством' }
}
