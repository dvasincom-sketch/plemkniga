import type { Payload, Where } from 'payload'
import type { AdeCollectionName } from '@/lib/ade/core'
import { ADE_SOURCE } from '@/lib/ade/core'
import { adeMapDocs, allowedLocations } from '@/lib/ade/serve'
import {
  FEED_CONTEXT,
  FEED_PAGE_DEFAULT,
  FEED_PAGE_MAX,
  TOKEN_VERSION,
  type AdeToken,
  type Cursor,
  encodeToken,
  feedContinuation,
} from '@/lib/ade/datasets'
import type { User } from '@/payload-types'

/**
 * Лента изменений: что в книге появилось, исправилось и исчезло.
 *
 * ## Почему порядок — по времени правки, а не по номеру
 *
 * Выборка по локациям идёт по номеру записи, и это верно для неё: она
 * отвечает на вопрос «что есть сейчас». Лента отвечает на другой —
 * «что изменилось», и запись, исправленная сегодня, обязана приехать
 * заново, хотя номер у неё старый. Номер как порядок означал бы, что
 * исправление отёла двухлетней давности партнёр не увидит никогда.
 *
 * ## Почему в метке две позиции, а не одна
 *
 * Живые записи и надгробия удалённых лежат в разных таблицах, и номера
 * у них свои. Общая позиция вида «время + номер» на два потока
 * не работает: номер 500 в одной таблице ничего не говорит о другой.
 * Поэтому позиции две, каждая двигается по своему потоку, а порядок
 * выдачи — общий, по времени.
 *
 * ## Почему выбирается с запасом, а отдаётся меньше
 *
 * Из двух потоков берётся по полной странице, они сливаются по времени,
 * и наружу уходит первая сотня. Остаток отбрасывается — не из
 * расточительности, а потому что иначе позицию некуда записать: отдав
 * половину слитого списка, мы обязаны запомнить, где остановились
 * в каждом потоке по отдельности.
 *
 * ## Почему запись, изменённая дважды, приезжает один раз
 *
 * Лента отдаёт не историю правок, а последнее состояние записи —
 * так и предписано стандартом: «the latest representation of a resource».
 * Клиенту не нужно знать, что запись правили трижды; ему нужно, чтобы
 * его копия сошлась с нашей.
 */

export type FeedPage = {
  items: unknown[]
  token: string
  /** Отдано ли всё, что было на момент запроса. */
  drained: boolean
}

type Row = { at: string; id: number; kind: 'r' | 'x'; doc: Record<string, unknown> }

const iso = (v: unknown): string =>
  typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : ''

/**
 * Условие «строго после позиции».
 *
 * Пара «время + номер» вместо одного времени — не перестраховка.
 * Правки, попавшие в одну миллисекунду, при отборе только по времени
 * либо потерялись бы (строгое «позже»), либо возвращались бы вечно
 * (нестрогое). Обе беды тихие: в первой партнёр теряет запись, во второй
 * лента никогда не пустеет.
 */
const after = (field: string, c: Cursor): Where => ({
  or: [
    { [field]: { greater_than: c.t } },
    { and: [{ [field]: { equals: c.t } }, { id: { greater_than: c.i } }] },
  ],
})

/**
 * Хозяйства, чьи правки этот клиент вправе видеть.
 *
 * Тот же ответ, что и у выборки по локациям, и это важно: два способа
 * обмена не должны открывать разное. Лента лишь избавляет клиента
 * от необходимости перечислять хозяйства — но не от прав.
 */
export const feedLocations = (payload: Payload, user: User) => allowedLocations(payload, user)

const SOURCE_OF: Record<AdeCollectionName, string> = {
  animals: 'animals',
  'test-day-results': 'milk-tests',
  parturitions: 'calvings',
  inseminations: 'inseminations',
  'type-classifications': 'animal-exteriors',
  weights: 'weighings',
  'breeding-values': 'index-values',
  'pregnancy-checks': 'inseminations',
  arrivals: 'movements',
  departures: 'movements',
  deaths: 'movements',
}

/**
 * Отбор по хозяйствам для ленты.
 *
 * У выборки по локациям хозяйство одно и приходит из адреса; здесь их
 * список, и условие поэтому `in`, а не `equals`. Пустой список означает
 * «ни одного» — и обязан отдавать пусто, а не всё: `in: []` в некоторых
 * прочтениях вырождается в отсутствие условия, и это ровно та ошибка,
 * после которой партнёр видит чужие стада.
 */
