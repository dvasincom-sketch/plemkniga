import {
  ADE_DIR_TITLE,
  ADE_OURS,
  ADE_THEMES,
  type AdeResourceName,
  type AdeResourceText,
  type AdeSchemaDir,
  type AdeThemeKey,
  type AdeThemeText,
} from '@/lib/ade-schema-map'
import { pickText, type TextTables } from '@/lib/i18n/data-text'
import type { Locale } from '@/lib/i18n/locales'
import { ADE_DIRS_BE, ADE_RESOURCES_BE, ADE_THEMES_BE } from '@/lib/i18n/data/ade-schema.be'
import { ADE_DIRS_EN, ADE_RESOURCES_EN, ADE_THEMES_EN } from '@/lib/i18n/data/ade-schema.en'
import { ADE_DIRS_HY, ADE_RESOURCES_HY, ADE_THEMES_HY } from '@/lib/i18n/data/ade-schema.hy'
import { ADE_DIRS_KK, ADE_RESOURCES_KK, ADE_THEMES_KK } from '@/lib/i18n/data/ade-schema.kk'
import { ADE_DIRS_KY, ADE_RESOURCES_KY, ADE_THEMES_KY } from '@/lib/i18n/data/ade-schema.ky'

/**
 * Подписи карты схем ICAR на пяти языках, собранные над русским
 * оригиналом.
 *
 * Русский лежит в самой карте (`ade-schema-map.ts`) рядом с ключевыми
 * словами разбора и числами: он источник, и уносить его отсюда значило
 * бы завести второе место, где живёт то же самое. Английский вычитан,
 * остальные четыре — казахский, армянский, белорусский и киргизский —
 * добавлены переводом, носитель языка их не читал, и над таблицей
 * об этом сказано оговоркой.
 *
 * Ключи здесь закрыты — имя схемы, ключ темы, имя каталога, — и это
 * и есть та самая полнота, ради которой раньше стояли парные поля
 * `titleEn`: ресурс, добавленный без перевода, не соберётся. Теперь
 * это верно про все пять языков, а не про один английский.
 *
 * Само имя схемы не переводится ни на одном языке: `icarAnimalCoreResource`
 * это идентификатор стандарта, по которому ищут в его репозитории,
 * и «икарЖивотное» не нашлось бы ни поиском, ни глазами.
 */
const RESOURCES: TextTables<AdeResourceName, AdeResourceText> = {
  en: ADE_RESOURCES_EN,
  kk: ADE_RESOURCES_KK,
  hy: ADE_RESOURCES_HY,
  be: ADE_RESOURCES_BE,
  ky: ADE_RESOURCES_KY,
}

const THEMES: TextTables<AdeThemeKey, AdeThemeText> = {
  en: ADE_THEMES_EN,
  kk: ADE_THEMES_KK,
  hy: ADE_THEMES_HY,
  be: ADE_THEMES_BE,
  ky: ADE_THEMES_KY,
}

const DIRS: TextTables<AdeSchemaDir, string> = {
  en: ADE_DIRS_EN,
  kk: ADE_DIRS_KK,
  hy: ADE_DIRS_HY,
  be: ADE_DIRS_BE,
  ky: ADE_DIRS_KY,
}

/** Русская сторона: она живёт в самой карте, здесь только разобрана по ключу. */
const RESOURCES_RU = new Map(ADE_OURS.map((r) => [r.schema, { title: r.title, what: r.what }]))
const THEMES_RU = new Map(ADE_THEMES.map((t) => [t.key, { title: t.title, why: t.why }]))

/*
 * Русская сторона полна по построению — обе карты собраны из тех же
 * списков, по которым объявлены ключи. Но `Map.get` об этом не знает,
 * и молчаливый `undefined` доехал бы до страницы пустой ячейкой.
 */
const missing = (key: string): never => {
  throw new Error(`В карте схем ICAR нет записи «${key}»`)
}

/** Имя и содержание нашего ресурса на языке показа. */
export const adeResourceText = (locale: Locale): ((schema: AdeResourceName) => AdeResourceText) =>
  pickText(RESOURCES, locale, (schema) => RESOURCES_RU.get(schema) ?? missing(schema))

/** Имя темы стандарта и причина, по которой её в книге нет. */
export const adeThemeText = (locale: Locale): ((key: AdeThemeKey) => AdeThemeText) =>
  pickText(THEMES, locale, (key) => THEMES_RU.get(key) ?? missing(key))

/** Заголовок группы схем: `Ресурсы`, `Типы`, `Перечисления`, `Коллекции`. */
export const adeDirTitle = (locale: Locale): ((dir: AdeSchemaDir) => string) =>
  pickText(DIRS, locale, (dir) => ADE_DIR_TITLE[dir])
