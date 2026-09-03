import { NextResponse } from 'next/server'
import { isAdeWritable } from '@/lib/ade/parse'
import { ADE_CODE, adeError, adeErrors } from '@/lib/ade/errors'
import { adeAcceptMany, adeBatchResult, adeBody, adeGate, adeReadOnly } from '@/lib/ade/gate'

export const dynamic = 'force-dynamic'

/**
 * Пакетный приём по ICAR ADE.
 *
 *   POST /ade/v1/batches/locations/{scheme}/{id}/{collection}
 *
 * ## Почему адрес всё-таки завели
 *
 * Массив мы принимали и на основном адресе, и довод против отдельного
 * пути был такой: «разводить по адресам значит завести вторую копию
 * проверки прав». Довод верный про копию и неверный про вывод — копию
 * заводить не нужно, нужно вынести первую, что и сделано
 * (`lib/ade/gate.ts`).
 *
 * А цена отсутствия адреса была настоящей: клиент, написанный
 * по стандарту, шлёт пакет на `/batches/...` и получает **404**.
 * Не «мы принимаем иначе», а «такого адреса нет» — и дальше он
 * справедливо считает, что пакетная отправка у нас не поддержана вовсе.
 *
 * Форма пути взята не из пересказа, а из самих схем адресов ICAR
 * (`vendor/icar-ade/url-schemes/`): `/batches/locations/{scheme}/{id}/
 * {collection}`, только POST, у всех семи разделов стандарта одинаково.
 *
 * ## Чем отличается от основного адреса
 *
 * Двумя вещами, и обе следуют из назначения.
 *
 * Тело обязано быть массивом. Одиночный ресурс здесь — не вежливость,
 * а признак того, что клиент перепутал адреса, и промолчать об этом
 * значило бы оставить его с ответом, которого он не ждёт.
 *
 * Ответ всегда `icarBatchResult` и всегда 200 — даже когда часть записей
 * не принята. Код ответа относится к обработке пакета, а не к его
 * содержимому: четырёхсотый на пакет с одной негодной строкой из ста
 * заставил бы клиента переслать пакет целиком и удвоить то, что уже
 * записано.
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
   * Массив обязателен. Клиент, приславший сюда один ресурс, почти
   * наверняка ошибся адресом: одиночная запись живёт на основном пути
   * и отвечает 201, а не отчётом по элементам. Сказать ему это прямо
   * дешевле, чем принять и вернуть непонятный ответ.
   */
  if (!Array.isArray(body.value)) {
    return NextResponse.json(
      adeErrors(
        adeError(
          400,
          ADE_CODE.bodyShape,
          'Пакетный адрес принимает массив ресурсов',
          'Одиночный ресурс отправляется на /ade/v1/locations/{scheme}/{id}/{collection}.',
        ),
      ),
      { status: 400 },
    )
  }

  if (body.value.length === 0) {
    return NextResponse.json(adeErrors(adeError(400, ADE_CODE.bodyShape, 'Пустой пакет')), {
      status: 400,
    })
  }

  const { messages } = await adeAcceptMany(payload, collection, orgId, body.value)

  return adeBatchResult(messages)
}
