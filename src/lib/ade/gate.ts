import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'
import { acceptAdeResource } from '@/lib/ade/accept'
import { ADE_READ_ONLY_REASON, ADE_WRITABLE, type AdeWritable } from '@/lib/ade/parse'
import {
  ADE_COLLECTIONS,
  ADE_SOURCE,
  ADE_VERSION,
  type AdeCollectionName,
  isAdeCollection,
} from '@/lib/ade/core'
import { adeUser } from '@/lib/ade/auth'
import type { User } from '@/payload-types'
import { ADE_CODE, adeError, adeErrors, type AdeError } from '@/lib/ade/errors'
import { allowedLocations, parseLocation } from '@/lib/ade/serve'

/**
 * Кого пускаем к локации — одной проверкой на все адреса обмена.
 *
 * ## Почему это вынесено
 *
 * Пакетные адреса `/batches/...` мы долго не заводили, и довод был
 * такой: «разводить по адресам значит завести вторую копию проверки
 * прав — второе место, где право написать в чужое хозяйство может
 * разойтись с первым».
 *
 * Довод был верный про копию и неверный про вывод. Копию заводить
 * не нужно — нужно вынести первую. Пока проверка жила внутри одного
 * обработчика, любой второй адрес и правда означал бы её повторение;
 * вынесенная, она обслуживает сколько угодно адресов и остаётся одна.
 *
 * ## Что здесь проверяется и в каком порядке
 *
 * Порядок — не оформление, а суть. Локация в адресе говорит, **о каком**
 * хозяйстве спрашивают; право ответить берётся из того, **кто**
 * спрашивает. Свести эти два вопроса в один — открыть чужое стадо
 * подстановкой номера в адрес.
 *
 * Поэтому: сперва опознать коллекцию, потом пользователя, потом
 * спросить, какие локации ему разрешены, и только потом сверить
 * с адресом.
 *
 * ## Почему отказ одинаковый
 *
 * «Нет такого хозяйства» и «есть, но не ваше» отвечаются одинаково.
 * Разные ответы позволили бы перебором номеров узнать, какие хозяйства
 * существуют, — а это ровно те сведения, которых посторонний знать
 * не должен.
 */

export type AdeGate =
  | { ok: true; payload: Payload; orgId: number; collection: AdeCollectionName }
  | { ok: false; response: NextResponse }

export async function adeGate(
  request: Request,
  raw: { scheme: string; id: string; collection: string },
): Promise<AdeGate> {
  const { scheme, id, collection } = raw

  if (!isAdeCollection(collection)) {
    return {
      ok: false,
      response: NextResponse.json(
        adeErrors(
          adeError(
            404,
            ADE_CODE.collectionUnknown,
            `Неизвестная коллекция «${collection}»`,
            undefined,
            { supported: ADE_COLLECTIONS },
          ),
        ),
        { status: 404 },
      ),
    }
  }

  const payload = await getClient()
  const user = await adeUser(request, payload)

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        adeErrors(
          adeError(
            401,
            ADE_CODE.unauthorized,
            'Требуется авторизация',
            'Заголовок Authorization: JWT <токен> или Bearer <токен>.',
          ),
        ),
        { status: 401 },
      ),
    }
  }

  const orgId = parseLocation(decodeURIComponent(scheme), decodeURIComponent(id))
  const allowed = orgId === null ? [] : await allowedLocations(payload, user)

  if (orgId === null || !allowed.includes(orgId)) {
    return {
      ok: false,
      response: NextResponse.json(
        adeErrors(adeError(404, ADE_CODE.locationForbidden, 'Локация не найдена или недоступна')),
        { status: 404 },
      ),
    }
  }

  return { ok: true, payload, orgId, collection }
}

/**
 * Кто спрашивает — без локации в адресе.
 *
 * Обмену наборами локация в пути не нужна: клиент не знает про хозяйства
 * и не должен. Но права те же самые, и берутся они тем же способом —
 * иначе завелись бы две двери с разными замками, и второй однажды
 * отстал бы от первого.
 */
