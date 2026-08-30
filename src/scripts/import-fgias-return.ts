import 'dotenv/config'
import { existsSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'
import { getPayload } from 'payload'
import config from '@payload-config'
import { readSpreadsheet } from '@/lib/xlsx'
import { RETURN_COLUMNS, columnAt, findHeader, headerKey } from '@/lib/fgias-export'

/**
 * Обратный файл ФГИАС ПР: раскладываем присвоенные номера по животным.
 *
 * ## Место этого скрипта в цепочке
 *
 * Хозяйство сдаёт «Основные сведения», где животное названо только нашим
 * ключом («Идентификатор учётной системы»), и получает обратно тот же
 * файл с проставленными «Базовым номером ФГИАС ПР» и «Регистрационным
 * номером». Без этого шага не работает ничего дальше: во всех остальных
 * шаблонах животное называется базовым номером и ничем иным.
 *
 *   npm run import:fgias-return -- ~/Downloads/обратный.xlsx
 *   npm run import:fgias-return -- ~/Downloads/обратный.xlsx --apply
 *
 * Путь в примерах настоящий, а не в угловых скобках. Первый же прогон
 * этой команды был сделан с подставленным «файл.xlsx» — ровно так,
 * как было написано в подсказке. Заполнитель, который выглядит как имя
 * файла, им и становится.
 *
 * ## Сопоставление только по нашему ключу
 *
 * Строка обратного файла ищется по «Идентификатору учётной системы» —
 * тому самому `animals.uuid`, который мы туда и положили. Ни по кличке,
 * ни по дате рождения, ни по УНЖ.
 *
 * По УНЖ было бы соблазнительно и почти всегда верно, и это «почти» здесь
 * стоит слишком дорого. Индивидуальный номер хозяйство может перебить
 * при перемечивании; наш ключ не меняется никогда. Ошибка сопоставления
 * означала бы, что базовый номер чужого животного лёг в карточку своего,
 * и с этого момента обе выгружаются друг за друга — молча, годами
 * и с полной внешней исправностью.
 *
 * Строка, которую не удалось найти по ключу, попадает в отчёт целиком.
 * Разбирать её должен человек.
 *
 * ## Чужой номер не затирает свой
 *
 * Если у животного базовый номер уже стоит и новый файл несёт другой,
 * запись не меняется, а попадает в список расхождений. Причин может быть
 * две: реестр завёл дубль или файл пришёл от другого хозяйства. Обе
 * требуют разбирательства, и обе портятся молчаливой перезаписью.
 *
 * ## Сухой прогон по умолчанию
 *
 * Тот же порядок, что у сверки справочников: сперва смотрим, потом
 * пишем. Первый выход книги за чужими ключами — не то место, где
 * уместна расторопность.
 */

const APPLY = process.argv.includes('--apply')

const FILE = process.argv.slice(2).find((a) => !a.startsWith('--'))

/* ------------------------------------------------------------------ */

/**
 * Отказ до всякой работы — словами, а не кодом ошибки.
 *
 * Здесь стоял простой `readFileSync`, и первый же прогон кончился
 * строкой `ENOENT: no such file or directory, open 'файл.xlsx'`. Человек
 * подставил заполнитель из подсказки — и получил ответ, из которого
 * не следует ни что он сделал не так, ни что надо было сделать.
 *
 * `ENOENT` — не сообщение пользователю, а сообщение программисту,
 * случайно попавшее наружу. Разница между ним и текстом ниже — это
 * разница между «система сломалась» и «вы дали не то»; первое человек
 * идёт выяснять к нам, второе чинит сам за десять секунд.
 *
 * Заодно проверяется, что это файл, а не папка: перетащить в терминал
 * папку загрузок вместо файла — ошибка того же вечера, и `ENOENT`
 * на неё даже не срабатывает, читается она как «EISDIR» уже из недр
 * разбора книги.
 */
const HOW = [
  'Как надо:',
  '  npm run import:fgias-return -- ~/Downloads/обратный.xlsx',
  '  npm run import:fgias-return -- ~/Downloads/обратный.xlsx --apply',
  '',
  'Обратный файл — это тот, что реестр вернул после приёма «Основных',
  'сведений»: та же таблица, но с проставленными «Базовым номером',
  'ФГИАС ПР» и «Регистрационным номером». Пока хозяйство ничего',
  'не сдавало, такого файла нет ни у кого, и разбирать нечего.',
].join('\n')

async function main() {
  if (!FILE) {
    console.error(`\nНе сказано, какой файл разбирать.\n\n${HOW}\n`)
    process.exit(1)
  }

  const path = resolve(FILE)

  if (!existsSync(path)) {
    console.error(
      `\nТакого файла нет: ${FILE}\n` +
        `Искали здесь: ${path}\n\n` +
        `${HOW}\n`,
    )
    process.exit(1)
  }

  if (statSync(path).isDirectory()) {
    console.error(`\nЭто папка, а не файл: ${path}\n\n${HOW}\n`)
    process.exit(1)
  }

  console.log(`\n${APPLY ? 'Разбираем и пишем номера' : 'Сухой прогон — ничего не пишем'}`)
  console.log(`Файл: ${path}\n`)

  const read = readSpreadsheet(new Uint8Array(readFileSync(path)))
  if ('error' in read) {
    console.error(`Файл не разобрался: ${read.error}\n`)
    process.exit(1)
  }

  const at = findHeader(read.rows)
  if (at === -1) {
    /*
     * Отказ внятный и с показом того, что мы увидели вместо шапки.
     * «Файл не подходит» без первой строки заставляет человека гадать,
     * тот ли лист открылся, — а листов в шаблонах ФГИАС два.
     */
    console.error(
      'Это не похоже на обратный файл: в первых десяти строках нет пары колонок\n' +
        `«Идентификатор учётной системы» и «Базовый номер ФГИАС ПР».\n\n` +
        `Лист: ${read.sheet ?? '—'}` +
        (read.otherSheets?.length ? `, в книге ещё: ${read.otherSheets.join(', ')}` : '') +
        `\nПервая строка: ${(read.rows[0] ?? []).slice(0, 6).join(' | ')}\n`,
    )
    process.exit(1)
  }

  const titles = (read.rows[at] ?? []).map(headerKey)
  const col = (name: string) => columnAt(titles, name)

  const iKey = col(RETURN_COLUMNS.key)
  const iBase = col(RETURN_COLUMNS.base)
  const iReg = col(RETURN_COLUMNS.registration)
  const iUnsm = col(RETURN_COLUMNS.unsm)

  console.log(`Шапка найдена в строке ${at + 1}, лист «${read.sheet ?? '—'}»`)
  console.log(
    `Колонки: ключ ${iKey + 1}, базовый ${iBase + 1}` +
      (iReg === -1 ? ', регистрационного нет' : `, регистрационный ${iReg + 1}`) +
      (iUnsm === -1 ? ', УНСМ нет' : `, УНСМ ${iUnsm + 1}`),
  )

  const payload = await getPayload({ config })

  const cell = (row: string[], i: number): string | null => {
    if (i === -1) return null
    const v = (row[i] ?? '').trim()
    return v === '' ? null : v
  }

  let seen = 0
  let ready = 0
  let already = 0
  let written = 0
  const missing: string[] = []
  const noBase: string[] = []
  const conflicts: { ourKey: string; had: string; came: string }[] = []

  const stamp = new Date().toISOString()

  for (const row of read.rows.slice(at + 1)) {
    const ourKey = cell(row, iKey)
    if (!ourKey) continue
    seen += 1

    const base = cell(row, iBase)
    if (!base) {
      noBase.push(ourKey)
      continue
    }

    const found = await payload.find({
      collection: 'animals',
      where: { uuid: { equals: ourKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const animal = found.docs[0]
    if (!animal) {
      missing.push(ourKey)
      continue
    }

    const had = (animal as { fgias?: { baseUuid?: string | null } }).fgias?.baseUuid ?? null

    if (had === base) {
      already += 1
      continue
    }

    if (had && had !== base) {
      conflicts.push({ ourKey, had, came: base })
      continue
    }

    ready += 1

    if (APPLY) {
      try {
        await payload.update({
          collection: 'animals',
          id: animal.id,
          overrideAccess: true,
          /*
           * Журнал правок пропускается: обратный файл на всё стадо дал бы
           * по три записи на животное и утопил бы в них те несколько,
           * что внесены руками. След у операции свой — этот отчёт
           * и `fgias.syncedAt` в карточке.
           */
          context: { skipJournal: true },
          data: {
            fgias: {
              baseUuid: base,
              registrationUuid: cell(row, iReg),
              unsm: cell(row, iUnsm),
              syncedAt: stamp,
            },
          } as never,
        })
        written += 1
      } catch (e) {
        console.error(`  ✗ ${ourKey}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  /* ------------------------------------------------------------------ */

  console.log(`\n${'─'.repeat(76)}`)
  console.log(`Строк с нашим ключом: ${seen}`)
  console.log(`  номер уже стоит и совпадает: ${already}`)
  console.log(`  номер новый, к записи:       ${ready}`)
  if (APPLY) console.log(`  записано:                    ${written}`)

  if (noBase.length) {
    console.log(
      `\n  Базовый номер в файле не проставлен (${noBase.length}) — реестр эти строки` +
        ' не принял:\n' +
        noBase
          .slice(0, 10)
          .map((k) => `    ${k}`)
          .join('\n'),
    )
    if (noBase.length > 10) console.log(`    … и ещё ${noBase.length - 10}`)
  }

  if (missing.length) {
    /*
     * Ключ из файла, которого нет в книге. Обычно это значит, что файл
     * от другого хозяйства или что карточку у нас удалили после отправки.
     * Догадываться, кто это, скрипт не станет.
     */
    console.log(
      `\n  Ключ есть в файле, но не в книге (${missing.length}) — разбирать человеку:\n` +
        missing
          .slice(0, 10)
          .map((k) => `    ${k}`)
          .join('\n'),
    )
    if (missing.length > 10) console.log(`    … и ещё ${missing.length - 10}`)
  }

  if (conflicts.length) {
    console.log(
      `\n  ⚠ Номер уже стоял, и пришёл другой (${conflicts.length}). Ничего не переписано:\n` +
        conflicts
          .slice(0, 10)
          .map((c) => `    ${c.ourKey}\n      было:  ${c.had}\n      пришло: ${c.came}`)
          .join('\n'),
    )
    console.log(
      '    Либо реестр завёл дубль, либо файл от другого хозяйства. Обе причины\n' +
        '    портятся молчаливой перезаписью, поэтому её здесь нет.',
    )
  }

  console.log('')
  if (!APPLY && ready) {
    console.log(`Чтобы записать: npm run import:fgias-return -- ${FILE} --apply\n`)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
