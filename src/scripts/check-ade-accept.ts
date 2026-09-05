import { ADE_READ_ONLY_REASON, ADE_WRITABLE, isAdeWritable, parseAdeResource } from '@/lib/ade/parse'
import { ADE_CODE } from '@/lib/ade/errors'
import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { plural } from '@/lib/format'
import { adeInsemination, adeParturition, adeTestDayResult, adeWeight } from '@/lib/ade/resources'

/**
 * Разбор входящих данных ADE — на негодных телах и на своей же выгрузке.
 *
 * ## Почему проверка не ходит в базу
 *
 * Разбор — та часть приёма, где ошибка стоит дороже всего и ловится
 * дешевле всего. Дороже — потому что принятая неправда попадает в книгу
 * и оттуда в лактацию, в индекс, в реестр и в свидетельство. Дешевле —
 * потому что для проверки нужен только текст запроса.
 *
 * Приём в базу проверяется отдельно и по живой базе; отделить одно
 * от другого нужно было именно чтобы эта, дешёвая часть запускалась
 * на каждой сборке, а не раз в месяц.
 *
 * ## Главная проверка здесь — круг
 *
 * Собственная выгрузка подаётся собственному приёму. Это звучит
 * бессмысленно ровно до первого запуска: имена полей у отдачи и приёма
 * писал один человек в разные дни, и разошлись они молча. `milkWeight`
 * против `milkWeight24Hours`, `Fat` против `FAT`, число против строки —
 * каждое такое расхождение означает, что интегратор, забравший у нас
 * данные и вернувший событие обратно, получит отказ и будет прав.
 *
 *   npm run check:ade-accept
 */

const fails: string[] = []
const fail = (m: string) => fails.push(m)

/*
 * Поля мока — те, что есть у настоящей карточки. Здесь стоял
 * `accountingNumber`, которого у животного нет: приём искал по нему
 * учётный идентификатор, находил его в моке — и прогон был зелёным там,
 * где живой запрос отвечал «животное не найдено».
 */
const animal = {
  id: 1,
  identNumber: '1234567890',
  uuid: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
  name: 'Ромашка',
  sex: 'female' as const,
  birthDate: '2021-03-14',
  ownerId: 49,
}

/* ------------------------------------------------------------------ *
 *  Круг: своя выгрузка проходит свой приём                           *
 * ------------------------------------------------------------------ */

const ROUND: [name: string, collection: (typeof ADE_WRITABLE)[number], resource: Record<string, unknown>][] = [
  [
    'контрольное доение',
    'test-day-results',
    adeTestDayResult({
      id: 11,
      animal,
      date: '2026-04-12',
      milk: 34.2,
      fat: 3.82,
      protein: 3.24,
      somaticCells: 120,
      updatedAt: '2026-04-12T10:00:00.000Z',
    }),
  ],
  [
    'отёл',
    'parturitions',
    adeParturition({
      id: 12,
      animal,
      date: '2026-02-20',
      number: 2,
      ease: 'assisted',
      liveHeifers: 1,
      liveBulls: 0,
      stillborn: 0,
      updatedAt: '2026-02-20T10:00:00.000Z',
    }),
  ],
  [
    'взвешивание',
    'weights',
    adeWeight({ id: 13, animal, date: '2026-01-10', weight: 512, updatedAt: null }),
  ],
  [
    'осеменение',
    'inseminations',
    adeInsemination({
      id: 14,
      animal,
      date: '2026-05-03',
      attemptNumber: 1,
      method: 'natural',
      bullIdentNumber: '5555555555',
      bullName: 'Атлант',
      updatedAt: '2026-05-03T10:00:00.000Z',
    }),
  ],
]

for (const [name, collection, resource] of ROUND) {
  const r = parseAdeResource(collection, resource)
  if (!r.ok) {
    fail(
      `${name}: собственная выгрузка не прошла собственный приём — ` +
        r.errors.map((e) => `${e.code}: ${e.title}`).join('; '),
    )
    continue
  }

  /*
   * Мало того, что разобралось: значения обязаны совпасть. Разбор,
   * который принял документ и потерял в нём удой, формально проходит,
   * а на деле пишет в книгу пустую запись.
   */
  if (collection === 'test-day-results') {
    const v = r.value.values
    if (v.dailyYield !== 34.2) fail(`${name}: удой после круга — ${String(v.dailyYield)}, ожидалось 34.2`)
    if (v.fatPercent !== 3.82) fail(`${name}: жир после круга — ${String(v.fatPercent)}, ожидалось 3.82`)
    if (v.somaticCells !== 120) fail(`${name}: соматика после круга — ${String(v.somaticCells)}`)
  }

  if (collection === 'weights' && r.value.values.weight !== 512) {
    fail(`${name}: масса после круга — ${String(r.value.values.weight)}, ожидалось 512`)
  }

  if (collection === 'parturitions') {
    const v = r.value.values
    if (v.liveHeifers !== 1 || v.liveBulls !== 0) {
      fail(`${name}: приплод после круга — тёлочек ${String(v.liveHeifers)}, бычков ${String(v.liveBulls)}`)
    }
    /*
     * Номер отёла обязан пережить круг: у коллекции он обязательный,
     * и отдача кладёт его в `damParity`. Пока разбор его не читал,
     * приём отёлов не мог записать ни одной строки — а этот прогон
     * был зелёным, потому что до записи не доходит.
     */
    if (v.parity !== 2) fail(`${name}: номер отёла после круга — ${String(v.parity)}, ожидалось 2`)
  }

  if (collection === 'inseminations') {
    const v = r.value.values
    const bull = v.bullIdentifier as { id?: string } | null
    if (bull?.id !== '5555555555') fail(`${name}: бык после круга — ${JSON.stringify(bull)}`)
    if (v.method !== 'natural') fail(`${name}: метод после круга — ${String(v.method)}, ожидалось natural`)
  }
}