export type AdeAuth =
  | { ok: true; payload: Payload; user: User; orgs: number[] }
  | { ok: false; response: NextResponse }

export async function adeAuth(request: Request): Promise<AdeAuth> {
  const payload = await getClient()
  const user = await adeUser(request, payload)

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        adeErrors(
          adeError(
            401,
            ADE_CODE.unauthorized,
            'Требуется авторизация',
            'Заголовок Authorization: JWT <токен> или Bearer <токен>.',
          ),
        ),
        { status: 401 },
      ),
    }
  }

  return { ok: true, payload, user, orgs: await allowedLocations(payload, user) }
}

/**
 * Тело запроса как JSON.
 *
 * Отказ разбора — не пятисотая: так выглядит оборванная передача
 * или клиент, приславший форму вместо JSON. Отвечать на это
 * «внутренняя ошибка сервера» значило бы послать интегратора искать
 * поломку у нас.
 */
export async function adeBody(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, value: await request.json() }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        adeErrors(adeError(400, ADE_CODE.bodyNotJson, 'Тело запроса не разобралось как JSON')),
        { status: 400 },
      ),
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Приём: общий для одиночного адреса и пакетного                    *
 * ------------------------------------------------------------------ */

/**
 * Принять список ресурсов и собрать построчный отчёт.
 *
 * Вынесено сюда по той же причине, что и проверка прав: у одиночного
 * адреса и у пакетного разбор обязан быть один. Разойдясь, они дали бы
 * худшее из возможного — запись, принятую по одному адресу и отвергнутую
 * по другому, при одинаковом теле.
 *
 * ## Почему последовательно, а не разом
 *
 * `Promise.all` прошёл бы пакет из ста записей вчетверо быстрее.
 * Так нельзя: два элемента с одним `sourceId` — а такое шлют, когда
 * у клиента сбоит выгрузка, — пошли бы в базу внахлёст и оба создали бы
 * запись. Последовательность делает второй элемент обновлением первого,
 * то есть тем, чем он и является.
 */
export async function adeAcceptMany(
  payload: Payload,
  collection: AdeWritable,
  orgId: number,
  items: unknown[],
): Promise<{ messages: Record<string, unknown>[]; errors: AdeError[] }> {
  const messages: Record<string, unknown>[] = []
  const errors: AdeError[] = []

  for (const item of items) {
    const out = await acceptAdeResource(payload, collection, orgId, item)

    if (out.ok) {
      messages.push({
        resourceType: 'icarResponseMessageResource',
        severity: 'Information',
        message: out.action,
        ...(out.id ? { id: String(out.id) } : {}),
      })
    } else {
      errors.push(...out.errors)
      messages.push({
        resourceType: 'icarResponseMessageResource',
        severity: 'Error',
        message: out.errors[0]?.title ?? 'Не принято',
        ...(out.errors[0]?.id ? { id: out.errors[0].id } : {}),
      })
    }
  }

  return { messages, errors }
}

/**
 * Ответ на пакет — `icarBatchResult`, как задано стандартом.
 *
 * Всегда 200, даже когда часть записей не принята: код ответа относится
 * к обработке пакета, а не к его содержимому. Четырёхсотый на пакет
 * с одной негодной строкой из ста заставил бы клиента считать
 * несохранённым весь пакет — и переслать его целиком, удвоив то,
 * что уже записано.
 */
export const adeBatchResult = (messages: Record<string, unknown>[]): NextResponse =>
  NextResponse.json(
    {
      resourceType: 'icarBatchResult',
      id: randomUUID(),
      meta: { source: ADE_SOURCE, modified: new Date().toISOString() },
      messages,
    },
    {
      status: 200,
      headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
    },
  )

/**
 * Коллекция закрыта на запись — с объяснением словами.
 *
 * Не «не найдено»: адрес существует и отдача по нему работает, отказано
 * именно в записи. Заголовок `Allow` говорит это машине, текст — человеку.
 */
export const adeReadOnly = (collection: string): NextResponse =>
  NextResponse.json(
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
