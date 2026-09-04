import { TRAIT_BASE, type TraitKey } from '@/lib/breeding-index'
import { pickText, type TextTable, type TextTables } from '@/lib/i18n/data-text'
import type { Locale } from '@/lib/i18n/locales'
import { TRAITS_EN } from '@/lib/i18n/data/traits.en'
import { TRAITS_KK } from '@/lib/i18n/data/traits.kk'
import { TRAITS_HY } from '@/lib/i18n/data/traits.hy'
import { TRAITS_BE } from '@/lib/i18n/data/traits.be'
import { TRAITS_KY } from '@/lib/i18n/data/traits.ky'

/**
 * Названия признаков и единицы измерения на всех языках витрины.
 *
 * Русский лежит не здесь, а в самой записи `TRAIT_BASE`: он источник,
 * и стоит он там, где стоят σ, наследуемость и путь к оценке, — то есть
 * там, где о признаке думают. Каждый другой язык — отдельный словарь
 * `traits.<язык>.ts`, полный по типу: признак, добавленный в базу без
 * перевода, не соберётся ни на одном из пяти языков. Раньше эту работу
 * делала пара полей `labelEn` и `unitEn` рядом с русским названием, и
 * делала только для английского; страница выбирала половину пары
 * признаком `english`, ложным на казахском, армянском, белорусском
 * и киргизском, — разбор решения целиком в шапке `i18n/data-text.ts`.
 *
 * Четыре языка, кроме английского, добавлены переводом без вычитки
 * носителем: признак `reviewed` у них снят в `i18n/locales.ts`, и над
 * текстом страницы стоит оговорка.
 *
 * ## Где смотреть
 *
 * `src/app/(frontend)/site/[locale]/economics/page.tsx` — таблица весов
 * экономического профиля, единственное место витрины, где эти названия
 * показываются на языке читателя. Разборы в `site/[locale]/razbory`
 * написаны по-русски целиком и берут название прямо из записи.
 */

export type TraitText = { label: string; unit: string }

/** Словарь одного языка: перевод обязателен для каждого признака базы. */
export type TraitTexts = TextTable<TraitKey, TraitText>

export const TRAIT_TEXTS: TextTables<TraitKey, TraitText> = {
  en: TRAITS_EN,
  kk: TRAITS_KK,
  hy: TRAITS_HY,
  be: TRAITS_BE,
  ky: TRAITS_KY,
}

const BY_KEY = new Map(TRAIT_BASE.map((t) => [t.key, t]))

const russian = (key: TraitKey): TraitText => {
  const trait = BY_KEY.get(key)
  return { label: trait?.label ?? key, unit: trait?.unit ?? '' }
}

/** Название и единица признака на нужном языке; русский — прямо из записи. */
export const traitText = (locale: Locale): ((key: TraitKey) => TraitText) =>
  pickText(TRAIT_TEXTS, locale, russian)
