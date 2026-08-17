import type { PayloadRequest } from 'payload'
import {
  AGE_GROUPS,
  ANIMAL_KINDS,
  ID_FORMATS,
  SEXES,
  STATES,
  TRUST_LEVELS,
} from '@/lib/dictionaries'

/**
 * Что журнал правок считает правкой.
 *
 * Соблазн записывать всё подряд надо гасить сразу: сохранение карточки
 * трогает десяток служебных полей — ранги сортировки, транслитерацию клички,
 * отметку времени, — а пересчёт индекса переписывает снимок оценки. Журнал,
 * где на одну осмысленную строку приходится пятнадцать технических, читать
 * никто не станет, а значит его нет.
 *
 * Поэтому список полей задан явно и включает только то, что человек вводит
 * руками: паспорт, происхождение, видимость, выбытие. Расчётное сюда
 * не попадает по определению — у оценок своя история (`animal_evaluations`),
 * и она подробнее любой записи «было/стало». Появилось новое поле в карточке
 * — решение, журналить ли его, принимается здесь и осознанно; молчаливого
 * «само добавится» тут нет намеренно.
 */

type Opt = { readonly value: string; readonly label: string }

export type JournalField = {
  /** Путь в модели: `birthDate`, `altIds.earTag` */
  path: string
  label: string
  /** Как превратить значение в строку для человека */
  kind: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'relation'
  options?: readonly Opt[]
  /** Куда ведёт связь — чтобы показать кличку, а не номер строки */
  relation?: string
}

const f = (
  path: string,
  label: string,
  kind: JournalField['kind'] = 'text',
  extra: Partial<JournalField> = {},
): JournalField => ({ path, label, kind, ...extra })

export const JOURNALLED: JournalField[] = [
  // Паспорт
  f('identNumber', 'Индивидуальный №'),
  f('idFormat', 'Формат ID', 'select', { options: ID_FORMATS }),
  f('name', 'Кличка'),
  f('altIds.isoId', 'ISO-ID'),
  f('altIds.internationalId', 'Международный ID'),
  f('altIds.earTag', 'Номер ушной бирки'),
  f('kind', 'Тип животного', 'select', { options: ANIMAL_KINDS }),
  f('sex', 'Пол', 'select', { options: SEXES.map((s) => ({ value: s.value, label: s.full })) }),
  f('state', 'Состояние', 'select', { options: STATES.map((s) => ({ value: s.value, label: s.full })) }),
  f('ageGroup', 'Возрастная группа', 'select', { options: AGE_GROUPS }),
  f('birthDate', 'Дата рождения', 'date'),
  f('breed', 'Порода', 'relation', { relation: 'breeds' }),
  f('bloodPercent', 'Кровность по голштину, %', 'number'),
  f('improvers.breed1', 'Улучшающая порода 1', 'relation', { relation: 'breeds' }),
  f('improvers.share1', 'Доля крови 1, %', 'number'),
  f('improvers.breed2', 'Улучшающая порода 2', 'relation', { relation: 'breeds' }),
  f('improvers.share2', 'Доля крови 2, %', 'number'),
  f('coatColor', 'Масть', 'relation', { relation: 'coat-colors' }),
  f('bloodGroup', 'Группа крови', 'relation', { relation: 'blood-groups' }),
  f('purpose', 'Назначение', 'relation', { relation: 'animal-purposes' }),
  f('owner', 'Владелец', 'relation', { relation: 'organizations' }),
  f('herd', 'Стадо', 'relation', { relation: 'herds' }),
  f('notes', 'Примечание'),

  // Достоверность и видимость
  f('trustLevel', 'Уровень достоверности', 'select', {
    options: TRUST_LEVELS.map((t) => ({ value: String(t.value), label: t.label })),
  }),
  f('trustCheckedAt', 'Дата подтверждения', 'date'),
  f('publicVisible', 'Показывать в публичном списке', 'checkbox'),
  f('publicDetails', 'Открыта полная карточка', 'checkbox'),
  f('forSale', 'Выставлено на продажу', 'checkbox'),

  // Происхождение
  f('category', 'Категория племучёта', 'relation', { relation: 'breeding-categories' }),
  f('registrationBasis', 'Основание регистрации', 'select', {
    options: [
      { value: 'origin', label: 'По происхождению' },
      { value: 'productivity', label: 'По продуктивности' },
    ],
  }),
  f('breedingClass', 'Класс', 'relation', { relation: 'breeding-classes' }),
  f('father', 'Отец', 'relation', { relation: 'animals' }),
  f('mother', 'Мать', 'relation', { relation: 'animals' }),
  f('line', 'Линия', 'relation', { relation: 'lines' }),
  f('family', 'Семейство', 'relation', { relation: 'lines' }),
  f('pedigreeText.fatherId', 'Отец по бумаге, инд. №'),
  f('pedigreeText.fatherName', 'Отец по бумаге, кличка'),
  f('pedigreeText.motherId', 'Мать по бумаге, инд. №'),
  f('pedigreeText.motherName', 'Мать по бумаге, кличка'),
  f('pedigreeText.fatherFatherId', 'ОО по бумаге, инд. №'),
  f('pedigreeText.motherFatherId', 'ОМ по бумаге, инд. №'),
  f('inbreeding', 'Коэффициент инбридинга, %', 'number'),

  // Выбытие
  f('previousOrganization', 'Прежний владелец', 'relation', { relation: 'organizations' }),
  f('disposalReason', 'Причина выбытия', 'relation', { relation: 'disposal-reasons' }),
  f('disposalOrganization', 'Куда выбыло', 'relation', { relation: 'organizations' }),
  f('archived', 'В архиве', 'checkbox'),
]

