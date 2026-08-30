import type { Payload } from 'payload'
import type { Animal, Organization } from '@/payload-types'
import { relId } from '@/lib/visibility'

/**
 * Перемещения животных между хозяйствами.
 *
 * ## Зачем отдельная сущность, если есть событие «перемещение»
 *
 * В ленте событий тип `move` уже был, и он менял стадо внутри хозяйства.
 * Продажа — другое: она меняет владельца, а владелец в этой системе решает
 * всё — кто правит карточку, кто видит дойки, чьё стадо считается в отчётах.
 * Записать такое строкой в ленте значило бы иметь два источника правды
 * о том, чьё животное: поле `owner` и текст события. Они разойдутся
 * в первый же месяц.
 *
 * ## Почему контрагент — обычная организация, а не «внешнее хозяйство»
 *
 * Половина покупателей Ассоциации не член и книгу не ведёт. Соблазн завести
 * им отдельную таблицу велик и обманчив: такое хозяйство через год вступает
 * в Ассоциацию, и тогда пришлось бы переносить карточку в другую таблицу,
 * переписывая все ссылки на неё в перемещениях. Один справочник с признаком
 * `presence` делает вступление сменой одного поля, а история остаётся целой.
 *
 * ## Почему последствия применяет не всякая запись
 *
 * Перемещения вносят задним числом — накладную нашли через месяц. Если
 * применять последствия всегда, запись о мартовской продаже, внесённая
 * в августе, вернёт животное мартовскому покупателю поверх июльского.
 * Поэтому владельца и состояние меняет только перемещение, которое
 * оказалось последним по дате; более раннее просто ложится в историю.
 */

export type MovementKind = 'sale' | 'lease' | 'transfer' | 'import' | 'cull' | 'death'

/**
 * Тип поступления — справочник `sp_ba_types_delivery` ФГИАС ПР.
 *
 * Четыре значения, прочитаны из открытого реестра 31 августа 2026 года:
 * импорт, покупка, рождение, прочее. Список закрытый — его держит
 * государство, — поэтому здесь константой, как признаки взвешивания.
 *
 * ## Наши шесть видов ложатся в них не все, и это правильно
 *
 * Реестр спрашивает, **как животное попало к нынешнему владельцу**.
 * Аренда и перевод между своими стадами владельца не меняют вовсе —
 * им в этом справочнике места нет и быть не должно. Выбраковка и падёж
 * тоже: это выбытие, а не поступление.
 *
 * Остаются два вида и одно состояние без вида: продажа (для покупателя
 * это «Покупка»), поступление извне («Импорт») и рождение в хозяйстве,
 * которому никакое перемещение не соответствует, потому что животное
 * никуда не ехало.
 *
 * ## Почему «поступление извне» — импорт, а не покупка
 *
 * Наше `import` означает «купили у того, кто книгу не ведёт, или ввезли
 * из-за рубежа», и второе перевешивает: покупка внутри страны почти
 * всегда проходит продажей, у которой в книге есть обе стороны.
 * Разделить их точнее можно было бы по стране контрагента — и это
 * стоит сделать, когда у организаций появится страна регистрации.
 */
export const ARRIVAL_TYPES = {
  purchase: 'a5db1a79-9789-44c0-8d37-352029c0cb67',
  import: '15b59efe-22db-42fd-9cf6-b7afc3d7fd61',
  birth: 'f26525a6-f52d-475e-b39b-4678d0915778',
  other: 'f9039980-2b0b-46c5-8cca-262253254cc8',
} as const

/** Вид перемещения → тип поступления реестра; `undefined` — владельца не меняет. */
export const arrivalTypeOf = (kind?: string | null): string | undefined =>
  kind === 'sale'
    ? ARRIVAL_TYPES.purchase
    : kind === 'import'
      ? ARRIVAL_TYPES.import
      : undefined

export const MOVEMENT_KINDS = [
  {
    value: 'sale',
    label: 'Продажа',
    hint: 'Владелец меняется. Дальше карточку ведёт покупатель.',
  },
  {
    value: 'lease',
    label: 'Аренда, временное содержание',
    hint: 'Животное уехало, владелец прежний. Меняется только площадка.',
  },
  {
    value: 'transfer',
    label: 'Перевод между своими стадами',
    hint: 'Внутри хозяйства: другая ферма, другая площадка.',
  },
  {
    value: 'import',
    label: 'Поступление извне',
    hint: 'Купили у того, кто книгу не ведёт, или ввезли из-за рубежа.',
  },
  { value: 'cull', label: 'Выбраковка', hint: 'Животное выбыло из книги.' },
  { value: 'death', label: 'Падёж', hint: 'Животное выбыло из книги.' },
] as const satisfies readonly { value: MovementKind; label: string; hint: string }[]


