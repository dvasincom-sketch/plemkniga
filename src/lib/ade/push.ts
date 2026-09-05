import { NextResponse } from 'next/server'
import { ADE_VERSION } from '@/lib/ade/core'
import { isDataset } from '@/lib/ade/datasets'
import { isAdeWritable, parseAdeResource } from '@/lib/ade/parse'
import { ADE_CODE, adeError, adeErrors, type AdeError } from '@/lib/ade/errors'
import { acceptAdeResource } from '@/lib/ade/accept'
import { adeAuth, adeBody, adeReadOnly } from '@/lib/ade/gate'
import { parseLocation } from '@/lib/ade/serve'

/**
 * Приём в набор — вторая половина обмена наборами.
 *
 *   POST /ade/v1/datasets/{dataset}/resources
 *
 * ## Почему ответ здесь «всё или ничего», а на пакетном адресе нет
 *
 * Пакетный адрес отвечает построчным отчётом и всегда двумястами:
 * клиент видит, что принято, а что нет, и досылает только негодное.
 *
 * Здесь так нельзя, и это не наш выбор. Спецификация обмена наборами
 * говорит прямо: любой код, кроме 200, означает для клиента, что сервер
 * не сохранил присланное. Отдав 200 при половине принятых записей,
 * мы сказали бы «всё сохранено» — и клиент отметил бы у себя правки
 * как отправленные, навсегда потеряв те, что не прошли.
 *
 * Поэтому: одна негодная запись — четырёхсотый на всю посылку,
 * с перечнем того, что именно не так.
 *
 * ## Почему повторная отправка целиком не страшна
 *
 * Получив отказ, клиент пришлёт всё заново, включая записи, которые мы
 * уже записали. Дублей не будет: приём опознаёт повторную отправку
 * по паре «источник и его номер записи» и обновляет прежнюю строку
 * вместо создания новой. Без этой опознавалки требование стандарта
 * «всё или ничего» удваивало бы данные на каждой сетевой заминке.
 *
 * ## Почему удаление не принимается
 *
 * Ресурс с `meta.isDeleted` мы отвергаем. Не потому, что не умеем:
 * удаление в племенной книге — не техническая операция, а отзыв
 * утверждения, за которое Ассоциация отвечает перед всеми, кто на него
 * ссылался. Тихо принять его от чужой программы значило бы позволить
 * стереть отёл сообщением по сети.
 *
 * Отвергаем **вслух**, а не пропускаем: пропущенное удаление клиент
 * посчитал бы исполненным и никогда бы к нему не вернулся.
 */
