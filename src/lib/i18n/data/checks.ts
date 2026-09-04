import {
  ALL_CHECKS,
  CHECK_GROUPS,
  type CheckCode,
  type CheckGroup,
  type CheckGroupText,
  type CheckText,
} from '@/lib/checks-registry'
import { pickText, type TextTable, type TextTables } from '@/lib/i18n/data-text'
import type { Locale } from '@/lib/i18n/locales'
import { CHECKS_EN, CHECK_GROUPS_EN } from '@/lib/i18n/data/checks.en'
import { CHECKS_KK, CHECK_GROUPS_KK } from '@/lib/i18n/data/checks.kk'
import { CHECKS_HY, CHECK_GROUPS_HY } from '@/lib/i18n/data/checks.hy'
import { CHECKS_BE, CHECK_GROUPS_BE } from '@/lib/i18n/data/checks.be'
import { CHECKS_KY, CHECK_GROUPS_KY } from '@/lib/i18n/data/checks.ky'

/**
 * Слова правил проверки на всех языках витрины.
 *
 * Русский лежит не здесь, а в самом реестре (`checks-registry.ts`): он
 * источник, и стоит он там, где стоят пороги, коды и рассуждения о том,
 * почему граница именно такая. Каждый другой язык — отдельный словарь
 * `checks.<язык>.ts`, полный по типу. Разбор решения целиком — в шапке
 * `i18n/data-text.ts`; коротко: пара полей `label` / `labelEn` работала,
 * пока языков было два, а на шести заставляла страницу выбирать язык
 * руками признаком `english`, ложным на остальных четырёх.
 *
 * Четыре языка, кроме английского, добавлены переводом без вычитки
 * носителем: признак `reviewed` у них снят в `i18n/locales.ts`, и над
 * текстом страницы стоит оговорка.
 *
 * ## Что стало с порогом
 *
 * Порог есть не у всякого правила, и в `CheckText` он поэтому
 * необязателен. Сам по себе такой тип разрешил бы и потерять границу
 * при переводе, и придумать её там, где по-русски её нет; первое
 * не выглядит поломкой — карточка просто теряет строку с числом.
 *
 * Но словарь языка типизируется не `CheckText`, а `CheckTexts`, и там
 * необязательность снята по каждому правилу отдельно: коды с границей
 * выведены из самого реестра (`ThresholdCheckCode`), у них порог
 * обязателен, у прочих запрещён. Гарантия, которую раньше держало
 * размеченное объединение `threshold` / `thresholdEn`, при переезде
 * не ослабла, а усилилась: она стала верна про все пять языков, а не про
 * один английский.
 *
 * Чего тип по-прежнему не видит — отсутствия словаря целиком: язык,
 * добавленный в `locales.ts` сегодня, переводится не в тот же час. Это
 * законное состояние, и называет его `check:languages`, а не сборка.
 *
 * ## Где смотреть
 *
 * `src/app/(frontend)/site/[locale]/rules/page.tsx` — каталог правил
 * витрины, единственное место, где эти слова показываются читателю.
 */

export const CHECK_TABLES: TextTables<CheckCode, CheckText> = {
  en: CHECKS_EN,
  kk: CHECKS_KK,
  hy: CHECKS_HY,
  be: CHECKS_BE,
  ky: CHECKS_KY,
}

export const CHECK_GROUP_TABLES: TextTables<CheckGroup, CheckGroupText> = {
  en: CHECK_GROUPS_EN,
  kk: CHECK_GROUPS_KK,
  hy: CHECK_GROUPS_HY,
  be: CHECK_GROUPS_BE,
  ky: CHECK_GROUPS_KY,
}

/*
 * Русский собирается из самих записей, а не лежит шестым словарём: иначе
 * правило пришлось бы править в двух местах, и однажды его поправили бы
 * в одном.
 */
const RU_CHECKS = Object.fromEntries(
  ALL_CHECKS.map((c) => [
    c.code,
    { label: c.label, what: c.what, why: c.why, threshold: c.threshold },
  ]),
) as TextTable<CheckCode, CheckText>

const RU_GROUPS = Object.fromEntries(
  CHECK_GROUPS.map((g) => [g.key, { label: g.label, intro: g.intro }]),
) as TextTable<CheckGroup, CheckGroupText>

/**
 * Слова правила на нужном языке; русский — прямо из реестра.
 *
 * Язык сюда передают тот, на котором показан текст страницы
 * (`pick(...).shown`), а не тот, что стоит в адресе: где текст откатился
 * на русский, правила должны откатиться вместе с ним — иначе на одной
 * странице окажется два языка.
 */
export const checkText = (locale: Locale): ((code: CheckCode) => CheckText) =>
  pickText(CHECK_TABLES, locale, (code) => RU_CHECKS[code])

/** То же для названий и подводок групп правил. */
export const checkGroupText = (locale: Locale): ((group: CheckGroup) => CheckGroupText) =>
  pickText(CHECK_GROUP_TABLES, locale, (group) => RU_GROUPS[group])