/** Виды, после которых у животного меняется владелец. */
export const CHANGES_OWNER: readonly MovementKind[] = ['sale', 'import']

/** Виды, после которых животное выбывает из книги независимо от владельца. */
export const RETIRES: Record<string, 'culled' | 'dead'> = { cull: 'culled', death: 'dead' }

/**
 * Ключ названия для поиска дублей.
 *
 * Справочник хозяйств пополняют не операторы Ассоциации, а хозяйства —
 * в момент, когда оформляют продажу и покупателя в списке не находят.
 * Без нормализации через год в нём будут «ООО "Заря"», «ООО Заря»
 * и «Заря, ООО» тремя разными карточками, и история перемещений
 * распадётся на три несвязанные ветки.
 *
 * Организационная форма из ключа убирается намеренно: она пишется
 * то спереди, то сзади, то в кавычках, и различить по ней два разных
 * хозяйства всё равно нельзя — для этого есть ИНН.
 */
const LEGAL_FORMS =
  /\b(ооо|оао|зао|пао|ао|нао|кфх|ип|спк|скпк|фгуп|гуп|муп|тнв|схпк|колхоз|совхоз)\b/g

export const orgNameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[«»"'`]/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^0-9a-zа-яё]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')

/** ИНН без пробелов и дефисов; пустая строка, если ввели не цифры. */
export const normalizeInn = (raw: string): string => {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 12 ? digits : ''
}

export type Counterparty = {
  id: number
  name: string
  inn?: string | null
  /** Карточка заведена другим хозяйством и Ассоциацией ещё не разобрана. */
  referenced: boolean
}

/**
 * Найти хозяйство или завести карточку.
 *
 * Поиск сперва по ИНН и только потом по ключу названия: ИНН — настоящий
 * идентификатор, название — догадка. Совпадение по названию при разных ИНН
 * не считается совпадением, иначе два «Рассвета» из разных областей
 * склеятся в один.
 */
export async function findOrCreateCounterparty(
  payload: Payload,
  input: { name: string; inn?: string; region?: string },
  createdBy: number | null,
): Promise<{ org: Counterparty } | { error: string }> {
  const name = input.name.trim()
  if (name.length < 2) return { error: 'Название хозяйства слишком короткое' }

  const inn = normalizeInn(input.inn ?? '')
  if (input.inn && input.inn.trim() && !inn) {
    return { error: 'ИНН должен состоять из 10 цифр (организация) или 12 (ИП)' }
  }

  const found = await payload.find({
    collection: 'organizations',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: inn ? { inn: { equals: inn } } : { nameKey: { equals: orgNameKey(name) } },
  })

  const hit = found.docs[0] as Organization | undefined
  if (hit) {
    return {
      org: { id: hit.id, name: hit.name, inn: hit.inn, referenced: hit.presence === 'referenced' },
    }
  }

  const created = (await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: {
      name,
      ...(inn ? { inn } : {}),
      ...(input.region ? { region: input.region as Organization['region'] } : {}),
      membership: 'none',
      presence: 'referenced',
      ...(createdBy ? { referencedBy: createdBy } : {}),
    },
  })) as Organization

  return { org: { id: created.id, name: created.name, inn: created.inn, referenced: true } }
}

/**
 * Последствия перемещения для карточки животного.
 *
 * Чистая функция: она только считает, что должно измениться, и ничего
 * не пишет. Так её можно прогнать по истории в скрипте ревизии и сверить
 * с тем, что в базе, — а именно этой сверки не хватало событиям в ленте.
 */
export function movementEffect(input: {
  kind: MovementKind
  animal: Pick<Animal, 'owner' | 'state' | 'herd'>
  to: number | null
  toHerd: number | null
  /** Ведёт ли получатель свои записи в системе. */
  receiverKeepsBook: boolean
}): Partial<Pick<Animal, 'owner' | 'state' | 'herd'>> {
  const { kind, animal, to, toHerd, receiverKeepsBook } = input
  const patch: Partial<Pick<Animal, 'owner' | 'state' | 'herd'>> = {}

  const retired = RETIRES[kind]
  if (retired) {
    patch.state = retired
    return patch
  }

  if (CHANGES_OWNER.includes(kind) && to !== null && to !== relId(animal.owner)) {
    patch.owner = to
    /*
     * Состояние — про судьбу животного, а не про то, чьё оно. Но если
     * покупатель книгу не ведёт, о дальнейшей судьбе не узнает никто:
     * ни отёлов, ни доек больше не придёт. Для книги это выбытие,
     * и честнее сказать это сразу, чем оставить в стаде корову,
     * о которой не будет ни одной записи.
     */
    patch.state = receiverKeepsBook ? 'alive' : 'sold'
    patch.herd = toHerd
    return patch
  }

  if (toHerd !== null && toHerd !== relId(animal.herd)) patch.herd = toHerd
  return patch
}
