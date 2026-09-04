import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'

import { ALL_CHECKS, CHECK_GROUPS } from '@/lib/checks-registry'
import { checkText, checkGroupText } from '@/lib/i18n/data/checks'

import { COMPLIANCE, AREA_ORDER, STATE_ORDER } from '@/lib/compliance'
import {
  complianceText,
  complianceStateLabel,
  complianceStateHint,
  complianceAreaTitle,
  complianceAreaHint,
} from '@/lib/i18n/data/compliance'

import { ICAR_SECTIONS } from '@/lib/icar-map'
import { icarText } from '@/lib/i18n/data/icar-map'

import { TRAIT_BASE } from '@/lib/breeding-index'
import { traitText } from '@/lib/i18n/data/traits'

import { ADE_OURS, ADE_THEMES, ADE_DIR_TITLE } from '@/lib/ade-schema-map'
import { adeResourceText, adeThemeText, adeDirTitle } from '@/lib/i18n/data/ade-schema'

import { BREED_NAMES, breedName } from '@/lib/i18n/data/breeds'

/**
 * Языки витрины закрыты не наполовину.
 *
 * ## Что здесь ловится и почему этого не видит компилятор
 *
 * Данные под страницами переведены словарями (`lib/i18n/data`), полными
 * по типу: запись, заведённая без строки в словаре, не соберётся. Тип
 * закрывает главную дыру, но три другие ему не по силам.
 *
 * **Словаря нет вовсе.** Язык, добавленный в `locales.ts` сегодня,
 * переводится не в тот же час, и `pickText` честно отдаёт русский. Само
 * по себе это законно; беда начинается, когда язык объявляют вычитанным,
 * а словаря под ним нет: страница обещает перевод, показывает русский
 * и оговорки уже не ставит, потому что `reviewed: true` её снимает.
 *
 * **Строка скопирована из русского.** Полнота по типу требует значения,
 * а не перевода: `label: 'Порода не указана'` в казахском словаре
 * компилируется прекрасно. Именно так выглядит недоделанный перевод,
 * и именно его невозможно заметить глазами, не зная языка.
 *
 * **Буквы не того алфавита.** Проверка грубая и работает не для всех:
 * в армянском кириллицы не должно быть вовсе, а в белорусском нет букв
 * «и», «щ» и «ъ». Для казахского и киргизского такого признака нет —
 * они пишутся кириллицей и делят с русским почти весь алфавит, — и там
 * работает только предыдущее правило.
 *
 * ## Чем это отличается от `check:english`
 *
 * Тот смотрит на разметку страниц и на английскую ветку наборов строк:
 * ловит русский абзац, набранный прямо в разметке. Этот смотрит
 * на словари данных и на все пять языков сразу. Разные места, разные
 * беды; сливать их в одну проверку значило бы получить отчёт, в котором
 * не видно, что именно сломано.
 *
 * ## Почему падение только на вычитанных языках
 *
 * Красная строка, которую никто не собирается закрывать сегодня, за
 * неделю приучает не читать отчёт целиком. Непрочитанные языки поэтому
 * перечисляются, но не роняют проверку: их состояние честно объявлено
 * оговоркой на самой странице (`noticeFor`). Роняет только обещание,
 * которое нечем подкрепить, — `reviewed: true` без словаря или
 * с русскими строками внутри.
 *
 *   npm run check:languages
 */

const OTHERS: Locale[] = LOCALES.map((l) => l.code).filter((c) => c !== DEFAULT_LOCALE)
const isReviewed = (code: Locale): boolean => LOCALES.find((l) => l.code === code)!.reviewed

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

/**
 * Имена, одинаковые на всех языках.
 *
 * Стандарт, организация, российский нормативный акт: их не переводят
 * намеренно (`docs/lokalizatsiya.md`), и совпадение с русским здесь —
 * не недоделка, а решение. Список короткий: каждая строка в нём — это
 * место, куда проверка больше не смотрит.
 */
const SAME_EVERYWHERE = [
  'ICAR',
  'Interbull',
  'WHFF',
  'CDCB',
  'ISO',
  'W3C',
  'ГОСТ',
  'ФГИАС',
  'ВНИИплем',
  'Минсельхоз',
  'Минцифры',
  'Росстандарт',
  'ФСТЭК',
  'Росаккредитация',
  'ADE',
  'JSON',
  'XML',
  'REST',
  'OpenAPI',
  '%',
]

