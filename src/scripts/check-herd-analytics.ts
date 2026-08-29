import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  culling,
  geneticTrend,
  heiferAges,
  lactationStructure,
  milkByLactation,
  reproduction,
  udderHealth,
} from '@/lib/herd-analytics'
import { biggestHerd } from '@/lib/biggest-herd'

/**
 * Отчёты по стаду — прогон на живой базе.
 *
 * ## Зачем
 *
 * Семь запросов написаны руками по схеме, а не сгенерированы, и на первом
 * же открытии страницы один из них упал: колонка результата осеменения
 * называется не так, как я написал по памяти. `tsc` такого не ловит —
 * для него SQL это строка, — а увидеть можно только выполнив.
 *
 * Проверка утверждает не «числа верные» (правильных чисел она не знает),
 * а «запрос выполняется и возвращает то, что обещает тип». Этого хватает
 * ровно для той ошибки, которая случилась.
 *
 * Заодно печатает сами числа: неправдоподобное значение здесь видно
 * сразу, а на странице его пришлось бы искать глазами среди семи блоков.
 *
 *   npm run check:herd
 *   npm run check:herd -- --org=12     отчёты одного хозяйства
 */

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const payload = await getPayload({ config })

  /*
   * Хозяйство с наибольшим стадом — и берётся тем же кодом, что берёт
   * ночной прогон.
   *
   * Оговорка о наибольшем стаде стояла здесь и раньше, а запрос под ней
   * брал владельца самого свежего животного. Расхождение подписи с кодом
   * само по себе не ломает ничего — ломает то, что следует: прогон
   * попадал на хозяйство с одной коровой, все семь отчётов честно
   * возвращали пустоту, и проверка была зелёной, ничего не проверив.
   * «Считается» тогда означает «не упало», а не «посчитало».
   */
  /*
   * Хозяйство можно назвать явно. Наибольшее стадо — разумное умолчание
   * для книги целиком, но проверять правку удобнее на маленьком
   * хозяйстве, которое пересобирается за секунды: `seed:farm` печатает
   * его номер, а гонять ради этого триста тысяч записей незачем.
   */
  const explicit = process.argv.find((a) => a.startsWith('--org='))?.slice(6)
  const orgId = explicit ? Number(explicit) : await biggestHerd(payload)

  if (!orgId || !Number.isFinite(orgId)) {
    console.log('  ✗ в книге нет животных с хозяйством — проверять нечего')
    process.exit(1)
  }

  console.log(`\nОтчёты по стаду, хозяйство #${orgId}\n`)

  const s = await lactationStructure(payload, orgId)
  check(s !== null, 'структура по лактациям считается')
  if (s)
    console.log(
      `      коров ${s.cows}, средняя лактация ${s.meanLactation?.toFixed(1) ?? '—'}, ` +
        s.byLactation.map((r) => `${r.lactation}: ${r.cows}`).join(', '),
    )

  const h = await heiferAges(payload, orgId)
  check(h !== null, 'молодняк считается')
  if (h) console.log(`      тёлок ${h.total}: растут ${h.young}, готовы ${h.ready}, передержка ${h.overdue}`)

  const t = await geneticTrend(payload, orgId)
  check(t !== null, 'генетический тренд считается')
  if (t)
    console.log(
      `      точек ${t.points.length}, средний инбридинг ${t.meanInbreeding ?? '—'} %, ` +
        `выше порога ${t.aboveThreshold} из ${t.withInbreeding}`,
    )

  const c = await culling(payload, orgId)
  check(c !== null, 'выбытие считается')
  if (c)
    console.log(
      `      выбыло ${c.total} (${c.rate?.toFixed(1) ?? '—'} %), первотёлок ${c.firstLactation}, ` +
        `причин ${c.reasons.length}`,
    )

  const r = await reproduction(payload, orgId)
  check(r !== null, 'воспроизводство считается')
  if (r)
    console.log(
      `      сервис-период ${r.serviceperiod ?? '—'}, на стельность ${r.perConception ?? '—'}, ` +
        `межотельный ${r.calvingInterval ?? '—'}, отёлов ${r.calvings}, осеменений ${r.inseminations}`,
    )

  const u = await udderHealth(payload, orgId)
  check(u !== null, 'здоровье вымени считается')
  if (u)
    console.log(
      `      среднее ${u.meanScc ?? '—'} тыс., выше порога ${u.above} из ${u.measured}`,
    )

  const m = await milkByLactation(payload, orgId)
  check(m !== null, 'удой по группам считается')
  if (m)
    console.log(
      `      ${m.groups.map((g) => `${g.label}: ${g.cows} шт, ${g.milk305 ?? '—'} кг`).join(' | ')}` +
        `, в ходу ${m.inProgress}`,
    )

  /*
   * Одна проверка на смысл, а не на выполнимость: доля выбытия не бывает
   * больше ста процентов. Такое получилось бы, ошибись я знаменателем —
   * а знаменатель здесь спорный, и ошибиться в нём легко.
   */
  if (c?.rate !== null && c?.rate !== undefined)
    check(c.rate >= 0 && c.rate <= 100, 'доля выбытия в пределах 0…100 %', `${c.rate.toFixed(1)} %`)

  console.log(failures === 0 ? '\nВсе отчёты выполняются.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nОшибка:', e instanceof Error ? e.message : e)
  process.exit(1)
})
