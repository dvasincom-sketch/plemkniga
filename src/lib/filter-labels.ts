import { AGE_GROUPS, ID_FORMATS, RELATIONS, SEXES, STATES, labelOf } from '@/lib/dictionaries'
import { ADVANCED_FIELDS } from '@/lib/animal-query'

export type Herd = { id: number; name: string }

/**
 * Человекочитаемое описание условия отбора.
 * Используется и «фишками» над результатами, и подсказками в пустой выдаче,
 * поэтому формулировка одна на оба места.
 */
export function describeFilter(
  key: string,
  value: string,
  herds: Herd[] = [],
): { label: string; value: string } | null {
  switch (key) {
    case 'id':
      return { label: 'Инд. №', value }
    case 'name':
      return { label: 'Кличка', value }
    case 'idFormat':
      return { label: 'Формат номера', value: labelOf(ID_FORMATS, value) }
    case 'sex':
      return { label: 'Пол', value: SEXES.find((o) => o.value === value)?.full ?? value }
    case 'ageGroup':
      return { label: 'Возраст', value: labelOf(AGE_GROUPS, value) }
    case 'state':
      return { label: 'Состояние', value: STATES.find((o) => o.value === value)?.full ?? value }
    case 'relation':
      return { label: 'Родословная', value: labelOf(RELATIONS, value) }
    case 'owner':
      return { label: 'Владелец', value }
    case 'author':
      return { label: 'Автор записи', value }
    case 'herd': {
      const herd = herds.find((h) => String(h.id) === value)
      return { label: 'Стадо', value: herd?.name ?? value }
    }
    case 'ipcFrom':
      return { label: 'ИПЦ', value: `от ${value}` }
    case 'ipcTo':
      return { label: 'ИПЦ', value: `до ${value}` }
    default: {
      const advanced = ADVANCED_FIELDS.find((f) => f.name === key)
      if (advanced) return { label: advanced.label, value: `больше ${value}` }
      return null
    }
  }
}