/**
 * Слова, которые совпадают с русскими и должны совпадать.
 *
 * Сокращения единиц: «кг» остаётся «кг» и по-казахски, и по-белорусски,
 * потому что это не слово, а обозначение. Прощается не вхождение,
 * а строка, в которой, кроме единиц и чисел, ничего и нет: порог
 * «500…25 000 кг» одинаков на всех языках, а «менее 270 дней»
 * не одинаков, хотя «кг» и «дней» тут соседи по грамматике.
 */
const UNIT_WORDS = ['кг', 'г', 'т', 'мес.', 'дн.', 'балл', 'баллы']

const words = (s: string): string[] => s.match(/[A-Za-zА-Яа-яЁё԰-֏]+\.?/g) ?? []

const excused = (s: string): boolean =>
  words(s).length === 0 ||
  words(s).every((w) => UNIT_WORDS.includes(w)) ||
  SAME_EVERYWHERE.some((name) => s.includes(name))

/* --------------------- 1. Словари данных по языкам ------------------------ */

type Probe = {
  set: string
  keys: string[]
  /** Все строки записи на этом языке: их и сравниваем с русскими. */
  text: (locale: Locale, key: string) => string[]
}

const fields = (o: Record<string, string | undefined>): string[] =>
  Object.values(o).filter((v): v is string => typeof v === 'string')

const gapKeys = ICAR_SECTIONS.flatMap((s) => s.gaps).map((g) => g.key)