console.log(`Круг «выгрузка → приём»: ${ROUND.length} ${plural(ROUND.length, 'ресурс', 'ресурса', 'ресурсов')}`)

/* ------------------------------------------------------------------ *
 *  Негодные тела                                                     *
 * ------------------------------------------------------------------ */

const meta = { source: 'ru.example.farmsoft', sourceId: 'abc-1' }
const who = { scheme: 'ru.holstein-russia.animal', id: '1234567890' }
const good = {
  meta,
  animal: who,
  eventDateTime: '2026-04-12T10:00:00Z',
  milkWeight24Hours: { unitCode: 'KGM', value: 30 },
}

const BAD: [what: string, body: unknown, code: string][] = [
  ['не объект', 'строка', ADE_CODE.bodyShape],
  ['нет meta.source', { ...good, meta: { sourceId: 'x' } }, ADE_CODE.fieldMissing],
  ['нет meta.sourceId', { ...good, meta: { source: 'x' } }, ADE_CODE.fieldMissing],
  ['нет животного', { ...good, animal: undefined }, ADE_CODE.fieldMissing],
  ['двоеточие в схеме', { ...good, animal: { scheme: 'a:b', id: '1' } }, ADE_CODE.fieldMissing],
  ['нет даты', { ...good, eventDateTime: undefined }, ADE_CODE.fieldValue],
  ['дата словами', { ...good, eventDateTime: 'March 3 2026' }, ADE_CODE.fieldValue],
  ['только год', { ...good, eventDateTime: '2026' }, ADE_CODE.fieldValue],
  /*
   * Тридцать первое февраля — тот самый случай, ради которого разбор
   * даты не отдан `new Date`: тот молча превращает его в третье марта,
   * и запись уезжает в книгу с датой, которой не было.
   */
  ['31 февраля', { ...good, eventDateTime: '2026-02-31' }, ADE_CODE.fieldValue],
  ['удой строкой', { ...good, milkWeight24Hours: { unitCode: 'KGM', value: '30' } }, ADE_CODE.fieldValue],
  ['удой в фунтах', { ...good, milkWeight24Hours: { unitCode: 'LBR', value: 66 } }, ADE_CODE.fieldValue],
  ['отрицательный удой', { ...good, milkWeight24Hours: { unitCode: 'KGM', value: -1 } }, ADE_CODE.fieldValue],
]

for (const [what, body, code] of BAD) {
  const r = parseAdeResource('test-day-results', body)
  if (r.ok) {
    fail(`«${what}» принято, а должно быть отклонено`)
    continue
  }
  if (!r.errors.some((e) => e.code === code)) {
    fail(`«${what}»: код ${r.errors.map((e) => e.code).join(',')}, ожидался ${code}`)
  }
}

console.log(`Негодных тел отклонено: ${BAD.length}`)

/* ------------------------------------------------------------------ *
 *  Жир запятой                                                       *
 * ------------------------------------------------------------------ */

/*
 * Отдельно от прочих, потому что это самая правдоподобная поломка
 * из всех. «3,5» приходит из программы, склеившей строку из
 * локализованного вывода, — и выглядит настолько нормально, что
 * снисхождение к ней кажется вежливостью. Принятое, оно даёт
 * тридцать пять процентов жира в контрольном доении.
 */
const comma = parseAdeResource('test-day-results', {
  ...good,
  milkCharacteristics: [{ characteristic: 'FAT', value: '3,5' }],
})

if (comma.ok && comma.value.values.fatPercent !== null) {
  fail(`жир «3,5» принят как ${String(comma.value.values.fatPercent)} — запятая должна отвергаться`)
}

/* Точкой — принимается, и это тоже надо утверждать. */
const dot = parseAdeResource('test-day-results', {
  ...good,
  milkCharacteristics: [{ characteristic: 'FAT', value: '3.5' }],
})
if (!dot.ok || dot.value.values.fatPercent !== 3.5) {
  fail('жир «3.5» не разобрался — приём отвергает правильную запись')
}

/* ------------------------------------------------------------------ *
 *  Удаление                                                          *
 * ------------------------------------------------------------------ */

/*
 * Снятие записи приходит без полей события: у источника её больше нет,
 * и требовать от него дату отёла, который он забыл, бессмысленно.
 */
const del = parseAdeResource('parturitions', {
  meta: { ...meta, isDeleted: true },
  animal: who,
})
if (!del.ok) fail('снятие записи отклонено, хотя у него нет и не должно быть полей события')
else if (!del.value.deleted) fail('снятие записи разобрано как обычное событие')

/* ------------------------------------------------------------------ *
 *  Что доступно только на чтение                                     *
 * ------------------------------------------------------------------ */

const readOnly = ADE_COLLECTIONS.filter((c) => !isAdeWritable(c))

for (const c of readOnly) {
  if (!ADE_READ_ONLY_REASON[c]) {
    fail(`коллекция «${c}» закрыта на запись без объяснения — отказ без причины читается как поломка`)
  }
}

console.log(`Коллекций: ${ADE_COLLECTIONS.length}, принимают запись ${ADE_WRITABLE.length}, только чтение ${readOnly.length}`)

/* ------------------------------------------------------------------ */

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ приём разбирает своё, отвергает чужое и объясняет отказы')
process.exit(0)
