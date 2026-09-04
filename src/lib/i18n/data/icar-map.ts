import { pickText, type TextTable, type TextTables } from '@/lib/i18n/data-text'
import type { Locale } from '@/lib/i18n/locales'
import {
  ICAR_SECTIONS,
  ICAR_STATE_LABEL,
  type IcarGapKey,
  type IcarSlug,
  type IcarState,
} from '@/lib/icar-map'
import { ICAR_MAP_EN } from '@/lib/i18n/data/icar-map.en'
import { ICAR_MAP_KK } from '@/lib/i18n/data/icar-map.kk'
import { ICAR_MAP_HY } from '@/lib/i18n/data/icar-map.hy'
import { ICAR_MAP_BE } from '@/lib/i18n/data/icar-map.be'
import { ICAR_MAP_KY } from '@/lib/i18n/data/icar-map.ky'

/**
 * Сборка переводов карты ICAR: словари пяти языков и выбор нужного.
 *
 * ## Почему страница больше не выбирает язык сама
 *
 * Выбирала она его строкой `english ? r.titleEn : r.title`, и на четырёх
 * языках из шести признак `english` ложен: казахская таблица показывала
 * русские названия разделов под казахской рамкой, а на странице пробелов
 * так оставалось русским почти всё её тело. Здесь страница спрашивает
 * язык один раз и дальше просто печатает поля; развилки, в которой
 * ошибка и жила, больше нет.
 *
 * ## Почему английский лежит рядом с остальными
 *
 * Английский — такой же перевод, как казахский, и особого положения
 * у него нет. Пока он стоял парами полей внутри `icar-map.ts`, у страниц
 * оставалась та самая тернарная развилка, а у четырёх языков — русский
 * текст. Формулировки перенесены дословно: они вычитаны.
 *
 * ## Что здесь не проверяется
 *
 * Полноту словаря проверяет тип: раздел или пробел, заведённый без строки
 * в словаре, не соберётся. Отсутствие словаря целиком тип поймать не может
 * — это дело `check:languages` (см. `missingLocales` в `i18n/data-text.ts`),
 * и потому таблица разделов отдана наружу.
 */

export type IcarSectionText = {
  title: string
  about: string
  ours: string
}

export type IcarGapText = {
  what: string
  why: string
  need: string
}

/** Всё, что нужно двум страницам про ICAR на одном языке. */
export type IcarMapText = {
  sections: TextTable<IcarSlug, IcarSectionText>
  gaps: TextTable<IcarGapKey, IcarGapText>
  states: Record<IcarState, string>
}

const TEXT: Partial<Record<Locale, IcarMapText>> = {
  en: ICAR_MAP_EN,
  kk: ICAR_MAP_KK,
  hy: ICAR_MAP_HY,
  be: ICAR_MAP_BE,
  ky: ICAR_MAP_KY,
}

/*
 * Словарь на язык хранится одним куском — его так отдают носителю
 * и так же принимают обратно, — а `pickText` работает с таблицей на набор
 * ключей. Здесь один вид превращается в другой, и делается это трижды,
 * а не трижды переписывается список языков.
 */
const tablesOf = <K extends string, T>(
  field: (text: IcarMapText) => TextTable<K, T>,
): TextTables<K, T> =>
  Object.fromEntries(
    Object.entries(TEXT).map(([locale, text]) => [locale, field(text)]),
  ) as TextTables<K, T>

/** Разделы по языкам. Отдано наружу ради `check:languages`. */
export const ICAR_SECTION_TABLES = tablesOf((t) => t.sections)

const GAP_TABLES = tablesOf((t) => t.gaps)
const STATE_TABLES = tablesOf<IcarState, string>((t) => t.states)

/*
 * Русский собирается из самих записей, а не лежит шестым словарём:
 * он там же, где номера разделов и адреса вики, и правится вместе с ними.
 */
const RU_SECTIONS = Object.fromEntries(
  ICAR_SECTIONS.map((s) => [s.slug, { title: s.title, about: s.about, ours: s.ours }]),
) as TextTable<IcarSlug, IcarSectionText>

const RU_GAPS = Object.fromEntries(
  ICAR_SECTIONS.flatMap((s) => s.gaps).map((g) => [
    g.key,
    { what: g.what, why: g.why, need: g.need },
  ]),
) as TextTable<IcarGapKey, IcarGapText>

export type IcarText = {
  section: (slug: IcarSlug) => IcarSectionText
  gap: (key: IcarGapKey) => IcarGapText
  state: (state: IcarState) => string
}

/**
 * Слова карты на нужном языке.
 *
 * Язык сюда передают тот, на котором показан текст страницы
 * (`pick(...).shown`), а не тот, что стоит в адресе: где текст откатился
 * на русский, разборы разделов должны откатиться вместе с ним, иначе
 * на одной странице окажется два языка.
 */
export const icarText = (locale: Locale): IcarText => ({
  section: pickText(ICAR_SECTION_TABLES, locale, (slug) => RU_SECTIONS[slug]),
  gap: pickText(GAP_TABLES, locale, (key) => RU_GAPS[key]),
  state: pickText(STATE_TABLES, locale, (state) => ICAR_STATE_LABEL[state]),
})
