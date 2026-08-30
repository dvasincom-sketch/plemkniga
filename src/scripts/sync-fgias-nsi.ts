import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchRegistry, listRegistries, looksLike, nsiKey } from '@/lib/fgias-nsi'
import { FGIAS_LINKS, FGIAS_UNMAPPED } from '@/lib/fgias-map'

/**
 * Сверка наших справочников с реестрами ФГИАС ПР.
 *
 * ## Зачем
 *
 * Двадцать шаблонов ФГИАС заполняются ключами, а не словами. Пока у наших
 * пород, линий и мастей нет ключа реестра, выгружать нечего: реестр примет
 * `1bd6b3f1-648a-…`, а «Голштинская» отвергнет.
 *
 * Но польза начинается раньше выгрузки. Сверка показывает, где наш
 * справочник разошёлся с государственным: каких наших записей в реестре
 * нет, какие называются иначе, и сколько записей реестра мы не ведём
 * вовсе. Это разговор с Ассоциацией, который до сих пор вести было нечем.
 *
 * ## Сверка по названию, и почему это допустимо только с отчётом
 *
 * Общего кода у нас с реестром нет: наш `code` из «Селэкса», их — свой.
 * Остаётся название, а названия расходятся: регистр, «ё», лишние пробелы.
 * Приведение (`nsiKey`) осторожное и нарочно неумное — оно правит
 * написание, но не смысл.
 *
 * Поэтому итог сверки — не «проставлено», а три списка: совпало, не нашли
 * пары, нашли больше одной. Последний важнее прочих: две записи реестра
 * с одинаковым приведённым названием означают, что выбирать должен
 * человек, и скрипт не выбирает.
 *
 * ## Сухой прогон по умолчанию
 *
 * Без ключа ничего не пишется. Это первый выход книги наружу за ключами,
 * и проставлять их молча — ровно тот жанр, за которым мы гоняемся всю
 * неделю. С `--apply` записываются только однозначные совпадения.
 *
 *   npm run sync:fgias-nsi            — посмотреть
 *   npm run sync:fgias-nsi -- --apply — проставить ключи
 */

const APPLY = process.argv.includes('--apply')

type Ours = { id: number; name: string; code?: string; fgiasUuid?: string }

