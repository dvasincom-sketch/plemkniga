import { INBREEDING_THRESHOLD, SCC_THRESHOLD } from '@/lib/herd-analytics'
import type { Culling, GeneticTrend, HeiferAges, UdderHealth } from '@/lib/herd-analytics'

/**
 * Сигналы по стаду: числа, которые требуют решения сегодня.
 *
 * ## Зачем отдельная сущность
 *
 * Отчёты переехали с «Обзора» в «Отчёты» — там их и ищут. Но у отчётов
 * было одно свойство, которое терять нельзя: их видели каждый день, потому
 * что «Обзор» открывают каждый день. Раздел, куда надо зайти, читают раз
 * в квартал, а передержанная тёлка стоит денег ежедневно.
 *
 * Поэтому на «Обзоре» осталось не всё, а только тревожное. Полоса
 * не показывает состояние стада — для этого есть «Стадо в числах» рядом
 * — она показывает то, с чем нужно что-то делать.
 *
 * ## Почему сигнал появляется только при беде
 *
 * «Передержки нет — 0» занимает столько же места, сколько «передержка —
 * четыре», и приучает пробегать полосу глазами не читая. Полоса, в которой
 * каждая строка означает работу, читается вся; полоса, в которой половина
 * строк означает «всё хорошо», не читается вовсе. Когда сигналов нет,
 * нет и полосы — молчание здесь и есть сообщение «беды нет».
 *
 * ## Почему числа не считаются заново
 *
 * Берутся из тех же семи отчётов, что и на странице «Отчёты». Посчитать
 * их своим запросом было бы быстрее на «Обзоре», но однажды два запроса
 * разошлись бы — и «Обзор» тревожил бы о том, чего в отчёте нет. Ровно
 * так уже расходились числа стада.
 */

export type Signal = {
  key: string
  /** Число — оно и есть повод. */
  count: number
  label: string
  /** Чем это грозит, одной строкой. */
  hint: string
  href: string
  /** Красным — то, что уже стоит денег; обычным — то, что просит внимания. */
  urgent: boolean
}

export function herdSignals({
  heifers,
  trend,
  udder,
  cull,
}: {
  heifers: HeiferAges | null
  trend: GeneticTrend | null
  udder: UdderHealth | null
  cull: Culling | null
}): Signal[] {
  const out: Signal[] = []

  /*
   * Передержка — единственный сигнал, который прямо каждый день стоит
   * корма. Остальные говорят о том, что уже случилось или случится
   * через поколение.
   */
  if (heifers && heifers.overdue > 0) {
    out.push({
      key: 'heifers-overdue',
      count: heifers.overdue,
      label: 'тёлок в передержке',
      hint: 'старше 15 месяцев без отёла — корм без отдачи',
      href: '/account/reports/heifers-overdue',
      urgent: true,
    })
  }

  if (udder && udder.above > 0) {
    out.push({
      key: 'scc-above',
      count: udder.above,
      label: `коров выше ${SCC_THRESHOLD} тыс. соматики`,
      hint: 'скрытый мастит: удой, сортность и выбраковка сразу',
      href: '/account/reports/scc-above',
      urgent: true,
    })
  }

  if (trend && trend.aboveThreshold > 0) {
    out.push({
      key: 'inbreeding-above',
      count: trend.aboveThreshold,
      label: `животных с инбридингом выше ${INBREEDING_THRESHOLD} %`,
      hint: 'решается подбором быка, а не лечением',
      href: '/account/reports/inbreeding-above',
      urgent: false,
    })
  }

  /*
   * Первотёлки в выбытии, а не выбытие целиком: выбытие бывает плановым,
   * а первотёлка не окупает даже выращивания. Сигналом должно быть
   * то, чего быть не должно, — иначе это просто ещё одно число.
   */
  if (cull && cull.firstLactation > 0) {
    out.push({
      key: 'culled-first',
      count: cull.firstLactation,
      label: 'первотёлок выбыло за год',
      hint: 'выращивание не окупилось — самая дорогая потеря',
      href: '/account/reports/culled-year',
      urgent: false,
    })
  }

  /*
   * Тёлки, готовые к осеменению, — не беда, а работа, и по значимости
   * они ниже всего перечисленного. Но не показать их нельзя: пропущенная
   * охота становится передержкой через месяц.
   */
  if (heifers && heifers.ready > 0) {
    out.push({
      key: 'heifers-ready',
      count: heifers.ready,
      label: 'тёлок пора осеменять',
      hint: '13–15 месяцев — возраст осеменения голштинки',
      href: '/account/reports/heifers-ready',
      urgent: false,
    })
  }

  return out
}
