import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchRegistry, listRegistries } from '@/lib/fgias-nsi'

/**
 * Разовая загрузка территориальных справочников ФГИАС ПР.
 *
 * ## Чем это отличается от `sync:fgias-nsi`
 *
 * Та сверяет **наши** справочники с реестром: у нас уже есть породы
 * и линии, вопрос в том, где они разошлись. Здесь наоборот — списков
 * у нас нет вовсе, и мы их заводим.
 *
 * Страны, регионы и районы придумывает государство, а не хозяйство:
 * пополнять их некому, сверять не с чем. Это не сверка, а загрузка.
 *
 * ## Почему загрузка, а не обращение к API на лету
 *
 * Выгрузка обязана работать там, где стоит компьютер, а не там, где есть
 * интернет. Ходить за ключом района в момент сборки файла значило бы
 * поставить сдачу отчётности в зависимость от чужого сервера — того
 * самого, у которого обещанного модуля обмена так и не появилось.
 *
 *   npm run sync:fgias-geo            — посмотреть, что приедет
 *   npm run sync:fgias-geo -- --apply — записать
 *
 * ## Повторный прогон не задваивает
 *
 * Записи узнаются по ключу реестра, а не по названию: район могут
 * переименовать, и тогда по названию он завёлся бы вторым. У уже
 * заведённых обновляется название — переименования случаются, и книга
 * должна их подхватывать.
 */

const APPLY = process.argv.includes('--apply')

/**
 * Какие реестры грузим и куда.
 *
 * Тип породы попал в тот же список не потому, что он территориальный,
 * а потому, что судьба у него та же: закрытый чужой список, которого
 * у нас нет, и загружается он тем же способом. Разводить два скрипта
 * ради одной строки значило бы завести вторую дорогу к одной работе.
 */
const LOAD: { code: string; slug: string; label: string }[] = [
  { code: 'countries', slug: 'countries', label: 'Государства' },
  { code: 'regions', slug: 'regions', label: 'Регионы' },
  { code: 'districts', slug: 'districts', label: 'Районы' },
  { code: 'breed_type2', slug: 'breed-types', label: 'Типы пород животных' },
]

async function main() {
  const payload = await getPayload({ config })

  console.log(`\n${APPLY ? 'Загружаем' : 'Сухой прогон — ничего не пишем'}\n`)

  const registries = await listRegistries()
  const byCode = new Map(registries.map((r) => [r.code ?? '', r]))

  let created = 0
  let renamed = 0

  for (const item of LOAD) {
    console.log('─'.repeat(72))
    console.log(`${item.label}  →  ${item.slug}`)

    const registry = byCode.get(item.code)
    if (!registry) {
      console.log(`  ✗ реестра с кодом «${item.code}» во ФГИАС нет\n`)
      continue
    }

    const theirs = await fetchRegistry(registry.uuid)

    /*
     * Свои читаются целиком одним запросом и раскладываются по ключу
     * реестра. Районов тысячи, и поиск по одному на каждую строку
     * означал бы тысячи запросов ради одной загрузки.
     */
    const ours = await payload.find({
      collection: item.slug as never,
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })

    const byUuid = new Map<string, { id: number; name: string }>()
    for (const d of ours.docs as unknown as { id: number; name: string; fgiasUuid?: string | null }[]) {
      if (d.fgiasUuid) byUuid.set(d.fgiasUuid, { id: d.id, name: d.name })
    }

    const toAdd = theirs.filter((t) => !byUuid.has(t.uuid))
    const toRename = theirs.filter((t) => {
      const had = byUuid.get(t.uuid)
      return had && had.name !== t.name
    })

    console.log(
      `  в реестре ${theirs.length}, у нас ${byUuid.size} · ` +
        `новых ${toAdd.length}, переименованных ${toRename.length}`,
    )

    if (toRename.length) {
      console.log('\n  Переименованы в реестре:')
      for (const t of toRename.slice(0, 10)) {
        console.log(`    «${byUuid.get(t.uuid)!.name}» → «${t.name}»`)
      }
      if (toRename.length > 10) console.log(`    … и ещё ${toRename.length - 10}`)
    }

    if (APPLY) {
      for (const t of toAdd) {
        /*
         * `code` у справочника обязателен и уникален. Свой код реестра
         * есть не у всех записей — у районов он пуст, — поэтому туда
         * идёт uuid: он уникален по построению и не спутается с кодом
         * из «Селэкса», которым заполнены наши прежние справочники.
         */
        await payload.create({
          collection: item.slug as never,
          overrideAccess: true,
          data: { code: t.code || t.uuid, name: t.name, fgiasUuid: t.uuid } as never,
        })
        created += 1
      }

      for (const t of toRename) {
        await payload.update({
          collection: item.slug as never,
          id: byUuid.get(t.uuid)!.id,
          overrideAccess: true,
          data: { name: t.name } as never,
        })
        renamed += 1
      }

      console.log(`\n  Записано: новых ${toAdd.length}, переименованных ${toRename.length}`)
    }

    console.log('')
  }

  console.log('─'.repeat(72))
  console.log(
    APPLY
      ? `Заведено ${created}, переименовано ${renamed}.\n`
      : 'Сухой прогон. Чтобы записать: npm run sync:fgias-geo -- --apply\n',
  )

  process.exit(0)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