const PROBES: Probe[] = [
  {
    set: 'правила проверки',
    keys: ALL_CHECKS.map((c) => c.code),
    text: (l, k) => fields(checkText(l)(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'группы правил',
    keys: CHECK_GROUPS.map((g) => g.key),
    text: (l, k) => fields(checkGroupText(l)(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'пункты соответствия',
    keys: COMPLIANCE.map((c) => c.key),
    text: (l, k) => fields(complianceText(l)(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'состояния соответствия',
    keys: STATE_ORDER,
    text: (l, k) => [complianceStateLabel(l)[k as never], complianceStateHint(l)[k as never]],
  },
  {
    set: 'области соответствия',
    keys: AREA_ORDER,
    text: (l, k) => [complianceAreaTitle(l)[k as never], complianceAreaHint(l)[k as never]],
  },
  {
    set: 'разделы ICAR',
    keys: ICAR_SECTIONS.map((s) => s.slug),
    text: (l, k) => fields(icarText(l).section(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'пробелы ICAR',
    keys: gapKeys,
    text: (l, k) => fields(icarText(l).gap(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'признаки индекса',
    keys: TRAIT_BASE.map((t) => t.key),
    text: (l, k) => fields(traitText(l)(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'ресурсы ADE',
    keys: ADE_OURS.map((r) => r.schema),
    text: (l, k) =>
      fields(adeResourceText(l)(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'темы стандарта ADE',
    keys: ADE_THEMES.map((t) => t.key),
    text: (l, k) => fields(adeThemeText(l)(k as never) as unknown as Record<string, string>),
  },
  {
    set: 'каталоги схем ADE',
    keys: Object.keys(ADE_DIR_TITLE),
    text: (l, k) => [adeDirTitle(l)(k as never)],
  },
  {
    set: 'имена пород',
    keys: Object.keys(BREED_NAMES.en ?? {}),
    text: (l, k) => [breedName(l)(k)],
  },
]

console.log('Словари данных по языкам')

for (const locale of OTHERS) {
  const reviewed = isReviewed(locale)
  let copied = 0
  const examples: string[] = []

  for (const probe of PROBES) {
    for (const key of probe.keys) {
      const ru = probe.text(DEFAULT_LOCALE, key)
      const mine = probe.text(locale, key)

      for (let i = 0; i < ru.length; i += 1) {
        const a = ru[i]
        const b = mine[i]
        if (a === undefined || b === undefined) continue
        if (a !== b || excused(a)) continue

        copied += 1
        if (examples.length < 3) examples.push(`${probe.set} → ${key}: ${a.slice(0, 60)}`)
      }
    }
  }

  const line = `${locale}: строк, совпавших с русскими, — ${copied}`
  if (copied === 0) console.log(`  ✓ ${line}`)
  else if (reviewed) fail(`${line} (язык объявлен вычитанным)`)
  else console.log(`  · ${line}`)

  for (const e of examples) console.log(`      ${e}`)
}

/* ------------------- 2. Наборы строк страниц по языкам -------------------- */

/**
 * Длинные тексты страниц (`Translated<T>`) языка не требуют: неполнота
 * там законна и видна читателю оговоркой. Требуется другое — чтобы
 * вычитанный язык не оказался среди пропущенных.
 */
const TEXT_DIR = 'src/lib'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return name.endsWith('.ts') ? [full] : []
  })

let sets = 0

for (const file of walk(TEXT_DIR)) {
  const src = readFileSync(file, 'utf8')
  if (!/Translated</.test(src)) continue
  if (file.endsWith('translated.ts')) continue

  sets += 1

  /*
     Ищется объявление набора, а не разбор всего файла: у наборов
     единообразный хвост `= { ru: RU, en: EN, … }`, и этого хватает,
     чтобы увидеть пропущенный язык. Разбирать TypeScript ради списка
     из шести ключей было бы дороже пользы.
  */
  const at = src.search(/:\s*Translated<[^>]*>\s*=\s*\{/)
  if (at === -1) continue
  const body = src.slice(at, src.indexOf('\n}', at))

  const missing = LOCALES.map((l) => l.code).filter((c) => !new RegExp(`\\b${c}:`).test(body))
  if (missing.length === 0) continue

  const broken = missing.filter((c) => isReviewed(c))
  if (broken.length > 0) fail(`${file} — нет вычитанных языков: ${broken.join(', ')}`)
  else console.log(`  · ${file} — нет языков: ${missing.join(', ')}`)
}

console.log(`\nНаборов текстов страниц: ${sets}`)

/* ----------------------- 3. Буквы не того алфавита ------------------------ */

/**
 * Признак чужого алфавита есть не у всякого языка.
 *
 * Армянский пишется своим письмом, и не переведена та его строка, где
 * есть кириллица и нет ни одной армянской буквы. Оба условия нужны.
 * Русское название приказа посреди армянской фразы стоит там
 * по решению (`docs/lokalizatsiya.md`), и запрещать его значило бы
 * требовать выдуманного перевода, — а имя раздела руководства ICAR
 * («General Rules») и адрес вики кириллицы не содержат вовсе
 * и переводу не подлежат.
 *
 * У белорусского своего письма нет, но есть буквы, которых в его
 * алфавите не бывает: «и», «щ», «ъ». Оговорка та же — строка, где рядом
 * стоят «і» или «ў», белорусская, и русское слово внутри неё пришло
 * из имени собственного.
 *
 * Казахского и киргизского здесь нет намеренно: они делят с русским
 * почти весь алфавит, и любой признак такого рода дал бы ложные
 * срабатывания на каждом втором слове. Для них работает сравнение
 * с русским выше — и только оно.
 */
const ALIEN: Partial<Record<Locale, (s: string) => boolean>> = {
  hy: (s) => /[А-Яа-яЁё]/.test(s) && !/[԰-֏]/.test(s),
  be: (s) => /[ищъИЩЪ]/.test(s) && !/[іўІЎ]/.test(s),
}

for (const [locale, alien] of Object.entries(ALIEN) as [Locale, (s: string) => boolean][]) {
  let hits = 0
  const examples: string[] = []

  for (const probe of PROBES) {
    for (const key of probe.keys) {
      for (const s of probe.text(locale, key)) {
        if (excused(s) || !alien(s)) continue
        hits += 1
        if (examples.length < 3) examples.push(`${probe.set} → ${key}: ${s.slice(0, 60)}`)
      }
    }
  }

  const line = `${locale}: строк с буквами чужого алфавита — ${hits}`
  if (hits === 0) console.log(`  ✓ ${line}`)
  else if (isReviewed(locale)) fail(`${line} (язык объявлен вычитанным)`)
  else console.log(`  · ${line}`)

  for (const e of examples) console.log(`      ${e}`)
}

console.log(
  failures === 0
    ? '\n  ✓ обещанные языки подкреплены словарями'
    : `\n  ✗ языков с необеспеченным обещанием: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
