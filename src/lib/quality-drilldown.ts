import type { Payload } from 'payload'
import { poolOf } from '@/lib/sql'
import { resolveThresholds, type Thresholds } from '@/lib/check-thresholds'
import { checkSpecByCode } from '@/lib/checks-registry'
import { nf } from '@/lib/format'

/**
 * Разбор одного противоречия: кто именно.
 *
 * Сводка отвечает «сколько», и на этом останавливаться нельзя: число без
 * возможности посмотреть, кто за ним стоит, — не находка, а повод для
 * беспокойства. Здесь то же правило, что в сводке, но возвращает список
 * животных, а не счётчик.
 *
 * Условия намеренно повторяют `book-quality.ts` слово в слово: списки
 * должны сходиться с числами, иначе человек увидит «573» и семьдесят
 * строк — и перестанет верить обоим.
 */

export type DrilldownRow = {
  id: number
  identNumber: string
  name: string | null
  birthDate: string | null
  owner: string | null
  /** Пояснение, относящееся именно к этой записи */
  detail: string | null
}

export type Drilldown = {
  code: string
  label: string
  severity: 'fix' | 'note'
  total: number
  rows: DrilldownRow[]
}

/**
 * Правила разбора.
 *
 * `where` — условие в терминах таблицы `animals` с псевдонимами `a`, `f`, `m`
 * (животное, отец, мать). `detail` — выражение, объясняющее конкретную
 * строку: для «мать моложе дочери» это номер матери и обе даты, иначе
 * человеку придётся открывать карточку, чтобы понять, о чём речь.
 */
type Rule = { label: string; severity: 'fix' | 'note'; where: string; detail?: string }

/*
 * Правила зависят от настроенных порогов, поэтому собираются функцией,
 * а не лежат готовой картой. Числа 500, 25 000 и 25 % стояли здесь
 * литералами — и в подписи, и в условии, — а Ассоциация их настраивает:
 * после первой правки порога список расходился со сводкой, из которой
 * в него приходят.
 */