/** Значение по пути вида `altIds.earTag` */
const at = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)

/** Идентификатор связи: она приходит то числом, то раскрытым документом */
const relationId = (value: unknown): number | string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    const id = (value as { id?: number | string }).id
    return id ?? null
  }
  return value as number | string
}

/**
 * Как называется запись, на которую ссылается поле.
 *
 * Поля разные в разных коллекциях, поэтому берётся первое подходящее:
 * у животного это индивидуальный номер, у организации и породы — название,
 * у пользователя — почта. Не нашли — остаётся `#12`: строка журнала всё
 * равно осмысленнее, чем её отсутствие.
 */
const TITLE_FIELDS = ['identNumber', 'name', 'fullName', 'title', 'email'] as const

async function titleOf(
  req: PayloadRequest,
  collection: string,
  id: number | string,
): Promise<string> {
  try {
    const doc = await req.payload.findByID({
      collection: collection as never,
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const key of TITLE_FIELDS) {
      const value = (doc as Record<string, unknown>)?.[key]
      if (typeof value === 'string' && value.trim()) return value
    }
  } catch {
    /* запись могла исчезнуть — покажем номер */
  }
  return `#${id}`
}

const asDate = (value: unknown): string => {
  const d = new Date(String(value))
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Значение в том виде, в каком его прочитает человек */
async function present(
  req: PayloadRequest,
  field: JournalField,
  value: unknown,
): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null

  switch (field.kind) {
    case 'checkbox':
      return value ? 'да' : 'нет'
    case 'date':
      return asDate(value)
    case 'select': {
      const found = field.options?.find((o) => o.value === String(value))
      return found?.label ?? String(value)
    }
    case 'relation': {
      const id = relationId(value)
      if (id === null) return null
      return field.relation ? await titleOf(req, field.relation, id) : `#${id}`
    }
    default:
      return String(value)
  }
}

/**
 * Сравнимы ли значения. Сравнение идёт по «сырому» виду, а не по показанному:
 * связь могла прийти числом, а могла раскрытым документом — для журнала это
 * одно и то же значение, и строку «было #12, стало #12» писать не за что.
 */
const sameValue = (field: JournalField, a: unknown, b: unknown): boolean => {
  if (field.kind === 'relation') return String(relationId(a) ?? '') === String(relationId(b) ?? '')
  if (field.kind === 'date') {
    const ta = a ? new Date(String(a)).getTime() : null
    const tb = b ? new Date(String(b)).getTime() : null
    return ta === tb
  }
  if (field.kind === 'checkbox') return Boolean(a) === Boolean(b)
  const na = a === null || a === undefined || a === '' ? null : a
  const nb = b === null || b === undefined || b === '' ? null : b
  return String(na) === String(nb)
}

export type Revision = { path: string; label: string; before: string | null; after: string | null }

/** Чем новая версия карточки отличается от прежней — в понятном человеку виде */
export async function diffAnimal(
  req: PayloadRequest,
  before: unknown,
  after: unknown,
): Promise<Revision[]> {
  const out: Revision[] = []

  for (const field of JOURNALLED) {
    const a = at(before, field.path)
    const b = at(after, field.path)

    /*
     * Поля, которых в новой версии просто нет, пропускаются. Частичное
     * обновление — обычное дело: форма правки паспорта присылает пять полей,
     * и остальные сорок в объекте отсутствуют. Считать отсутствие
     * очищением значило бы записать сорок выдуманных правок.
     */
    if (b === undefined) continue
    if (sameValue(field, a, b)) continue

    out.push({
      path: field.path,
      label: field.label,
      before: await present(req, field, a),
      after: await present(req, field, b),
    })
  }

  return out
}
