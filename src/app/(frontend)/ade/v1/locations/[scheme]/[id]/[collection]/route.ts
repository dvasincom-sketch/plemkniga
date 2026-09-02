import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'
import { ADE_VERSION } from '@/lib/ade/core'
import {
  ADE_COLLECTIONS,
  allowedLocations,
  isAdeCollection,
  parseAdeQuery,
  parseLocation,
  serveAdeCollection,
} from '@/lib/ade/serve'
import { adeUser } from '@/lib/ade/auth'

export const dynamic = 'force-dynamic'

/**
 * Location-centric API стандарта ICAR ADE.
 *
 *   GET /ade/v1/locations/{scheme}/{id}/{collection}
 *
 * Ровно тот шаблон адреса, который задан спецификацией: локация парой
 * «схема + идентификатор», дальше имя коллекции. Отличие одно — префикс
 * `/ade/v1` вместо корня, и он вынужденный: `/api/*` целиком занят Payload,
 * разбор в `lib/ade/core.ts`.
 *
 * ## Что здесь важнее всего не перепутать
 *
 * Локация в адресе говорит, **о каком** хозяйстве спрашивают. Право
 * ответить берётся из того, **кто** спрашивает. Свести эти два вопроса
 * в один — открыть чужое стадо подстановкой номера в адрес.
 *
 * Поэтому порядок такой: сначала опознать пользователя, потом спросить,
 * какие локации ему разрешены, и только потом сверить с адресом. Отказ
 * при этом одинаковый и для «нет такого хозяйства», и для «есть,
 * но не ваше»: разные ответы позволили бы перебором узнать, какие
 * хозяйства существуют.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ scheme: string; id: string; collection: string }> },
) {
  const { scheme, id, collection } = await params

  if (!isAdeCollection(collection)) {
    return NextResponse.json(
      {
        resourceType: 'icarResponseMessageResource',
        severity: 'Error',
        message: `Неизвестная коллекция «${collection}»`,
        supported: ADE_COLLECTIONS,
      },
      { status: 404 },
    )
  }

  const payload = await getClient()
  const user = await adeUser(request, payload)

  if (!user) {
    return NextResponse.json(
      {
        resourceType: 'icarResponseMessageResource',
        severity: 'Error',
        message: 'Требуется авторизация: заголовок Authorization: JWT <токен>',
      },
      { status: 401 },
    )
  }

  const orgId = parseLocation(decodeURIComponent(scheme), decodeURIComponent(id))
  const allowed = orgId === null ? [] : await allowedLocations(payload, user)

  if (orgId === null || !allowed.includes(orgId)) {
    return NextResponse.json(
      {
        resourceType: 'icarResponseMessageResource',
        severity: 'Error',
        message: 'Локация не найдена или недоступна',
      },
      { status: 404 },
    )
  }

  const query = parseAdeQuery(new URL(request.url))
  const body = await serveAdeCollection(payload, collection, orgId, query)

  return NextResponse.json(body, {
    headers: {
      'Content-Type': 'application/json',
      /*
       * Версия стандарта — заголовком, а не в теле. Потребитель должен
       * узнать её до разбора ответа: если завтра выйдет ADE 2.0, где
       * `meta` станет обязательным, различать наши ответы придётся
       * именно по этому заголовку.
       */
      'X-ICAR-ADE-Version': ADE_VERSION,
      /* Обмен — не кэшируемая витрина: отдаём то, что в книге сейчас. */
      'Cache-Control': 'no-store',
    },
  })
}