async function main() {
  const payload = await getPayload({ config })

  console.log(`\n${APPLY ? 'Сверяем и проставляем ключи' : 'Сухой прогон — ничего не пишем'}\n`)

  const registries = await listRegistries()
  const byCode = new Map(registries.map((r) => [r.code ?? '', r]))
  console.log(`Реестров во ФГИАС: ${registries.length}\n`)

  let written = 0
  let ambiguous = 0
  let unmatched = 0
  let renamed = 0

  for (const link of FGIAS_LINKS) {
    const registry = byCode.get(link.code)

    console.log('─'.repeat(78))
    console.log(`${link.slug}  ↔  ${link.title}${link.uncertain ? '   (пара под вопросом)' : ''}`)

    if (!registry) {
      console.log(`  ✗ реестра с кодом «${link.code}» во ФГИАС нет — код изменился или реестр убран\n`)
      continue
    }

    const [theirs, ours] = await Promise.all([
      fetchRegistry(registry.uuid),
      payload
        .find({
          collection: link.slug as never,
          limit: 0,
          pagination: false,
          depth: 0,
          overrideAccess: true,
        })
        .then((r) => r.docs as unknown as Ours[]),
    ])

    /*
     * Реестр складывается в карту «приведённое имя → записи», а не
     * «имя → запись»: одинаковых приведённых имён там хватает, и потерять
     * второе значило бы объявить пару однозначной там, где её нет.
     */
    const index = new Map<string, { uuid: string; name: string }[]>()
    for (const r of theirs) {
      const key = nsiKey(r.name)
      index.set(key, [...(index.get(key) ?? []), { uuid: r.uuid, name: r.name }])
    }

    const matched: { our: Ours; uuid: string; theirName: string }[] = []
    const many: { our: Ours; count: number }[] = []
    const none: Ours[] = []

    for (const o of ours) {
      const hit = index.get(nsiKey(o.name)) ?? []
      if (hit.length === 1) matched.push({ our: o, uuid: hit[0]!.uuid, theirName: hit[0]!.name })
      else if (hit.length > 1) many.push({ our: o, count: hit.length })
      else none.push(o)
    }

    console.log(
      `  наших ${ours.length}, в реестре ${theirs.length} · ` +
        `совпало ${matched.length}, без пары ${none.length}, неоднозначно ${many.length}`,
    )

    /*
     * Уже проставленные считаются отдельно: повторный прогон не должен
     * выглядеть как работа. «Проставлено 556» на второй день означало бы,
     * что скрипт переписывает то же самое, и заметить настоящую правку
     * стало бы нечем.
     */
    const toWrite = matched.filter((m) => m.our.fgiasUuid !== m.uuid)
    console.log(`  из них новых ключей: ${toWrite.length}`)

    /*
     * Из «пары нет» вычитается «называется иначе», и это главное
     * в отчёте.
     *
     * Разница между двумя списками — это разница между «завести
     * в реестре новую породу» и «переименовать у себя строку», то есть
     * между работой на неделю и работой на минуту. Отчёт, который их
     * не различает, отправляет человека делать первое там, где хватило
     * бы второго.
     *
     * Похожее не проставляется ключом ни при каких условиях: вхождение
     * одной строки в другую — довод, а не доказательство. «Русская»
     * входит в «Русская комолая», а это разные породы.
     */
    const similar: { our: Ours; theirs: string[] }[] = []
    const absent: Ours[] = []

    for (const o of none) {
      const near = theirs.filter((t) => looksLike(o.name, t.name)).map((t) => t.name)
      if (near.length) similar.push({ our: o, theirs: near.slice(0, 3) })
      else absent.push(o)
    }

    if (similar.length) {
      console.log(`\n  Называются иначе — переименовать у себя или проставить ключ руками (${similar.length}):`)
      for (const s2 of similar.slice(0, 15)) {
        console.log(`    «${s2.our.name}»  →  ${s2.theirs.map((t) => `«${t}»`).join(' · ')}`)
      }
      if (similar.length > 15) console.log(`    … и ещё ${similar.length - 15}`)
    }

    if (absent.length) {
      console.log(`\n  В реестре нет вовсе — ничего похожего не нашлось (${absent.length}):`)
      for (const o of absent.slice(0, 15)) console.log(`    ${o.name}`)
      if (absent.length > 15) console.log(`    … и ещё ${absent.length - 15}`)
    }

    if (many.length) {
      console.log(`\n  Больше одной пары — выбирать человеку (${many.length}):`)
      for (const m of many.slice(0, 10)) {
        console.log(`    ${m.our.name} — ${m.count} записей реестра с тем же названием`)
      }
      if (many.length > 10) console.log(`    … и ещё ${many.length - 10}`)
    }

    /*
     * Записей реестра, которых нет у нас, может быть очень много: у линий
     * их десять с половиной тысяч против нашей сотни. Печатается только
     * число — список на десять тысяч строк никто не прочтёт, а вопрос
     * «вести ли у себя весь государственный реестр линий» решается
     * не здесь.
     */
    const oursKeys = new Set(ours.map((o) => nsiKey(o.name)))
    const onlyTheirs = theirs.filter((t) => !oursKeys.has(nsiKey(t.name))).length
    console.log(`\n  Есть в реестре, нет у нас: ${onlyTheirs}`)

    if (link.uncertain && matched.length < ours.length / 2) {
      console.log(
        '\n  ⚠ Пара выбрана под вопросом, и совпало меньше половины —\n' +
          '    похоже, реестр не тот. Разберите до того, как проставлять ключи.',
      )
    }

    if (APPLY && toWrite.length) {
      let done = 0
      for (const m of toWrite) {
        try {
          await payload.update({
            collection: link.slug as never,
            id: m.our.id,
            data: { fgiasUuid: m.uuid } as never,
            overrideAccess: true,
          })
          done += 1
        } catch (e) {
          console.error(`    ✗ ${m.our.name}:`, e instanceof Error ? e.message : e)
        }
      }
      written += done
      console.log(`\n  Проставлено ключей: ${done}`)
    }

    ambiguous += many.length
    unmatched += absent.length
    renamed += similar.length
    console.log('')
  }

  /* ------------------------------------------------------------------ */

  console.log('─'.repeat(78))
  console.log('Справочники без пары в реестре — намеренно:\n')
  for (const u of FGIAS_UNMAPPED) console.log(`  ${u.slug.padEnd(22)} ${u.why}`)

  console.log('')
  console.log(
    APPLY
      ? `Проставлено ключей: ${written}. Называются иначе ${renamed}, ` +
          `нет в реестре ${unmatched}, неоднозначно ${ambiguous}.\n`
      : `Сухой прогон. Называются иначе ${renamed}, нет в реестре ${unmatched}, ` +
          `неоднозначно ${ambiguous}.\n` +
          'Чтобы проставить ключи: npm run sync:fgias-nsi -- --apply\n',
  )

  process.exit(0)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