export async function adePush(request: Request, datasetRaw: string): Promise<NextResponse> {
  const auth = await adeAuth(request)
  if (!auth.ok) return auth.response

  if (!isDataset(datasetRaw)) {
    return NextResponse.json(
      adeErrors(adeError(404, ADE_CODE.collectionUnknown, `Неизвестный набор «${datasetRaw}»`)),
      { status: 404 },
    )
  }

  const dataset = datasetRaw
  if (!isAdeWritable(dataset)) return adeReadOnly(dataset)

  const body = await adeBody(request)
  if (!body.ok) return body.response

  if (!Array.isArray(body.value)) {
    return NextResponse.json(
      adeErrors(
        adeError(
          400,
          ADE_CODE.bodyShape,
          'Ожидается массив: контекст и ресурсы',
          'Первым элементом идёт объект с id «@context», далее ресурсы. Метки продолжения в посылке быть не должно.',
        ),
      ),
      { status: 400 },
    )
  }

  const items = body.value as Record<string, unknown>[]
  const errors: AdeError[] = []

  /*
   * Служебные объекты отбрасываются по признаку `id`, а не по месту
   * в массиве. Контекст стандарт велит слать первым, но клиент,
   * приславший его вторым, ошибся оформлением, а не смыслом, — и падать
   * на этом значило бы отвергнуть годные данные из-за порядка.
   *
   * Метка продолжения в посылке запрещена прямо, и вот её мы называем:
   * её присутствие означает, что клиент шлёт нам обратно нашу же ленту,
   * то есть перепутал направление обмена.
   */
  const resources: Record<string, unknown>[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      errors.push(adeError(400, ADE_CODE.bodyShape, 'В посылке не объект'))
      continue
    }
    if (item.id === '@context') continue
    if (item.id === '@continuation') {
      errors.push(
        adeError(
          400,
          ADE_CODE.bodyShape,
          'В посылке метка продолжения',
          'Метка бывает только в ответе ленты. Похоже, лента отправлена обратно её источнику.',
        ),
      )
      continue
    }
    resources.push(item)
  }

  if (resources.length === 0 && errors.length === 0) {
    return NextResponse.json(
      adeErrors(adeError(400, ADE_CODE.bodyShape, 'В посылке нет ресурсов')),
      { status: 400 },
    )
  }

  /* ------------------------------------------------------------------ *
   *  Сперва разбираем всю посылку, и только потом пишем                *
   * ------------------------------------------------------------------ */

  /*
   * Проверка локаций идёт до первой записи. Иначе посылка с чужим
   * хозяйством в последнем ресурсе успела бы записать всё предыдущее
   * и отказать — а клиент, получив отказ, считал бы, что не записано
   * ничего.
   */
  const planned: { orgId: number; resource: Record<string, unknown> }[] = []

  for (const [i, r] of resources.entries()) {
    const meta = r.meta as { isDeleted?: unknown } | undefined

    if (meta?.isDeleted === true) {
      errors.push(
        adeError(
          400,
          ADE_CODE.fieldValue,
          `Ресурс ${i + 1}: удаление по обмену не принимается`,
          'Отзыв записи в племенной книге идёт заявкой с проверкой, а не сообщением по сети.',
        ),
      )
      continue
    }

    const loc = r.location as { scheme?: string; id?: string } | undefined
    const orgId = loc?.scheme && loc?.id ? parseLocation(String(loc.scheme), String(loc.id)) : null

    if (orgId === null) {
      errors.push(
        adeError(
          400,
          ADE_CODE.fieldMissing,
          `Ресурс ${i + 1}: не указана или не разобрана локация`,
          'В обмене наборами хозяйство берётся из самого ресурса: поле location со схемой и номером.',
        ),
      )
      continue
    }

    if (!auth.orgs.includes(orgId)) {
      errors.push(
        adeError(404, ADE_CODE.locationForbidden, `Ресурс ${i + 1}: локация не найдена или недоступна`),
      )
      continue
    }

    /*
     * Тело ресурса разбирается здесь же, до первой записи, — а не внутри
     * `acceptAdeResource` в цикле записи, как было. Иначе негодная дата
     * в пятом ресурсе обнаруживалась после того, как четыре уже легли
     * в книгу, а ответ говорил «ничего не сохранено». Заголовок этого
     * раздела обещал разбор всей посылки заранее; теперь он выполняется.
     */
    const parsed = parseAdeResource(dataset, r)
    if (!parsed.ok) {
      errors.push(...parsed.errors.map((e) => ({ ...e, title: `Ресурс ${i + 1}: ${e.title}` })))
      continue
    }

    planned.push({ orgId, resource: r })
  }

  if (errors.length) {
    return NextResponse.json(adeErrors(...errors), { status: errors[0]!.status })
  }

  /* ------------------------------ Запись ------------------------------ */

  const written: AdeError[] = []

  for (const [i, p] of planned.entries()) {
    const out = await acceptAdeResource(auth.payload, dataset, p.orgId, p.resource)
    if (!out.ok) {
      written.push(
        ...out.errors.map((e) => ({ ...e, title: `Ресурс ${i + 1}: ${e.title}` })),
      )
    }
  }

  if (written.length) {
    return NextResponse.json(adeErrors(...written), { status: written[0]!.status })
  }

  /*
   * Двести с пустым телом — ровно то, что описано в спецификации:
   * «The server returns a 200 OK if the new resource representations
   * are correctly processed». Своего отчёта здесь не место: клиент
   * читает код ответа, а лишнее тело он всё равно не разбирает.
   */
  return new NextResponse(null, {
    status: 200,
    headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
  })
}
