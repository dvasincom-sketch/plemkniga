import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getClient } from '@/lib/payload'
import { runAllProbes } from '@/lib/probes'
import { CURRENT_VERSION } from '@/lib/product-versions'

export const dynamic = 'force-dynamic'

/**
 * Прогон проверок на той машине, где развёрнута система.
 *
 * ## Почему ручка, а не скрипт
 *
 * Скрипт с боевой строкой подключения проверяет боевую **базу** кодом
 * из рабочей ветки — то есть отвечает на вопрос «сойдётся ли, если
 * выложить». Полезно, но не то. Здесь нужен другой вопрос: «сходится ли
 * у того, что развёрнуто прямо сейчас». Ответить на него может только
 * код, который там и работает.
 *
 * Заодно снимается условие «поставить node и зависимости» — ночному
 * действию хватает одного `curl`.
 *
 * ## Чего эта ручка не гоняет
 *
 * Проверки, которые пишут в базу. Их около половины: заводят организации,
 * животных, приглашения и потом удаляют. Ночной прогон на боевой книге
 * означал бы, что каждую ночь в ней появляются и исчезают записи,
 * а обрыв посреди прогона оставлял бы мусор, неотличимый от настоящих
 * данных. Список того, что сюда не попало и почему, — в реестре
 * (`check-registry.ts`), и страница «Статус» о нём говорит вслух.
 *
 * И проверки, которым нужен живой HTTP-сервер снаружи: обход страниц,
 * ссылки навигации, страница документации. Проверяющий, живущий внутри
 * проверяемого, не заметит, что проверяемый не отвечает.
 *
 * ## Ключ
 *
 *   GET /checks?token=…&label=Прод
 *
 * Токен в `CHECKS_TOKEN`, не короче шестнадцати знаков. Отказ отвечает
 * несуществующей страницей — снаружи маршрут обязан быть неотличим
 * от неверного адреса; в лог причина пишется поимённо, иначе владелец
 * системы не отличит незаданную переменную от опечатки в ключе.
 *
 * Отдельный токен, а не общий с замером: у ручек разная цена ошибки
 * и разная частота. Общий ключ пришлось бы менять сразу в двух
 * действиях, и однажды поменяли бы в одном.
 */

export async function GET(request: Request) {
  const expected = process.env.CHECKS_TOKEN ?? ''

  const deny = (why: string) => {
    console.warn(`[checks] запрос отклонён: ${why}`)
    return new NextResponse('Not found', { status: 404 })
  }

  if (!expected) return deny('переменная CHECKS_TOKEN не задана')
  if (expected.length < 16)
    return deny(`CHECKS_TOKEN короче шестнадцати знаков (сейчас ${expected.length})`)

  const { searchParams } = new URL(request.url)
  const given = searchParams.get('token') ?? ''
  if (!given) return deny('в адресе нет параметра token')

  /*
   * Длины сравниваются отдельно и до `timingSafeEqual`: он требует
   * буферов одного размера и бросает исключение, если они разные.
   */
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return deny(`токен не подошёл (прислано знаков: ${given.length}, ожидается: ${expected.length})`)

  const label = (searchParams.get('label') ?? '').trim().slice(0, 60) || 'Прод'

  const payload = await getClient()
  const started = Date.now()
  const results = await runAllProbes(payload)
  const ms = Date.now() - started

  const failed = results.filter((r) => !r.ok).length

  const record = {
    label,
    ranAt: new Date().toISOString(),
    ok: failed === 0,
    failed,
    total: results.length,
    ms,
    version: CURRENT_VERSION,
    results,
  }

  /*
   * Сохранение не должно валить ответ. Прогон уже состоялся, и его
   * результат нужен вызвавшему прямо сейчас — даже если записать
   * не удалось. Обратное означало бы, что при неполадке с базой
   * мы теряем ровно тот отчёт, который об этой неполадке и говорит.
   */
  let saved = false
  try {
    const existing = await payload.find({
      collection: 'check-runs',
      where: { label: { equals: label } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'check-runs',
        id: existing.docs[0].id,
        data: record,
        overrideAccess: true,
      })
    } else {
      await payload.create({ collection: 'check-runs', data: record, overrideAccess: true })
    }
    saved = true
  } catch (e) {
    console.error('[checks] прогон не сохранён:', e instanceof Error ? e.message : e)
  }

  console.info(
    `[checks] прогон «${label}»: проб ${results.length}, с находками ${failed}, ${ms} мс` +
      (saved ? '' : ' — сохранить не удалось'),
  )

  /*
   * Код ответа говорит об исходе прогона, а не о работе ручки: ночному
   * действию так не нужно разбирать тело, чтобы понять, звать ли людей.
   * 200 — всё сошлось, 409 — есть находки.
   */
  return NextResponse.json({ ...record, saved }, {
    status: failed === 0 ? 200 : 409,
    headers: { 'Cache-Control': 'no-store' },
  })
}