const ownerIn = (dataset: AdeCollectionName, orgs: number[]): Where => {
  if (dataset === 'animals') return { owner: { in: orgs } }
  if (dataset === 'breeding-values') return { owner: { in: orgs } }
  if (dataset === 'arrivals') return { to: { in: orgs } }
  if (dataset === 'departures' || dataset === 'deaths') return { from: { in: orgs } }
  return { 'animal.owner': { in: orgs } }
}

/** Дополнительные условия набора: то же, что при выдаче по локации. */
const kindWhere = (dataset: AdeCollectionName): Where[] =>
  dataset === 'deaths'
    ? [{ kind: { equals: 'death' } }]
    : dataset === 'arrivals' || dataset === 'departures'
      ? [{ kind: { not_equals: 'death' } }]
      : dataset === 'pregnancy-checks'
        ? [{ pregnancyCheckDate: { exists: true } }]
        : dataset === 'parturitions'
          ? [{ or: [{ eventType: { equals: 'calving' } }, { eventType: { exists: false } }] }]
          : []

export async function adeFeed(
  payload: Payload,
  dataset: AdeCollectionName,
  token: AdeToken,
  orgs: number[],
  pageSize = FEED_PAGE_DEFAULT,
): Promise<FeedPage> {
  const limit = Math.min(Math.max(1, pageSize), FEED_PAGE_MAX)

  /*
   * Ни одного доступного хозяйства — пустая лента с той же меткой.
   * Не отказ: право могло появиться позже, и клиент, вернувшийся
   * через час, должен продолжить с того же места, а не начинать заново.
   */
  if (orgs.length === 0) {
    const same = encodeToken(token)
    return { items: [FEED_CONTEXT, feedContinuation(same)], token: same, drained: true }
  }

  const depth = dataset === 'pregnancy-checks' ? 2 : 1

  const live = await payload.find({
    collection: SOURCE_OF[dataset] as never,
    where: { and: [ownerIn(dataset, orgs), ...kindWhere(dataset), after('updatedAt', token.r)] },
    sort: ['updatedAt', 'id'],
    limit,
    depth,
    overrideAccess: true,
  })

  const gone = await payload.find({
    collection: 'ade-tombstones',
    where: {
      and: [
        { dataset: { equals: dataset } },
        after('deletedAt', token.x),
        /*
         * Надгробие без хозяйства видно всем, у кого есть доступ
         * к обмену: скрыть удаление дороже, чем показать лишний
         * идентификатор (`collections/AdeTombstones.ts`).
         */
        { or: [{ location: { in: orgs } }, { location: { exists: false } }] },
      ],
    },
    sort: ['deletedAt', 'id'],
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const rows: Row[] = [
    ...live.docs.map((d) => {
      const doc = d as unknown as Record<string, unknown>
      return { at: iso(doc.updatedAt), id: Number(doc.id), kind: 'r' as const, doc }
    }),
    ...gone.docs.map((d) => {
      const doc = d as unknown as Record<string, unknown>
      return { at: iso(doc.deletedAt), id: Number(doc.id), kind: 'x' as const, doc }
    }),
  ].sort((a, b) => (a.at === b.at ? a.id - b.id : a.at < b.at ? -1 : 1))

  const taken = rows.slice(0, limit)

  /*
   * Позиция двигается по последней **отданной** строке каждого потока.
   * Двигать её по последней прочитанной значило бы перескочить через
   * остаток, который в эту страницу не поместился, — и партнёр потерял
   * бы записи, ничего об этом не узнав.
   */
  const next: AdeToken = {
    v: TOKEN_VERSION,
    d: dataset,
    r: { ...token.r },
    x: { ...token.x },
  }

  for (const row of taken) {
    const c = row.kind === 'r' ? next.r : next.x
    c.t = row.at
    c.i = row.id
  }

  const liveDocs = taken.filter((r) => r.kind === 'r').map((r) => r.doc)
  const mapped = adeMapDocs(dataset, liveDocs)

  /*
   * Отображение может отбросить запись — событие без животного,
   * взвешивание без веса. Порядок при этом сохраняется, а число нет,
   * и восстанавливать соответствие «строка ленты — ресурс» здесь незачем:
   * удаления вставляются отдельно, по своему признаку.
   */
  const items: unknown[] = [FEED_CONTEXT]
  let m = 0

  for (const row of taken) {
    if (row.kind === 'x') {
      items.push({
        resourceType: 'icarResource',
        meta: {
          source: ADE_SOURCE,
          sourceId: String(row.doc.sourceId),
          modified: row.at,
          isDeleted: true,
        },
      })
    } else if (m < mapped.length) {
      items.push(mapped[m++])
    }
  }

  items.push(feedContinuation(encodeToken(next)))

  return { items, token: encodeToken(next), drained: taken.length === 0 }
}
