import type { Payload } from 'payload'
import { DOMAIN_RULES } from '@/lib/db-constraints'

/**
 * Границы ограничения базы против границ поля формы.
 *
 * ## Из-за чего появилось
 *
 * В `db-constraints.ts` написано: границы диапазонов берутся из полей
 * коллекций, а не из головы, потому что расхождение между тем, что
 * разрешает форма, и тем, что разрешает база, — отложенная авария.
 * Обещание было неправдой у половины правил: у жирности молока, инбридинга,
 * надёжности индекса и процентиля `min` и `max` не стояли вовсе. Форма
 * принимала жирность в двести процентов, человек нажимал «Сохранить»,
 * и вместо «жирность бывает от нуля до пятнадцати» получал строку
 * `violates check constraint "chk_milk_tests_fat_percent"`.
 *
 * Заметить это было нечем: границы жили внутри готовой строки SQL,
 * откуда их не достать, и сравнивать было не с чем.
 *
 * ## Почему сверка вынесена сюда, а не написана в прогоне
 *
 * Её зовут двое: скрипт `check:bounds` и ночная проба на странице
 * «Статус». Написанная дважды, она разошлась бы — и разошлась бы именно
 * в том, ради чего заведена.
 *
 * ## Как выводится имя колонки
 *
 * Группа даёт приставку, строка и безымянная вкладка — нет: так устроен
 * адаптер. Догадка тут же сверяется с настоящими колонками
 * (`payload.db.tables`): выведенное имя, которого в схеме нет, — красная
 * строка, а не молчаливый пропуск. Массивы и блоки не разбираются: они
 * ложатся отдельными таблицами, и ни одного правила-диапазона на них нет.
 */

type Field = {
  name?: string
  type: string
  min?: number
  max?: number
  fields?: Field[]
  tabs?: { name?: string; fields: Field[] }[]
}

/**
 * `ipcDetails` → `ipc_details`, `milk-tests` → `milk_tests`.
 *
 * Дефис здесь не украшение: имена полей приходят в camelCase, а имена
 * коллекций — через дефис (`milk-tests`, `index-values`). Первая редакция
 * переводила только camelCase, и четыре правила отчитались «коллекции
 * с таблицей milk_tests нет» — прогон нашёл собственную ошибку раньше,
 * чем чужую, и это ровно то поведение, ради которого он писался: догадка
 * об имени, не сошедшаяся с настоящей схемой, краснеет.
 */
const snake = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase()

type Found = { column: string; min?: number; max?: number }

const numberFields = (fields: Field[], prefix: string[] = []): Found[] => {
  const out: Found[] = []
  for (const f of fields) {
    if (f.type === 'group' && f.fields) {
      out.push(...numberFields(f.fields, f.name ? [...prefix, snake(f.name)] : prefix))
      continue
    }
    if (f.type === 'tabs' && f.tabs) {
      for (const tab of f.tabs) {
        out.push(...numberFields(tab.fields, tab.name ? [...prefix, snake(tab.name)] : prefix))
      }
      continue
    }
    if ((f.type === 'row' || f.type === 'collapsible') && f.fields) {
      out.push(...numberFields(f.fields, prefix))
      continue
    }
    if (f.type === 'number' && f.name) {
      out.push({ column: [...prefix, snake(f.name)].join('_'), min: f.min, max: f.max })
    }
  }
  return out
}

export type BoundsReport = {
  /** Правила, у которых база и форма совпали. */
  ok: string[]
  /** Расхождения — по строке на каждое, готовые к показу. */
  bad: string[]
  /** Сколько правил с границами вообще нашлось. */
  ranged: number
}

export function compareBounds(payload: Payload): BoundsReport {
  const real = new Map<string, Set<string>>()
  const tables = (payload.db as unknown as { tables?: Record<string, unknown> }).tables ?? {}
  for (const [table, def] of Object.entries(tables)) {
    const cols = new Set<string>()
    for (const col of Object.values((def ?? {}) as Record<string, unknown>)) {
      const name = (col as { name?: unknown } | null)?.name
      if (typeof name === 'string') cols.add(name)
    }
    real.set(snake(table), cols)
  }

  const byTable = new Map<string, Map<string, Found>>()
  for (const collection of payload.config.collections) {
    const map = new Map<string, Found>()
    for (const f of numberFields(collection.fields as unknown as Field[])) map.set(f.column, f)
    byTable.set(snake(collection.slug), map)
  }

  const ranged = DOMAIN_RULES.filter((r) => r.bounds)
  const ok: string[] = []
  const bad: string[] = []

  for (const rule of ranged) {
    const b = rule.bounds!
    const fields = byTable.get(rule.table)
    const columns = real.get(rule.table)
    const field = fields?.get(b.column)

    if (!fields) {
      bad.push(`${rule.name}: коллекции с таблицей ${rule.table} нет`)
    } else if (columns && !columns.has(b.column)) {
      bad.push(`${rule.name}: колонки ${rule.table}.${b.column} в схеме нет`)
    } else if (!field) {
      bad.push(`${rule.name}: поле для ${rule.table}.${b.column} не найдено`)
    } else if (field.min !== b.min || field.max !== b.max) {
      bad.push(
        `${rule.name}: база ${b.min}…${b.max}, ` +
          `поле ${field.min ?? 'без min'}…${field.max ?? 'без max'} — ${rule.note}`,
      )
    } else {
      ok.push(`${rule.table}.${b.column}: ${b.min}…${b.max}`)
    }
  }

  return { ok, bad, ranged: ranged.length }
}
