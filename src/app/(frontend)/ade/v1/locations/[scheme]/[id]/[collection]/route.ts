import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'
import { ADE_SOURCE, ADE_VERSION } from '@/lib/ade/core'
import {
  ADE_COLLECTIONS,
  allowedLocations,
  isAdeCollection,
  parseAdeQuery,
  parseLocation,
  serveAdeCollection,
} from '@/lib/ade/serve'
import { adeUser } from '@/lib/ade/auth'
import { acceptAdeResource } from '@/lib/ade/accept'
import { ADE_READ_ONLY_REASON, ADE_WRITABLE, isAdeWritable } from '@/lib/ade/parse'
import { ADE_CODE, adeError, adeErrors } from '@/lib/ade/errors'

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
      adeErrors(
        adeError(404, ADE_CODE.collectionUnknown, `Неизвестная коллекция «${collection}»`, undefined, {
          supported: ADE_COLLECTIONS,
        }),
      ),
      { status: 404 },
    )
  }

  const payload = await getClient()
  const user = await adeUser(request, payload)

  if (!user) {
    return NextResponse.json(
      adeErrors(
        adeError(
          401,
          ADE_CODE.unauthorized,
          'Требуется авторизация',
          'Заголовок Authorization: JWT <токен> или Bearer <токен>.',
        ),
      ),
      { status: 401 },
    )
  }

  const orgId = parseLocation(decodeURIComponent(scheme), decodeURIComponent(id))
  const allowed = orgId === null ? [] : await allowedLocations(payload, user)

  if (orgId === null || !allowed.includes(orgId)) {
    return NextResponse.json(
      adeErrors(adeError(404, ADE_CODE.locationForbidden, 'Локация не найдена или недоступна')),
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

/**
 * Приём данных.
 *
 *   POST /ade/v1/locations/{scheme}/{id}/{collection}
 *
 * ## Что принимается и что нет
 *
 * События у животных, уже записанных в книге: контрольные доения, отёлы,
 * осеменения, взвешивания. Не принимаются сами животные, племенная
 * ценность и оценка экстерьера — и на каждое есть причина, которая
 * сообщается словами, а не кодом (`ADE_READ_ONLY_REASON`). Отвечать
 * на такой запрос «не найдено» было бы неправдой: адрес существует,
 * отдача по нему работает, отказано именно в записи.
 *
 * ## Одиночный ресурс и пакет — одним обработчиком
 *
 * Стандарт разводит их по разным адресам (`/batches/...`), но различие
 * между ними только в форме тела. Разводить по адресам значило бы
 * завести вторую копию проверки прав и опознания локации — то есть
 * второе место, где право написать в чужое хозяйство может разойтись
 * с первым. Массив в теле принимается здесь же.
 *
 * ## Почему пакет не «всё или ничего»
 *
 * Каждый элемент разбирается и записывается сам по себе, а ответ
 * перечисляет исход по каждому. Так требует и стандарт своим
 * `icarBatchResult`, и это верно по сути: отказ всему пакету из-за
 * одной негодной записи заставил бы клиента гадать, какая именно,
 * и слать пакет заново целиком.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ scheme: string; id: string; collection: string }> },
) {
  const { scheme, id, collection } = await params

  if (!isAdeCollection(collection)) {
    return NextResponse.json(
      adeErrors(
        adeError(404, ADE_CODE.collectionUnknown, `Неизвестная коллекция «${collection}»`, undefined, {
          supported: ADE_COLLECTIONS,
        }),
      ),
      { status: 404 },
    )
  }

  if (!isAdeWritable(collection)) {
    return NextResponse.json(
      adeErrors(
        adeError(
          405,
          ADE_CODE.methodNotAllowed,
          `Коллекция «${collection}» доступна только на чтение`,
          ADE_READ_ONLY_REASON[collection],
          { writable: ADE_WRITABLE },
        ),
      ),
      { status: 405, headers: { Allow: 'GET' } },
    )
  }

  const payload = await getClient()
  const user = await adeUser(request, payload)

  if (!user) {
    return NextResponse.json(
      adeErrors(
        adeError(
          401,
          ADE_CODE.unauthorized,
          'Требуется авторизация',
          'Заголовок Authorization: JWT <токен> или Bearer <токен>.',
        ),
      ),
      { status: 401 },
    )
  }

  const orgId = parseLocation(decodeURIComponent(scheme), decodeURIComponent(id))
  const allowed = orgId === null ? [] : await allowedLocations(payload, user)

  if (orgId === null || !allowed.includes(orgId)) {
    return NextResponse.json(
      adeErrors(adeError(404, ADE_CODE.locationForbidden, 'Локация не найдена или недоступна')),
      { status: 404 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      adeErrors(adeError(400, ADE_CODE.bodyNotJson, 'Тело запроса не разобралось как JSON')),
      { status: 400 },
    )
  }

  const items = Array.isArray(body) ? body : [body]

  if (items.length === 0) {
    return NextResponse.json(
      adeErrors(adeError(400, ADE_CODE.bodyShape, 'Пустой пакет')),
      { status: 400 },
    )
  }

  /*
   * Последовательно, а не разом. Соблазн был запустить всё через
   * `Promise.all`: пакет из ста записей прошёл бы вчетверо быстрее.
   * Так нельзя — два элемента пакета с одним `sourceId` (а такое шлют,
   * когда у клиента сбоит выгрузка) пошли бы в базу внахлёст и оба
   * создали бы запись. Последовательность делает второй элемент
   * обновлением первого, то есть тем, чем он и является.
   */
  const results: Record<string, unknown>[] = []
  const errors: ReturnType<typeof adeError>[] = []

  for (const item of items) {
    const out = await acceptAdeResource(payload, collection, orgId, item)

    if (out.ok) {
      results.push({
        resourceType: 'icarResponseMessageResource',
        severity: 'Information',
        message: out.action,
        ...(out.id ? { id: String(out.id) } : {}),
      })
    } else {
      errors.push(...out.errors)
      results.push({
        resourceType: 'icarResponseMessageResource',
        severity: 'Error',
        message: out.errors[0]?.title ?? 'Не принято',
        ...(out.errors[0]?.id ? { id: out.errors[0].id } : {}),
      })
    }
  }

  const single = !Array.isArray(body)

  /*
   * Одиночная запись отвечает так, как ждёт клиент одиночной записи:
   * 201 при создании, 200 при обновлении, ошибка — телом с `errors`.
   * Пакет всегда отвечает 200 и разбором по элементам, даже если часть
   * не принята: код ответа относится к обработке пакета, а не к его
   * содержимому, и 400 на пакет с одной негодной строкой из ста
   * заставил бы клиента считать несохранённым всё.
   */
  if (single) {
    if (errors.length) {
      const status = errors[0]!.status || 400
      return NextResponse.json(adeErrors(...errors), { status })
    }

    const created = results[0]?.message === 'created'
    return NextResponse.json(results[0], {
      status: created ? 201 : 200,
      headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
    })
  }

  return NextResponse.json(
    {
      resourceType: 'icarBatchResult',
      id: randomUUID(),
      meta: { source: ADE_SOURCE, modified: new Date().toISOString() },
      messages: results,
    },
    {
      status: 200,
      headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
    },
  )
}
