import { NextResponse } from 'next/server'
import { ADE_COLLECTIONS, ADE_VERSION } from '@/lib/ade/core'
import {
  FEED_PAGE_DEFAULT,
  FEED_PAGE_MAX,
  decodeToken,
  isDataset,
  startToken,
  type AdeToken,
} from '@/lib/ade/datasets'
import { adeFeed } from '@/lib/ade/feed'
import { ADE_CODE, adeError, adeErrors } from '@/lib/ade/errors'
import { adeAuth } from '@/lib/ade/gate'

export const dynamic = 'force-dynamic'

/**
 * Лента изменений набора.
 *
 *   GET /ade/v1/datasets/{dataset}/changes?since={token}
 *
 * ## Как этим пользуются
 *
 * Клиент зовёт адрес без метки, получает страницу правок и метку в конце.
 * Дальше зовёт с меткой, пока страницы не станут пустыми, — и ждёт
 * до следующего раза. Метку он хранит у себя и присылает нам; ничего
 * другого о состоянии обмена мы не помним, и это осознанно: сервер,
 * помнящий, кто где остановился, обязан помнить это вечно и для каждого.
 *
 * ## Три беды с меткой и три разных ответа
 *
 * Метка не наша или испорчена — 400: продолжать по ней нельзя, а тихо
 * начать сначала значило бы отдать партнёру всю книгу под видом
 * «изменений за сутки».
 *
 * Метка нашей прежней версии — 200 и заголовок `icar-full-sync: true`.
 * Так предписано стандартом: клиент выбрасывает свою копию набора
 * и начинает с чистого листа. Дорого, но самостоятельно — а отказ
 * оставил бы обмен стоять до вмешательства человека.
 *
 * Метка от другого набора — 400. Почти всегда это склеенные ленты
 * в клиенте, и молча продолжить значило бы отдать ему чужой набор
 * с позиции, которая к нему не относится.
 *
 * ## Почему пустая лента — не 204
 *
 * «Нет изменений» отвечается двумястами и телом из контекста и метки.
 * Двести четвёртый пришлось бы отдавать без тела, то есть без метки, —
 * и клиент, не сохранивший прежнюю, начал бы сначала.
 */
export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const auth = await adeAuth(request)
  if (!auth.ok) return auth.response

  const { dataset } = await params

  if (!isDataset(dataset)) {
    return NextResponse.json(
      adeErrors(
        adeError(404, ADE_CODE.collectionUnknown, `Неизвестный набор «${dataset}»`, undefined, {
          supported: ADE_COLLECTIONS,
        }),
      ),
      { status: 404 },
    )
  }

  const url = new URL(request.url)
  const since = url.searchParams.get('since')

  let token: AdeToken = startToken(dataset)
  let fullSync = false

  if (since) {
    const read = decodeToken(since, dataset)

    if (read.ok) {
      token = read.token
    } else if (read.reason === 'version') {
      fullSync = true
    } else {
      const why =
        read.reason === 'forged'
          ? 'Метка продолжения изменена. Её содержимое выдаёт сервер, и менять его нельзя.'
          : read.reason === 'dataset'
            ? 'Метка выдана для другого набора данных. У каждой ленты своя.'
            : 'Метка продолжения не разобралась. Присылается ровно то, что пришло в поле token.'

      return NextResponse.json(
        adeErrors(adeError(400, ADE_CODE.fieldValue, 'Негодная метка продолжения', why)),
        { status: 400 },
      )
    }
  }

  const size = Number.parseInt(url.searchParams.get('pageSize') ?? '', 10)
  const pageSize = Number.isFinite(size) ? Math.min(Math.max(1, size), FEED_PAGE_MAX) : FEED_PAGE_DEFAULT

  const feed = await adeFeed(auth.payload, dataset, token, auth.orgs, pageSize)

  return NextResponse.json(feed.items, {
    headers: {
      'X-ICAR-ADE-Version': ADE_VERSION,
      'Cache-Control': 'no-store',
      /*
       * Заголовок ставится только когда он что-то значит. Постоянный
       * `icar-full-sync: false` выглядел бы безобидно, но клиенты
       * читают наличие заголовка, а не его значение, — и половина
       * из них пересинхронизировалась бы каждый раз.
       */
      ...(fullSync ? { 'icar-full-sync': 'true' } : {}),
    },
  })
}
