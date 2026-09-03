import { NextResponse } from 'next/server'
import { ADE_VERSION } from '@/lib/ade/core'
import { parseAdeQuery, serveAdeCollection } from '@/lib/ade/serve'
import { isAdeWritable } from '@/lib/ade/parse'
import { ADE_CODE, adeError, adeErrors } from '@/lib/ade/errors'
import { adeAcceptMany, adeBatchResult, adeBody, adeGate, adeReadOnly } from '@/lib/ade/gate'

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
  const gate = await adeGate(request, await params)
  if (!gate.ok) return gate.response

  const { payload, orgId, collection } = gate

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
  const gate = await adeGate(request, await params)
  if (!gate.ok) return gate.response

  const { payload, orgId, collection } = gate

  if (!isAdeWritable(collection)) return adeReadOnly(collection)

  const body = await adeBody(request)
  if (!body.ok) return body.response

  /*
   * Массив принимается и здесь, а не только на пакетном адресе.
   * Пакетный завёлся позже, и клиенты, писавшие под прежнее поведение,
   * продолжают слать массивы сюда. Отнять это значило бы сломать
   * работающую связь ради опрятности.
   */
  const items = Array.isArray(body.value) ? body.value : [body.value]

  if (items.length === 0) {
    return NextResponse.json(adeErrors(adeError(400, ADE_CODE.bodyShape, 'Пустой пакет')), {
      status: 400,
    })
  }

  const { messages, errors } = await adeAcceptMany(payload, collection, orgId, items)

  /*
   * Одиночная запись отвечает так, как ждёт клиент одиночной записи:
   * 201 при создании, 200 при обновлении, отказ — телом с `errors`.
   * Массив, даже присланный сюда, отвечает отчётом по элементам.
   */
  if (Array.isArray(body.value)) return adeBatchResult(messages)

  if (errors.length) {
    return NextResponse.json(adeErrors(...errors), { status: errors[0]!.status || 400 })
  }

  const created = messages[0]?.message === 'created'

  return NextResponse.json(messages[0], {
    status: created ? 201 : 200,
    headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
  })
}
