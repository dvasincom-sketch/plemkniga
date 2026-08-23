import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import type { AccessScope } from '@/lib/dictionaries'
import { relId } from '@/lib/visibility'

/**
 * Ссылка на просмотр: выпуск, проверка, учёт открытий.
 *
 * Правило живёт отдельно от страниц, потому что спрашивают его двое
 * и ответы обязаны совпасть: страница со списком (`/share/<токен>`)
 * и карточка животного, открытая по той же ссылке. Разойдись они —
 * и по ссылке откроется запись, которой в ссылке нет.
 */

/**
 * Токен — 32 случайных байта в шестнадцатеричном виде.
 *
 * Он одновременно адрес и пароль, поэтому длина взята не «чтобы
 * покрасивее»: 256 бит перебирать нечем. Короткий человекочитаемый код
 * был бы удобнее в пересылке и означал бы, что чужие записи открываются
 * подбором.
 *
 * `randomBytes`, а не `Math.random`: последний предсказуем по нескольким
 * выданным значениям, и это ровно тот случай, когда предсказуемость
 * означает чужой доступ.
 */
export const newShareToken = (): string => randomBytes(32).toString('hex')

/**
 * Пределы выпуска — здесь, а не рядом с действием.
 *
 * Их спрашивает и форма (сказать до нажатия), и действие (проверить после).
 * Держать их в файле действия нельзя: `'use server'` разрешает экспортировать
 * только асинхронные функции, и обычная константа рядом с ними ломает сборку
 * целиком — модуль перестаёт экспортировать вообще что-либо. Та же ловушка
 * уже стоила одной правки (решение №74: `describeDbError` в `data.ts`),
 * и стоит она ровно там, где хочется положить константу поближе к тому,
 * кто её проверяет.
 */

/** Максимум записей в одной ссылке: больше — уже выгрузка, а не «покажу вот этих». */
export const SHARE_ANIMALS_CAP = 200

/** Предельный срок: ссылка, живущая дольше, отличается от бессрочной на бумаге. */
export const SHARE_MAX_DAYS = 365

export type ResolvedShare = {
  id: number
  owner: number | null
  animalIds: Set<number>
  scopes: Set<AccessScope>
  expiresAt: string
  note: string | null
  /** Сколько раз ссылку уже открывали — нужно, чтобы досчитать следующее. */
  opens: number
}

/**
 * Найти ссылку по токену — или ничего.
 *
 * Истёкшая и отозванная возвращают `null` наравне с несуществующей,
 * и это осознанно. Разные ответы («такой ссылки нет» против «ссылка
 * истекла») были бы подсказкой перебирающему: первый отличает
 * несуществующий токен от существующего, то есть превращает перебор
 * из бессмысленного в осмысленный. Человеку разница объясняется
 * на странице одинаковым текстом для всех трёх случаев.
 */
export async function resolveShare(
  payload: Payload,
  token: unknown,
): Promise<ResolvedShare | null> {
  if (typeof token !== 'string' || token.length < 32) return null

  const { docs } = await payload.find({
    collection: 'share-links',
    where: { token: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const link = docs[0]
  if (!link) return null
  if (link.revokedAt) return null

  const until = new Date(String(link.expiresAt))
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return null

  return {
    id: Number(link.id),
    owner: relId(link.owner),
    animalIds: new Set((link.animals ?? []).map((a) => relId(a)).filter((n): n is number => n !== null)),
    scopes: new Set((link.scopes ?? []) as AccessScope[]),
    expiresAt: String(link.expiresAt),
    note: link.note ?? null,
    opens: Number(link.opens ?? 0),
  }
}

/**
 * Отметить открытие.
 *
 * Считается только на странице списка (`/share/<токен>`), а не на каждой
 * карточке. Иначе «открытий: 47» означало бы «человек переключал вкладки»,
 * а владелец читает это число как «сколько раз ссылку смотрели».
 *
 * Ошибка проглатывается намеренно: счётчик — сведение для владельца,
 * и уронить из-за него показ записи было бы обменом важного на мелочь.
 */
export async function noteShareOpen(payload: Payload, id: number, opens: number): Promise<void> {
  try {
    await payload.update({
      collection: 'share-links',
      id,
      data: { opens: opens + 1, lastOpenedAt: new Date().toISOString() },
      overrideAccess: true,
      context: { skipJournal: true },
    })
  } catch {
    /* счётчик не стоит страницы */
  }
}

/** Текст для всех трёх случаев — нет, истекла, отозвана. Разбор в `resolveShare`. */
export const SHARE_GONE =
  'Ссылка не работает. Она могла истечь, быть отозванной хозяйством или содержать опечатку. ' +
  'За новой ссылкой обратитесь к тому, кто прислал эту.'