const rulesFor = (t: Thresholds): Record<string, Rule> => ({
  'self-parent': {
    label: 'Животное записано собственным родителем',
    severity: 'fix',
    where: 'a.id = a.father_id or a.id = a.mother_id',
  },
  'father-younger': {
    label: 'Отец родился позже потомка или в тот же день',
    severity: 'fix',
    where: "f.birth_date is not null and a.birth_date is not null and f.birth_date >= a.birth_date",
    detail:
      "'отец № ' || f.ident_number || ', ' || to_char(f.birth_date, 'DD.MM.YYYY') || " +
      "' против ' || to_char(a.birth_date, 'DD.MM.YYYY')",
  },
  'mother-younger': {
    label: 'Мать родилась позже потомка или в тот же день',
    severity: 'fix',
    where: "m.birth_date is not null and a.birth_date is not null and m.birth_date >= a.birth_date",
    detail:
      "'мать № ' || m.ident_number || ', ' || to_char(m.birth_date, 'DD.MM.YYYY') || " +
      "' против ' || to_char(a.birth_date, 'DD.MM.YYYY')",
  },
  'father-wrong-sex': {
    label: 'Отцом записано животное женского пола',
    severity: 'fix',
    where: "f.id is not null and f.sex <> 'male'",
    detail: "'отец № ' || f.ident_number",
  },
  'mother-wrong-sex': {
    label: 'Матерью записано животное мужского пола',
    severity: 'fix',
    where: "m.id is not null and m.sex <> 'female'",
    detail: "'мать № ' || m.ident_number",
  },
  'birth-in-future': {
    label: 'Дата рождения в будущем',
    severity: 'fix',
    where: 'a.birth_date > now()',
    detail: "to_char(a.birth_date, 'DD.MM.YYYY')",
  },
  'no-birth-date': {
    label: 'Нет даты рождения',
    severity: 'fix',
    where: 'a.birth_date is null',
  },
  'milk-implausible': {
    label: `Удой вне правдоподобных границ (${nf(t.milkMin)}…${nf(t.milkMax)} кг)`,
    severity: 'fix',
    where:
      'a.summary_milk_yield is not null and ' +
      `(a.summary_milk_yield < ${t.milkMin} or a.summary_milk_yield > ${t.milkMax})`,
    detail: "round(a.summary_milk_yield)::text || ' кг'",
  },
  'blood-out-of-range': {
    label: 'Кровность вне диапазона 0…100 %',
    severity: 'fix',
    where: 'a.blood_percent is not null and (a.blood_percent < 0 or a.blood_percent > 100)',
    detail: "round(a.blood_percent)::text || ' %'",
  },
  'disposal-vs-state': {
    label: 'Указана причина выбытия, но животное числится в стаде',
    severity: 'fix',
    where: "a.disposal_reason_id is not null and a.state = 'alive'",
  },
  'high-inbreeding': {
    label: `Инбридинг выше ${nf(t.inbreedingHigh)} %`,
    /*
     * Существенность — из реестра проверок, а не своя. Здесь стояло
     * «на усмотрение», в реестре и в сводке — «требует исправления»,
     * и один и тот же заголовок приходил к эксперту с разным весом
     * в зависимости от того, откуда он на него посмотрел.
     */
    severity: checkSpecByCode('high-inbreeding')?.severity === 'fix' ? 'fix' : 'note',
    where: `a.inbreeding is not null and a.inbreeding > ${t.inbreedingHigh}`,
    detail: "round(a.inbreeding, 1)::text || ' %'",
  },
  'no-parents': {
    label: 'Не указан ни один родитель — ни ссылкой, ни по документам',
    severity: 'note',
    where:
      "a.father_id is null and a.mother_id is null and coalesce(a.pedigree_text_father_id, '') = '' " +
      "and coalesce(a.pedigree_text_mother_id, '') = ''",
  },
  'no-breed': {
    label: 'Не указана порода',
    severity: 'note',
    where: 'a.breed_id is null',
  },
})

/** Список записей по одному правилу. Ограничен: сводка про масштаб, список — про разбор. */
export async function drilldown(
  payload: Payload,
  code: string,
  limit = 200,
): Promise<Drilldown | null> {
  const rule = rulesFor(await resolveThresholds(payload))[code]
  if (!rule) return null

  const pool = poolOf(payload)
  if (!pool) return null

  const from = `
    from animals a
    left join animals f on f.id = a.father_id
    left join animals m on m.id = a.mother_id
    left join organizations o on o.id = a.owner_id
   where a.archived is not true and (${rule.where})
  `

  const [count, rows] = await Promise.all([
    pool.query(`select count(*) as total ${from}`),
    pool.query(`
      select a.id, a.ident_number, a.name,
             /*
              * Дата рождения — строкой, без перевода в пояс: колонку
              * типа date драйвер разбирает в полночь местного пояса,
              * toISOString переводит её в UTC и восточнее Гринвича
              * отнимает сутки. Ошибка найдена на календаре стада,
              * где та же дата в двух ячейках расходилась на день.
              */
             to_char(a.birth_date, 'YYYY-MM-DD') as birth_date,
             o.name as owner,
             ${rule.detail ?? 'null'} as detail
      ${from}
       order by a.ident_number
       limit ${Number(limit)}
    `),
  ])

  return {
    code,
    label: rule.label,
    severity: rule.severity,
    total: Number(count.rows?.[0]?.total ?? 0),
    rows: (rows.rows ?? []).map((r) => ({
      id: Number(r.id),
      identNumber: String(r.ident_number),
      name: r.name ? String(r.name) : null,
      birthDate: r.birth_date ? String(r.birth_date) : null,
      owner: r.owner ? String(r.owner) : null,
      detail: r.detail ? String(r.detail) : null,
    })),
  }
}
