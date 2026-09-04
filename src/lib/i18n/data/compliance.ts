/**
 * Реестр соответствия на шести языках: сборка словарей.
 *
 * Русский лежит в самих записях (`lib/compliance.ts`), потому что он
 * источник и стоит рядом с состояниями и доказательствами; пять остальных
 * языков — отдельными файлами `compliance.<язык>.ts`. Здесь они собираются
 * вместе, и наружу выходит одно: «дай текст позиции на этом языке».
 *
 * ## Почему страница получает функцию, а не ветку `if`
 *
 * Раньше выбор языка делала сама страница строкой `english ? …En : …`.
 * Признак «страница английская» ложен на казахской, и казахская страница
 * молча брала русскую половину пары — под переведённой рамкой оставалось
 * русское тело, и никакого отката (`pick`) при этом не происходило: данные
 * просто отдавали чужой язык, ни разу об этом не сказав.
 *
 * `pickText` отвечает на тот же вопрос одинаково для всех пяти языков:
 * есть словарь — берётся он, нет словаря — русский. Развилке в разметке
 * взяться неоткуда, а значит, неоткуда взяться и ошибке в ней.
 *
 * Подписи состояний и областей устроены проще — это готовые `Record`
 * на пять состояний и шесть областей, и словарь языка отдаётся целиком.
 * Отсутствующий язык откатывается на русский тем же правилом.
 */

import {
  AREA_HINT,
  AREA_TITLE,
  COMPLIANCE,
  STATE_HINT,
  STATE_LABEL,
  type ComplianceArea,
  type ComplianceItem,
  type ComplianceKey,
  type ComplianceState,
  type ComplianceText,
} from '@/lib/compliance'
import { pickText, type TextTables } from '@/lib/i18n/data-text'
import {
  AREA_HINT_BE,
  AREA_TITLE_BE,
  COMPLIANCE_BE,
  STATE_HINT_BE,
  STATE_LABEL_BE,
} from '@/lib/i18n/data/compliance.be'
import {
  AREA_HINT_EN,
  AREA_TITLE_EN,
  COMPLIANCE_EN,
  STATE_HINT_EN,
  STATE_LABEL_EN,
} from '@/lib/i18n/data/compliance.en'
import {
  AREA_HINT_HY,
  AREA_TITLE_HY,
  COMPLIANCE_HY,
  STATE_HINT_HY,
  STATE_LABEL_HY,
} from '@/lib/i18n/data/compliance.hy'
import {
  AREA_HINT_KK,
  AREA_TITLE_KK,
  COMPLIANCE_KK,
  STATE_HINT_KK,
  STATE_LABEL_KK,
} from '@/lib/i18n/data/compliance.kk'
import {
  AREA_HINT_KY,
  AREA_TITLE_KY,
  COMPLIANCE_KY,
  STATE_HINT_KY,
  STATE_LABEL_KY,
} from '@/lib/i18n/data/compliance.ky'
import type { Locale } from '@/lib/i18n/locales'

/**
 * Русский текст позиции — из самой записи, а не переписанный рядом.
 *
 * Второе место, где живёт тот же абзац, расходится с первым молча
 * и именно на той строке, которую правили в спешке.
 */
const asText = (item: ComplianceItem): ComplianceText => ({
  title: item.title,
  org: item.org,
  what: item.what,
  ours: item.ours,
  next: item.next,
  external: item.external,
  source: item.source?.label,
})

const RUSSIAN = new Map<ComplianceKey, ComplianceText>(
  COMPLIANCE.map((item) => [item.key, asText(item)]),
)

/* Ключа вне реестра быть не может: `ComplianceKey` и есть список его ключей. */
const russian = (key: ComplianceKey): ComplianceText => RUSSIAN.get(key)!

/** Словари языков; нужны ещё и `check:languages`, чтобы назвать недостающий. */
export const COMPLIANCE_TEXTS: TextTables<ComplianceKey, ComplianceText> = {
  en: COMPLIANCE_EN,
  kk: COMPLIANCE_KK,
  hy: COMPLIANCE_HY,
  be: COMPLIANCE_BE,
  ky: COMPLIANCE_KY,
}

/** «Ключ позиции → её текст» на нужном языке. */
export const complianceText = (locale: Locale): ((key: ComplianceKey) => ComplianceText) =>
  pickText(COMPLIANCE_TEXTS, locale, russian)

const STATE_LABELS: Partial<Record<Locale, Record<ComplianceState, string>>> = {
  en: STATE_LABEL_EN,
  kk: STATE_LABEL_KK,
  hy: STATE_LABEL_HY,
  be: STATE_LABEL_BE,
  ky: STATE_LABEL_KY,
}

const STATE_HINTS: Partial<Record<Locale, Record<ComplianceState, string>>> = {
  en: STATE_HINT_EN,
  kk: STATE_HINT_KK,
  hy: STATE_HINT_HY,
  be: STATE_HINT_BE,
  ky: STATE_HINT_KY,
}

const AREA_TITLES: Partial<Record<Locale, Record<ComplianceArea, string>>> = {
  en: AREA_TITLE_EN,
  kk: AREA_TITLE_KK,
  hy: AREA_TITLE_HY,
  be: AREA_TITLE_BE,
  ky: AREA_TITLE_KY,
}

const AREA_HINTS: Partial<Record<Locale, Record<ComplianceArea, string>>> = {
  en: AREA_HINT_EN,
  kk: AREA_HINT_KK,
  hy: AREA_HINT_HY,
  be: AREA_HINT_BE,
  ky: AREA_HINT_KY,
}

export const complianceStateLabel = (locale: Locale): Record<ComplianceState, string> =>
  STATE_LABELS[locale] ?? STATE_LABEL

export const complianceStateHint = (locale: Locale): Record<ComplianceState, string> =>
  STATE_HINTS[locale] ?? STATE_HINT

export const complianceAreaTitle = (locale: Locale): Record<ComplianceArea, string> =>
  AREA_TITLES[locale] ?? AREA_TITLE

export const complianceAreaHint = (locale: Locale): Record<ComplianceArea, string> =>
  AREA_HINTS[locale] ?? AREA_HINT
