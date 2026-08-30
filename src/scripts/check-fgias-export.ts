import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { readSpreadsheet, toXlsx } from '@/lib/xlsx'
import {
  DATASETS,
  columnsOf,
  datasetByKey,
  detectDataset,
  matchHeader,
  templateRowsOf,
} from '@/lib/import-format'
import {
  columnAt,
  findHeader,
  headerKey,
  LACTATION_COLUMNS,
  MILK_SIGNUM,
  PEDIGREE_COLUMNS,
  PEDIGREE_NESTS,
  SHOW_COLUMNS,
  buildLactations,
  buildPedigree,
  buildShows,
  chooseSignums,
  fgiasDate,
  fgiasTemplateOf,
  fgiasInt,
  FORECAST_KEY,
  holdSummary,
  idOrigin,
  NO_KEY_LIST_CAP,
  pedigreeGaps,
  withForecastKeys,
  type ExportAnimal,
  type PedigreeSource,
} from '@/lib/fgias-export'
import {
  buildMain,
  fgiasAgeGroup,
  FGIAS_AGE_GROUP,
  MAIN_COLUMNS,
  MAIN_ESSENTIAL,
} from '@/lib/fgias-main'

/**
 * Что уедет во ФГИАС ПР, а что придержано и почему.
 *
 * ## Почему на выдуманных животных, а не на живых
 *
 * Проверка на живой базе отвечает «сегодня уехало 22 тысячи строк»
 * и молчит о том, уедет ли строка, у которой не заполнен белок. Ответ
 * на такие вопросы даёт только придуманное животное с ровно одной дыркой
 * в ровно одном поле — иначе причина теряется среди остальных.
 *
 * Заодно проверка идёт без базы: правила выгрузки от неё не зависят,
 * а прогонять их на машине, где базы нет, приходится чаще, чем хотелось бы.
 *
 * ## Что здесь важнее прочего
 *
 * Три утверждения, ради которых проверка и написана.
 *
 * Первое: наш `uuid` никогда не попадает в колонку «Базовый номер ФГИАС ПР».
 * Это тот самый случай, когда файл выглядит целым, а реестр заводит второе
 * животное рядом с настоящим.
 *
 * Второе: строка с незаполненным обязательным полем не уезжает. Реестр
 * отвергает такие молча и целым файлом.
 *
 * Третье: гнёзда родословной стоят в порядке шаблона, и «МО» — это мать
 * отца, а не отец матери. Перепутать их можно только один раз и навсегда:
 * файл уедет, а разбираться придётся в реестре.
 *
 *   npm run check:fgias-export
 */

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${what}`)
  } else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Полная лактация — от неё отнимают по полю, чтобы проверить придержание. */
const FULL = {
  number: 2,
  calvingDate: '2024-03-15T00:00:00.000Z',
  dd: 305,
  milkYield: 9200,
  milk305: 8800,
  fat305: 3.85,
  fatKg: 338.8,
  protein305: 3.2,
  proteinKg: 281.6,
}

const cow = (over: Partial<ExportAnimal> = {}): ExportAnimal => ({
  identNumber: 'RU0000000070028',
  accountingId: '1a421c44-36d2-41c3-881e-38bf83c4f756',
  baseUuid: '60b5cc43-7b0a-416d-920b-6782c2192fcf',
  lactations: [{ ...FULL }],
  ...over,
})

/* ------------------------------------------------------------------ */

function columns() {
  console.log('\nШапка — слово в слово из шаблона\n')

  check(LACTATION_COLUMNS.length === 13, 'в «Лактации» тринадцать колонок', String(LACTATION_COLUMNS.length))
  check(
    LACTATION_COLUMNS[0]!.title === 'Базовый номер ФГИАС ПР',
    'первая колонка — базовый номер',
    LACTATION_COLUMNS[0]!.title,
  )
  check(
    LACTATION_COLUMNS[4]!.title === 'Дата отела',
    'дата отёла названа так, как в шаблоне, — без «ё»',
    LACTATION_COLUMNS[4]!.title,
  )
  /*
   * «Дней», а не «Дойных дней». Заголовок — единственное, по чему реестр
   * узнаёт колонку, и поправить его «как понятнее» значит переименовать
   * чужое поле.
   */
  check(LACTATION_COLUMNS[5]!.title === 'Дней', 'колонка дней названа «Дней»', LACTATION_COLUMNS[5]!.title)

  check(PEDIGREE_COLUMNS.length === 15, 'в «Родословной» пятнадцать колонок', String(PEDIGREE_COLUMNS.length))
  check(
    PEDIGREE_NESTS.join(',') === 'О,ОО,МО,ООО,МОО,ОМО,ММО,М,ОМ,ММ,ООМ,МОМ,ОММ,МММ',
    'порядок гнёзд — отцовская сторона целиком, затем материнская',
    PEDIGREE_NESTS.join(','),
  )
  /*
   * Колонки «Идентификатор учётной системы» в родословной нет вовсе,
   * и это не упущение шаблона, а его свойство: назвать предка можно
   * только базовым номером реестра.
   */
  check(
    !PEDIGREE_COLUMNS.some((c) => c.title.includes('учётной')),
    'в родословной нет колонки для нашего ключа — назвать предка можно только номером реестра',
  )
}

/* ------------------------------------------------------------------ */

function values() {
  console.log('\nПриведение значений\n')

  check(fgiasDate('2024-03-15T00:00:00.000Z') === '2024-03-15', 'дата обрезается до дня')
  /*
   * Полночь UTC — тот самый случай, на котором ломается любой разбор
   * через `Date`: западнее Гринвича она превращается во вчерашний день.
   * Здесь дата не разбирается вовсе, а обрезается, и часовой пояс машины
   * на ответ не влияет.
   */
  check(fgiasDate('2024-01-01T00:00:00.000Z') === '2024-01-01', 'полночь первого января не съезжает на 31 декабря')
  check(fgiasDate('15.03.2024') === undefined, 'дата в чужом виде не подправляется, а возвращается пустой')
  check(fgiasDate(null) === undefined, 'пустая дата остаётся пустой')

  const whole = fgiasInt(305)
  check(whole.value === 305 && !whole.rounded, 'целое проходит без округления')
  const half = fgiasInt(8450.5)
  check(half.value === 8451 && half.rounded, 'дробное округляется и объявляет об этом', JSON.stringify(half))
  check(fgiasInt('8450').value === undefined, 'строка вместо числа не разбирается молча')
  /*
   * Ноль — заполненное значение, а не пустота. Проверка, для которой
   * нулевой удой равен незаполненному, придержала бы строку про корову,
   * которая в эту лактацию не доилась, — то есть скрыла бы факт вместо
   * того, чтобы его отдать.
   */
  check(fgiasInt(0).value === 0, 'ноль — это значение, а не пустота')
}

/* ------------------------------------------------------------------ */

function lactations() {
  console.log('\nЛактации: что уезжает\n')

  const ok = buildLactations([cow()])
  check(ok.rows.length === 1, 'полная лактация уезжает', `строк ${ok.rows.length}`)
  check(ok.held.length === 0, 'и ничего не придержано')

  const row = ok.rows[0]!
  check(row.length === 13, 'в строке тринадцать значений', String(row.length))
  check(row[0] === '60b5cc43-7b0a-416d-920b-6782c2192fcf', 'первым идёт базовый номер реестра')
  check(row[1] === '', '«Идентификатор ФГИАС ПР» у новой записи пуст')
  check(row[2] === '1a421c44-36d2-41c3-881e-38bf83c4f756', 'наш ключ — в «Идентификаторе учётной системы»')
  check(row[4] === '2024-03-15', 'дата отёла в виде ГГГГ-ММ-ДД', String(row[4]))
  check(row[6] === MILK_SIGNUM.highest, 'единственная лактация помечена наивысшей')

  /*
   * Главное утверждение всей проверки. Наш `uuid` — не номер реестра,
   * и попасть в его колонку он не может ни при каких данных.
   */
  console.log('\nЛактации: наш ключ не выдаётся за номер реестра\n')

  const noBase = buildLactations([cow({ baseUuid: null })])
  check(noBase.rows.length === 0, 'без базового номера не уезжает ничего')
  check(
    noBase.held[0]?.why === 'Базовый номер ФГИАС ПР',
    'и причина названа полем, а не общими словами',
    String(noBase.held[0]?.why),
  )
  check(
    noBase.held.length === 1,
    'придержано одно животное, а не каждая его лактация по отдельности',
    `записей ${noBase.held.length}`,
  )

  console.log('\nЛактации: незаполненное обязательное поле придерживает строку\n')

  const cases: [keyof typeof FULL, string][] = [
    ['number', 'Номер лактации'],
    ['calvingDate', 'Дата отела'],
    ['dd', 'Дней'],
    ['milkYield', 'Удой, кг'],
    ['milk305', 'Удой 305, кг'],
    ['fat305', 'Жир, %'],
    ['fatKg', 'Жир, кг'],
    ['protein305', 'Белок, %'],
    ['proteinKg', 'Белок, кг'],
  ]

  for (const [field, title] of cases) {
    const broken = { ...FULL, [field]: null }
    const res = buildLactations([cow({ lactations: [broken] })])
    check(
      res.rows.length === 0 && res.held[0]?.why === title,
      `без «${title}» строка придержана и поле названо`,
      `строк ${res.rows.length}, причина ${String(res.held[0]?.why)}`,
    )
  }

  console.log('\nЛактации: «Признак»\n')

  const many = buildLactations([
    cow({
      lactations: [
        { ...FULL, number: 1, milk305: 7000 },
        { ...FULL, number: 2, milk305: 9500 },
        { ...FULL, number: 3, milk305: 8100 },
      ],
    }),
  ])
  check(many.rows.length === 3, 'все три лактации уехали')
  check(
    many.rows.map((r) => r[6]).join(' ') ===
      `${MILK_SIGNUM.middle} ${MILK_SIGNUM.highest} ${MILK_SIGNUM.middle}`,
    'наивысшей помечена вторая — у неё больший удой за 305 дней',
  )

  /*
   * Равенство разрешается меньшим номером. Утверждение выглядит мелочью,
   * но без него файл менялся бы между прогонами при одних и тех же
   * данных, и сверка двух выгрузок перестала бы что-либо значить.
   */
  const tie = chooseSignums([
    { number: 3, milk305: 8000 },
    { number: 1, milk305: 8000 },
  ])
  check(tie[1] === MILK_SIGNUM.highest, 'при равном удое наивысшей считается лактация с меньшим номером')

  /*
   * У лактации без удоя вовсе наивысшей быть нечему — но строка и так
   * придержана раньше, за незаполненный удой. Проверяем сам выбор.
   */
  const nothing = chooseSignums([{ number: 1 }, { number: 2 }])
  check(
    nothing.every((s) => s === MILK_SIGNUM.middle),
    'когда сравнивать нечего, наивысшая не назначается наугад',
  )

  const off = buildLactations([cow()], { signum: false })
  check(off.rows.length === 0, 'с выключенным признаком строки не уезжают')
  check(off.held[0]?.why === 'Признак', 'и причина названа прямо', String(off.held[0]?.why))
}

/* ------------------------------------------------------------------ */

function pedigree() {
  console.log('\nРодословная: гнёзда читаются справа налево\n')

  /*
   * Четыре животных: телка, её отец, мать отца и отец матери отца.
   * Пути выбраны нарочно смешанные — «МО» и «ОМО» ловят перестановку
   * порядка чтения, тогда как «ОО» на ней ничего не показывает.
   */
  const herd: PedigreeSource[] = [
    { id: 1, identNumber: 'RU-ТЁЛКА', baseUuid: 'u-1', fatherId: 2, motherId: null },
    { id: 2, identNumber: 'RU-ОТЕЦ', baseUuid: 'u-2', fatherId: null, motherId: 3 },
    { id: 3, identNumber: 'RU-МАТЬ-ОТЦА', baseUuid: 'u-3', fatherId: 4, motherId: null },
    { id: 4, identNumber: 'RU-ОТЕЦ-МАТЕРИ-ОТЦА', baseUuid: 'u-4', fatherId: null, motherId: null },
  ]

  const res = buildPedigree(herd)
  const row = res.rows.find((r) => r[0] === 'u-1')
  check(Boolean(row), 'строка тёлки собралась')

  const at = (code: string) => row?.[1 + PEDIGREE_NESTS.indexOf(code as never)]

  check(at('О') === 'u-2', 'О — отец', String(at('О')))
  check(at('М') === '', 'М пуст: матери у тёлки нет', String(at('М')))
  check(at('МО') === 'u-3', 'МО — мать отца, а не отец матери', String(at('МО')))
  check(at('ОО') === '', 'ОО пуст: отца у отца нет', String(at('ОО')))
  check(at('ОМО') === 'u-4', 'ОМО — отец матери отца', String(at('ОМО')))

  console.log('\nРодословная: предок без номера реестра даёт пустое гнездо\n')

  const unregistered: PedigreeSource[] = [
    { id: 1, identNumber: 'RU-ТЁЛКА', baseUuid: 'u-1', fatherId: 2, motherId: 3 },
    /* Отец заведён у нас, но в реестре его нет. */
    { id: 2, identNumber: 'RU-ОТЕЦ', baseUuid: null, fatherId: null, motherId: null },
    { id: 3, identNumber: 'RU-МАТЬ', baseUuid: 'u-3', fatherId: null, motherId: null },
  ]

  const res2 = buildPedigree(unregistered)
  const row2 = res2.rows.find((r) => r[0] === 'u-1')
  check(row2?.[1] === '', 'отец без номера реестра — пустое гнездо, а не наш ключ', String(row2?.[1]))
  check(row2?.[1 + PEDIGREE_NESTS.indexOf('М')] === 'u-3', 'мать с номером на месте')

  console.log('\nРодословная: пустые строки не уезжают\n')

  const alone = buildPedigree([
    { id: 1, identNumber: 'RU-ОДИНОКАЯ', baseUuid: 'u-1', fatherId: null, motherId: null },
  ])
  check(alone.rows.length === 0, 'животное без единого предка строку не даёт')
  check(
    alone.held[0]?.why === 'ни одного предка с базовым номером ФГИАС',
    'причина названа',
    String(alone.held[0]?.why),
  )

  const noBase = buildPedigree([
    { id: 1, identNumber: 'RU-НЕЗАРЕГИСТРИРОВАНА', baseUuid: null, fatherId: 2, motherId: null },
    { id: 2, identNumber: 'RU-ОТЕЦ', baseUuid: 'u-2', fatherId: null, motherId: null },
  ])
  check(noBase.rows.length === 0, 'животное без своего номера реестра строку не даёт')
  check(noBase.held[0]?.why === 'Базовый номер ФГИАС ПР', 'и причина — именно свой номер')

  /*
   * Родословная не зацикливается. Связь «сам себе предок» в книге
   * запрещена проверками, но приехать она может загрузкой чужого файла,
   * и обход, который её не переживёт, повесит выгрузку целиком.
   */
  console.log('\nРодословная: круг в связях не вешает обход\n')
  const loop = buildPedigree([
    { id: 1, identNumber: 'RU-КРУГ-1', baseUuid: 'u-1', fatherId: 2, motherId: null },
    { id: 2, identNumber: 'RU-КРУГ-2', baseUuid: 'u-2', fatherId: 1, motherId: null },
  ])
  check(loop.rows.length === 2, 'обе строки собрались, а не зациклились', `строк ${loop.rows.length}`)

  /*
   * Разбор пробелов по видам номера. Утверждения написаны по живому
   * прогону: он показал 1597 связей, у всех предок без номера реестра,
   * и в примерах шли HOUSA — американские быки, которых хозяйство сдать
   * в «Основных сведениях» не может. Общий счётчик это прятал.
   */
  console.log('\nРодословная: чей предок — своё, чужое, внутрихозяйственное\n')

  check(idOrigin('rf') === 'ours', 'национальный номер — свой')
  check(idOrigin('rus') === 'ours', 'международный XXRUS — тоже свой')
  check(idOrigin('usa') === 'foreign', 'HOUSA — чужой')
  check(idOrigin('icar') === 'foreign', 'ICAR — чужой')
  check(idOrigin('internal') === 'internal', 'внутрихозяйственный — свой третий случай')
  /*
   * Пустой формат уходит во «внутрихозяйственные», а не в «свои».
   * Выбор в сторону осторожности: записать животное с неизвестным видом
   * номера в «сдадим сами» значит пообещать работу, которая может
   * не получиться.
   */
  check(idOrigin(null) === 'internal', 'без вида номера — не «свой», а «непонятно чей»')

  const mixed: PedigreeSource[] = [
    { id: 1, identNumber: 'RU-ТЁЛКА', idFormat: 'rf', fatherId: 2, motherId: 3 },
    { id: 2, identNumber: 'HOUSA13599440', idFormat: 'usa', fatherId: null, motherId: null },
    { id: 3, identNumber: 'RU-МАТЬ', idFormat: 'rf', fatherId: 4, motherId: null },
    { id: 4, identNumber: 'ДЕД-БЕЗ-НОМЕРА', idFormat: 'internal', fatherId: null, motherId: null },
    /* Ссылка на животное вне выборки — при выгрузке одного хозяйства обычное дело. */
    { id: 5, identNumber: 'RU-СИРОТА', idFormat: 'rf', fatherId: 999, motherId: null },
  ]

  const gaps = pedigreeGaps(mixed)
  check(gaps.links === 3, 'связей внутри выборки три', String(gaps.links))
  check(gaps.dangling === 1, 'ссылка на родителя вне выборки посчитана отдельно', String(gaps.dangling))
  check(gaps.noKey.ours === 1, 'своих без номера — один', String(gaps.noKey.ours))
  check(gaps.noKey.foreign === 1, 'иностранных без номера — один', String(gaps.noKey.foreign))
  check(gaps.noKey.internal === 1, 'внутрихозяйственных — один', String(gaps.noKey.internal))

  /*
   * И обратное: предок с номером реестра в пробелы не попадает вовсе.
   * Без этого утверждения разбор считал бы всех подряд и был бы просто
   * переписью связей.
   */
  const registered = pedigreeGaps([
    { id: 1, identNumber: 'RU-ТЁЛКА', idFormat: 'rf', fatherId: 2, motherId: null },
    { id: 2, identNumber: 'RU-ОТЕЦ', idFormat: 'rf', baseUuid: 'u-2', fatherId: null, motherId: null },
  ])
  check(
    registered.links === 1 && registered.noKey.ours === 0,
    'предок с номером реестра в пробелы не попадает',
    JSON.stringify(registered.noKey),
  )

  /*
   * Различные предки против связей — то, ради чего счётчик заведён.
   * Один бык на трёх дочерях даёт три связи и одну работу; отчёт,
   * считающий только связи, завысил бы объём втрое.
   */
  console.log('\nРодословная: один бык на трёх дочерях — три связи, одна работа\n')

  const popular = pedigreeGaps([
    { id: 1, identNumber: 'HOUSA13599440', idFormat: 'usa', fatherId: null, motherId: null },
    { id: 2, identNumber: 'RU-ДОЧЬ-1', idFormat: 'rf', fatherId: 1, motherId: null },
    { id: 3, identNumber: 'RU-ДОЧЬ-2', idFormat: 'rf', fatherId: 1, motherId: null },
    { id: 4, identNumber: 'RU-ДОЧЬ-3', idFormat: 'rf', fatherId: 1, motherId: null },
  ])
  check(popular.noKey.foreign === 3, 'связей с быком три', String(popular.noKey.foreign))
  check(
    popular.noKeyAnimals.foreign === 1,
    'а различный предок один — номер узнавать один раз',
    String(popular.noKeyAnimals.foreign),
  )
  check(
    popular.noKeyList.foreign.join(',') === 'HOUSA13599440',
    'и он назван поимённо — двенадцать номеров человек выпишет, «12» не выпишет',
    popular.noKeyList.foreign.join(','),
  )

  /*
   * Список ограничен сверху. Без потолка две с половиной сотни российских
   * предков утопили бы те двенадцать иностранных, ради которых он и заведён.
   */
  const many: PedigreeSource[] = [
    ...Array.from({ length: NO_KEY_LIST_CAP + 10 }, (_, i) => ({
      id: 1000 + i,
      identNumber: `RU-ПРЕДОК-${i}`,
      idFormat: 'rf',
      fatherId: null,
      motherId: null,
    })),
    ...Array.from({ length: NO_KEY_LIST_CAP + 10 }, (_, i) => ({
      id: 2000 + i,
      identNumber: `RU-ПОТОМОК-${i}`,
      idFormat: 'rf',
      fatherId: 1000 + i,
      motherId: null,
    })),
  ]
  const capped = pedigreeGaps(many)
  check(
    capped.noKeyAnimals.ours === NO_KEY_LIST_CAP + 10,
    'считаются все предки без номера',
    String(capped.noKeyAnimals.ours),
  )
  check(
    capped.noKeyList.ours.length === NO_KEY_LIST_CAP,
    'а запоминается лишь потолок — счёт и список это разное',
    String(capped.noKeyList.ours.length),
  )
}

/* ------------------------------------------------------------------ */

function summary() {
  console.log('\nСвод придержанных — по причине, а не по номеру\n')

  const res = buildLactations([
    cow({ identNumber: 'RU-1', baseUuid: null }),
    cow({ identNumber: 'RU-2', baseUuid: null }),
    cow({ identNumber: 'RU-3', lactations: [{ ...FULL, fatKg: null }] }),
  ])

  const rows = holdSummary(res.held)
  check(rows[0]?.why === 'Базовый номер ФГИАС ПР' && rows[0]?.count === 2, 'самая частая причина сверху')
  check(rows.length === 2, 'причин ровно две', String(rows.length))
}

/* ------------------------------------------------------------------ */

/**
 * Сверка шапки с настоящим файлом шаблона — когда он есть на диске.
 *
 * ## Почему это отдельно от остальных утверждений
 *
 * Всё, что выше, сверяет наш код с нашим же представлением о шаблоне.
 * Если заголовок переписан на слух и в шаблоне он другой, ни одно
 * из тех утверждений этого не заметит: они сравнивают строку с той же
 * строкой. Поймать такое может только сам файл ФГИАС.
 *
 * ## Почему проверка необязательная, но не молчаливая
 *
 * Шаблоны в репозиторий не кладутся: это чужие файлы, они меняются
 * с версиями реестра, и хранить их у себя значит однажды сверяться
 * с прошлогодними. Лежат они в `data/shablony-fgias/`, а `/data`
 * в `.gitignore`.
 *
 * Но проверка, которая при отсутствии файлов просто проходит, — это
 * проверка, которая врёт: зелёный прогон означал бы «шапка сверена»,
 * а сверять было нечем. Поэтому отсутствие файлов печатается словами,
 * с указанием, куда их положить.
 */
function templates() {
  console.log('\nШапка против настоящего файла шаблона\n')

  const DIR = 'data/shablony-fgias'

  const cases: { file: string; titles: string[]; label: string }[] = [
    {
      file: 'КРС_Лактация_молочная_продуктивность_v.1.4_2.6.0.xlsx',
      titles: LACTATION_COLUMNS.map((c) => c.title),
      label: 'Лактация',
    },
    {
      /*
       * У выставок вторая колонка называется «Идентификатор **строки**
       * ФГИАС ПР», а не «Идентификатор ФГИАС ПР», как в «Лактации».
       * Реестр называет одно и то же по-разному от шаблона к шаблону,
       * и поймать это может только сверка с настоящим файлом.
       */
      file: 'КРС_Участие_в_выставках_и_соревнованиях_v1.1_2.6.0.xlsx',
      titles: SHOW_COLUMNS.map((c) => c.title),
      label: 'Выставки',
    },
    {
      file: 'КРС_Родословная_v1.1_2.6.0.xlsx',
      titles: PEDIGREE_COLUMNS.map((c) => c.title),
      label: 'Родословная',
    },
  ]

  let checked = 0

  for (const c of cases) {
    const path = join(DIR, c.file)
    if (!existsSync(path)) continue
    checked += 1

    const read = readSpreadsheet(new Uint8Array(readFileSync(path)))
    if ('error' in read) {
      check(false, `${c.label}: шаблон прочитан`, read.error)
      continue
    }

    const theirs = (read.rows[0] ?? []).map((s) => s.trim()).filter((s) => s !== '')

    check(
      theirs.length === c.titles.length,
      `${c.label}: колонок столько же, сколько в шаблоне`,
      `у нас ${c.titles.length}, в шаблоне ${theirs.length}`,
    )

    /*
     * Сравнение построчное, а не множествами: порядок колонок значит
     * ровно столько же, сколько их состав. Файл с правильным набором
     * заголовков в неправильном порядке уедет и разложит значения
     * по соседним полям.
     */
    theirs.forEach((their, i) => {
      const ours = c.titles[i]
      check(ours === their, `${c.label}: колонка ${i + 1} — «${their}»`, `у нас «${ours ?? '—'}»`)
    })
  }

  /*
   * Отдельно и обязательно: настоящий шаблон «Основные сведения» должен
   * опознаваться разбором обратного файла.
   *
   * Утверждение написано по следу: первая редакция разбора приводила
   * к сравнимому виду только заголовки из файла, а искомые названия
   * держала приведёнными руками — и в одном из них осталась «ё». Файл
   * давал «учетной», константа «учётной», и разбор объявлял не подходящим
   * файл, у которого нужная пара колонок стоит в первой строке.
   *
   * Поймать это могла только проверка на настоящем файле: обе строки
   * выглядят одинаково, различает их точка над буквой. Поэтому сверка
   * идёт не с нашим представлением о шапке, а с шапкой.
   */
  const osnovnye = join(DIR, 'КРС_Основные_сведения_v.2.1_2.6.0.xlsx')
  if (existsSync(osnovnye)) {
    const read0 = readSpreadsheet(new Uint8Array(readFileSync(osnovnye)))
    if (!('error' in read0)) {
      /*
       * Сорок шесть заголовков против сорока шести наших. Часть из них
       * в файле записана в две строки внутри ячейки, поэтому сравнение
       * идёт по приведённому виду — иначе не сойдётся ни один такой.
       */
      const theirs = (read0.rows[0] ?? []).map((t) => t.trim()).filter((t) => t !== '')
      check(
        MAIN_COLUMNS.length === theirs.length,
        `Основные сведения: колонок столько же (${theirs.length})`,
        `у нас ${MAIN_COLUMNS.length}`,
      )
      const wrong = theirs
        .map((their, i) => ({ i, their, ours: MAIN_COLUMNS[i]?.title }))
        .filter((p) => headerKey(p.ours ?? '') !== headerKey(p.their))
      check(
        wrong.length === 0,
        'Основные сведения: все сорок шесть заголовков сходятся',
        wrong.map((w) => `#${w.i + 1} «${w.their}» ≠ «${w.ours ?? '—'}»`).join(' | '),
      )
    }

    checked += 1
    const read = readSpreadsheet(new Uint8Array(readFileSync(osnovnye)))
    if ('error' in read) {
      check(false, 'обратный файл: шаблон прочитан', read.error)
    } else {
      const at = findHeader(read.rows)
      check(at === 0, 'обратный файл: шапка «Основных сведений» опознана', `строка ${at + 1}`)

      const titles = (read.rows[Math.max(at, 0)] ?? []).map(headerKey)
      /*
       * «УНСМ» и «УНЖ» реестр пишет с пояснением в скобках, поэтому
       * колонка ищется по началу заголовка. Требование точного совпадения
       * не нашло бы ни ту, ни другую.
       */
      for (const wanted of [
        'Идентификатор учётной системы',
        'Базовый номер ФГИАС ПР',
        'Регистрационный номер ФГИАС ПР',
        'УНСМ',
      ]) {
        check(columnAt(titles, wanted) !== -1, `обратный файл: колонка «${wanted}» найдена`)
      }

      /*
       * Приведение работает в обе стороны. Утверждение мелкое и ровно
       * про ту ошибку, что была: «ё» с одной стороны не должна мешать.
       */
      check(
        headerKey('Идентификатор учётной системы') === headerKey('идентификатор учетной СИСТЕМЫ'),
        'обратный файл: «ё», регистр и пробелы не мешают совпадению',
      )
    }
  }

  if (checked === 0) {
    console.log(
      `  ⚠ Шаблонов в ${DIR} нет — шапка сверена только сама с собой.\n` +
        '    Положите туда файлы с fgias-pr.mcx.ru, и проверка сравнит заголовки\n' +
        '    с настоящими. Папка в .gitignore: чужие файлы в репозиторий не кладём,\n' +
        '    иначе однажды будем сверяться с прошлогодней версией.',
    )
  }
}

/* ------------------------------------------------------------------ */

/**
 * Собранный файл, прочитанный обратно.
 *
 * ## Зачем круг
 *
 * Всё выше проверяет таблицу в памяти, а во ФГИАС уезжает книга Excel.
 * Между таблицей и книгой лежит `toXlsx`, и там у ячейки появляется тип —
 * то самое место, где номер теряет ведущий ноль, а дата превращается
 * в число и показывается по-разному у отправителя и получателя.
 *
 * Проверять это рассуждением бессмысленно: круг «собрали — прочитали —
 * сравнили» отвечает на вопрос прямо и стоит трёх десятков строк.
 *
 * Читается файл тем же `readSpreadsheet`, которым книга разбирает чужие
 * загрузки. Это не совсем то же, что сделает ФГИАС, но ближе всего,
 * что у нас есть, — и уж во всяком случае ближе, чем ничего.
 */
function roundtrip() {
  console.log('\nКруг: собрали книгу — прочитали обратно\n')

  const built = buildLactations([cow()])
  const buf = toXlsx(
    built.columns.map((c) => ({
      title: c.title,
      numeric: c.type === 'int' || c.type === 'float',
      width: c.width,
    })),
    built.rows,
    { sheetName: 'Пример' },
  )

  const read = readSpreadsheet(new Uint8Array(buf))
  if ('error' in read) {
    check(false, 'собранная книга читается', read.error)
    return
  }

  const head = read.rows[0] ?? []
  const row = read.rows[1] ?? []

  check(head[0] === 'Базовый номер ФГИАС ПР', 'шапка на месте', String(head[0]))
  check(row.length === 13, 'в строке тринадцать ячеек', String(row.length))

  /*
   * Три утверждения, ради которых круг и написан. Uuid остался uuid,
   * дата осталась днём, а не превратилась в число, и пустая колонка
   * не съехала — иначе все значения правее сдвинулись бы на одно.
   */
  check(
    row[0] === '60b5cc43-7b0a-416d-920b-6782c2192fcf',
    'базовый номер пережил книгу и остался строкой',
    String(row[0]),
  )
  check(row[1] === '', 'пустая колонка осталась на месте и не сдвинула соседей', `«${String(row[1])}»`)
  check(row[4] === '2024-03-15', 'дата осталась днём, а не стала числом Excel', String(row[4]))
  check(row[7] === '9200', 'удой прочитался числом', String(row[7]))
  check(row[9] === '3.85', 'жир не потерял дробную часть', String(row[9]))
}

/**
 * Прогноз «а если номера придут завтра».
 *
 * Два утверждения. Первое: подстановка ключа снимает именно ту причину,
 * а прочие проверки остаются настоящими — иначе прогноз обещал бы больше,
 * чем будет. Второе: подставленный ключ невозможно принять за настоящий,
 * потому что тихий правдоподобный заполнитель здесь был бы ровно тем,
 * против чего написана вся эта выгрузка.
 */
function forecastKeys() {
  console.log('\nПрогноз: подставленный ключ снимает одну причину и не притворяется uuid\n')

  check(!/^[0-9a-f-]{36}$/.test(FORECAST_KEY), 'заполнитель не похож на uuid', FORECAST_KEY)
  check(FORECAST_KEY.includes('НЕ-ДЛЯ-ФАЙЛА'), 'и говорит о себе прямо')

  const held = buildLactations([cow({ baseUuid: null })])
  check(held.rows.length === 0, 'без номера не уезжает ничего')

  const ahead = buildLactations(withForecastKeys([cow({ baseUuid: null })]))
  check(ahead.rows.length === 1, 'с подставленным — уезжает', `строк ${ahead.rows.length}`)

  /*
   * И главное: прогноз не прощает остального. Лактация без белка
   * придержана и с ключом — иначе он обещал бы работающую выгрузку там,
   * где её не будет.
   */
  const broken = buildLactations(
    withForecastKeys([cow({ baseUuid: null, lactations: [{ ...FULL, proteinKg: null }] })]),
  )
  check(broken.rows.length === 0, 'но незаполненный белок он не прощает')
  check(broken.held[0]?.why === 'Белок, кг', 'и называет поле', String(broken.held[0]?.why))

  /* Исходные записи прогноз не портит: подставляется копия. */
  const source = [cow({ baseUuid: null })]
  withForecastKeys(source)
  check(source[0]!.baseUuid === null, 'исходные записи прогноз не трогает', String(source[0]!.baseUuid))
}

/**
 * Половозрастная группа: три наши схлопываются в одну, а одна требует пола.
 */
function ageGroups() {
  console.log('\nОсновные сведения: половозрастная группа против реестра\n')

  check(fgiasAgeGroup('bull') === FGIAS_AGE_GROUP.bull, 'бык-производитель → Бык')
  check(fgiasAgeGroup('heifer') === FGIAS_AGE_GROUP.heifer, 'тёлка → Телка')

  /*
   * Первотёлка, вторая и третья лактации — для реестра все просто
   * «Корова». Различение по лактациям наше и уезжает своим шаблоном.
   */
  check(
    fgiasAgeGroup('firstCalf') === FGIAS_AGE_GROUP.cow &&
      fgiasAgeGroup('cow2') === FGIAS_AGE_GROUP.cow &&
      fgiasAgeGroup('cow3') === FGIAS_AGE_GROUP.cow,
    'первотёлка, 2 лакт. и 3+ лакт. — все три в «Корову»',
  )

  check(fgiasAgeGroup('calf', 'male') === FGIAS_AGE_GROUP.bullCalf, 'телёнок-самец → Бычок')
  check(fgiasAgeGroup('calf', 'female') === FGIAS_AGE_GROUP.heifer, 'телёнок-самка → Телка')
  /*
   * У реестра есть значение «Не определено», и подставлять его здесь
   * было бы ложью: оно значит «посмотрели и не поняли», а мы
   * не посмотрели.
   */
  check(fgiasAgeGroup('calf', null) === undefined, 'телёнок без пола не раскладывается наугад')
  check(fgiasAgeGroup(null) === undefined, 'пустая группа не раскладывается')

  const groups = new Set(Object.values(FGIAS_AGE_GROUP))
  check(groups.size === 4, 'четыре различных ключа реестра, а не шесть', String(groups.size))
}

/**
 * Сборка «Основных сведений»: длина строки, порядок и два режима.
 */
function mainSheet() {
  console.log('\nОсновные сведения: сборка строки\n')

  const animal = {
    identNumber: 'RU0000000070028',
    accountingId: '1a421c44-36d2-41c3-881e-38bf83c4f756',
    name: 'Зорька',
    birthDate: '2021-03-15T00:00:00.000Z',
    sex: 'female',
    ageGroup: 'cow2',
    ageGroupDate: '2024-03-15T00:00:00.000Z',
    bloodPercent: 87.5,
    breedUuid: '1bd6b3f1-648a-453b-8529-f2907442d487',
    owner: { name: 'ООО «Пример»', inn: '3924003136', kpp: '392401001' },
  }

  const built = buildMain([animal])
  check(built.rows.length === 1, 'строка собралась')

  const row = built.rows[0]!
  check(
    row.length === MAIN_COLUMNS.length,
    `в строке ${MAIN_COLUMNS.length} значений — ровно по числу колонок`,
    String(row.length),
  )

  const at = (title: string) => row[MAIN_COLUMNS.findIndex((c) => c.title === title)]
  check(at('Идентификатор учётной системы') === animal.accountingId, 'наш ключ стоит первым')
  check(at('Базовый номер ФГИАС ПР') === '', 'базовый номер пуст — его выдаёт реестр')
  check(at('УНЖ (Уникальный номер животного)') === 'RU0000000070028', 'УНЖ на месте')
  check(at('Половозрастная группа') === FGIAS_AGE_GROUP.cow, 'корова 2 лакт. → Корова')
  check(at('Дата рождения') === '2021-03-15', 'дата рождения в виде ГГГГ-ММ-ДД', String(at('Дата рождения')))
  check(at('Кровность, %') === 87.5, 'кровность числом, а не строкой', String(at('Кровность, %')))
  check(at('ИНН собственника') === '3924003136', 'ИНН собственника подставлен')
  check(at('Дата импорта') === '', 'то, чего книга не ведёт, уходит пустым')

  /*
   * По умолчанию уезжает всё: придержать строку здесь значит не получить
   * по ней номер, то есть заморозить животное во всей выгрузке навсегда.
   */
  console.log('\nОсновные сведения: два режима\n')

  const thin = { identNumber: 'RU-БЕЗ-КЛИЧКИ', accountingId: 'k', ageGroup: 'cow2' }
  const loose = buildMain([thin])
  check(loose.rows.length === 1, 'без клички строка всё равно уезжает — режим по умолчанию')
  check(loose.held.length === 0, 'и ничего не придержано')

  const strict = buildMain([thin], { strict: true })
  check(strict.rows.length === 0, 'в строгом режиме — придержана')
  check(strict.held[0]?.why === 'Кличка', 'и причина названа заголовком колонки', String(strict.held[0]?.why))

  /* Заполненность считается по колонкам — это и есть отчёт до отправки. */
  check(built.filled.get('Кличка') === 1, 'заполненность колонки посчитана')
  check(built.filled.get('Дата импорта') === 0, 'незаполненная колонка честно нулевая')

  check(
    MAIN_ESSENTIAL.every((t) => MAIN_COLUMNS.some((c) => c.title === t)),
    'все существенные поля есть среди колонок — опечатка в названии не пройдёт',
  )
}

/**
 * Загрузка шаблонов ФГИАС: сколько колонок книга узнаёт.
 *
 * ## Зачем это здесь
 *
 * У хозяйства уже лежат файлы, заполненные по шаблонам реестра, — оно
 * сдаёт их каждый месяц. Загрузить их к нам как есть быстрее, чем
 * перекладывать в наш формат, и разговор с хозяйством начинается
 * с честного числа: сколько колонок мы принимаем сегодня.
 *
 * Число печатается, а не проверяется на равенство: оно должно расти,
 * и утверждение «ровно одиннадцать» пришлось бы править при каждом
 * улучшении. Проверяется другое — что не стало хуже и что двух колонок
 * с одним назначением не появилось.
 */
function fgiasImport() {
  console.log('\nЗагрузка шаблонов ФГИАС: что книга узнаёт в чужой шапке\n')

  const DIR = 'data/shablony-fgias'
  const file = join(DIR, 'КРС_Основные_сведения_v.2.1_2.6.0.xlsx')
  const ds = datasetByKey('animals')

  if (!ds) {
    check(false, 'набор «Животные» найден')
    return
  }

  /*
   * Два заголовка, ведущих в одно поле, — молчаливая перезапись: какой
   * победит, решает их порядок в файле. Так «Импортное наименование/
   * кличка» однажды затирало русскую кличку иностранной.
   *
   * Проверяется весь набор, а не только шапка ФГИАС: столкнуться могут
   * любые два синонима.
   */
  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const c of columnsOf(ds)) {
    for (const a of [c.title, ...c.aliases]) {
      const k = headerKey(a)
      const had = seen.get(k)
      if (had && had !== c.key) clashes.push(`«${a}» → ${had} и ${c.key}`)
      seen.set(k, c.key)
    }
  }
  check(clashes.length === 0, 'ни один заголовок не ведёт в два разных поля', clashes.join('; '))

  if (!existsSync(file)) {
    console.log(`  ⚠ Шаблона нет в ${DIR} — сколько колонок узнаётся, проверить нечем.`)
    return
  }

  const read = readSpreadsheet(new Uint8Array(readFileSync(file)))
  if ('error' in read) {
    check(false, 'шаблон «Основные сведения» прочитан', read.error)
    return
  }

  const raw = (read.rows[0] ?? []).map((h) => h.trim()).filter(Boolean)
  const { header } = matchHeader(raw, ds)
  const known = header.filter((h) => h !== '')

  console.log(`  Узнаётся ${known.length} колонок из ${raw.length}: ${known.join(', ')}`)

  /*
   * Порог, а не точное число: пусть растёт. Падение ниже порога значит,
   * что чей-то синоним увели, — и это надо заметить прогоном, а не
   * жалобой хозяйства.
   *
   * Порог сперва был написан одиннадцатью — по первому замеру, сделанному
   * до того, как из набора убрали столкновение «Импортное
   * наименование/кличка» с «Кличкой». После починки узнаваемых стало
   * десять, и проверка упала. Неверным было ожидание: одиннадцатая
   * колонка была не колонкой, а двумя заголовками в одном поле.
   */
  check(known.length >= 10, 'узнаётся не меньше десяти колонок', String(known.length))
  check(new Set(known).size === known.length, 'и ни одна колонка не занята дважды', known.join(', '))

  for (const must of ['identNumber', 'fgias.baseUuid', 'fgias.unsm', 'ageGroup']) {
    check(known.includes(must), `узнаётся «${must}»`)
  }

  /*
   * Опознание шаблона по паре колонок — на всех трёх настоящих файлах
   * сразу. Утверждение дешёвое, а без него человек, положивший файл
   * реестра, читает отчёт как разгром: тридцать три чужих заголовка
   * и ни слова о том, что файл вообще-то понят.
   */
  console.log('')
  const known3: [string, string][] = [
    ['КРС_Основные_сведения_v.2.1_2.6.0.xlsx', 'Основные сведения'],
    ['КРС_Лактация_молочная_продуктивность_v.1.4_2.6.0.xlsx', 'Лактация: молочная продуктивность'],
    ['КРС_Родословная_v1.1_2.6.0.xlsx', 'Родословная'],
  ]
  for (const [f, label] of known3) {
    const path = join(DIR, f)
    if (!existsSync(path)) continue
    const r = readSpreadsheet(new Uint8Array(readFileSync(path)))
    if ('error' in r) continue
    const titles = (r.rows[0] ?? []).map((t) => t.trim()).filter(Boolean)
    check(fgiasTemplateOf(titles) === label, `опознаётся как «${label}»`, String(fgiasTemplateOf(titles)))
  }

  /*
   * И обратное: наш собственный шаблон загрузки шаблоном ФГИАС
   * не объявляется. Опознание по двум колонкам ошибается редко, но
   * «редко» — не «никогда», и проверить это стоит одной строки.
   */
  const ours = columnsOf(ds).map((c) => c.title)
  check(fgiasTemplateOf(ours) === null, 'наш образец шаблоном ФГИАС не объявляется', String(fgiasTemplateOf(ours)))
}

/**
 * Распознавание набора по шапке — и отказ там, где шапка не решает.
 *
 * ## Почему это проверка, а не «и так видно»
 *
 * Выбор «что загружаем» убран из формы: ответ лежит в файле, и человек
 * ошибался в этом поле чаще, чем в самом файле. Но раз система теперь
 * решает сама, она обязана решать верно — и признаваться, когда не может.
 *
 * Худший исход здесь не «не распознал», а «распознал уверенно и неверно»:
 * файл отёлов, залитый как животные, заводит тысячу карточек-призраков.
 * Поэтому утверждения написаны в обе стороны.
 */
function datasetDetection() {
  console.log('\nРаспознавание набора по шапке\n')

  /* Свои образцы обязаны узнаваться все и без сомнений. */
  for (const ds of DATASETS) {
    const g = detectDataset(templateRowsOf(ds).headers)
    check(
      g.kind === 'sure' && g.dataset.key === ds.key,
      `образец «${ds.label}» узнаётся сам собой`,
      g.kind === 'sure' ? g.dataset.label : 'неясно',
    )
  }

  /*
   * Шаблон ФГИАС «Основные сведения» — это животные, и распознаться он
   * должен без подсказки: ради этого всё и делалось.
   */
  const main = join('data/shablony-fgias', 'КРС_Основные_сведения_v.2.1_2.6.0.xlsx')
  if (existsSync(main)) {
    const r = readSpreadsheet(new Uint8Array(readFileSync(main)))
    if (!('error' in r)) {
      const g = detectDataset((r.rows[0] ?? []).map((t) => t.trim()).filter(Boolean))
      check(
        g.kind === 'sure' && g.dataset.key === 'animals',
        'шаблон ФГИАС «Основные сведения» узнаётся как «Животные»',
        g.kind === 'sure' ? g.dataset.label : 'неясно',
      )
    }
  }

  /*
   * И обратная сторона: то, чего мы не понимаем, объявляется непонятым.
   * Пустая шапка и шапка из чужих слов не должны давать уверенного
   * ответа — иначе первый же файл не про скот уедет в «Животные».
   */
  const empty = detectDataset([])
  check(empty.kind === 'unclear', 'пустая шапка — «неясно», а не «Животные» по умолчанию')

  const nonsense = detectDataset(['Наименование', 'Количество', 'Цена', 'Сумма'])
  check(nonsense.kind === 'unclear', 'накладная не объявляется набором книги')

  /*
   * Один только номер животного не решает ничего: он есть во всех
   * четырёх наборах. Файл из одной такой колонки обязан вызвать вопрос,
   * а не выбор.
   */
  const bare = detectDataset(['Инд.№'])
  check(bare.kind === 'unclear', 'один номер животного набора не определяет', JSON.stringify(bare.kind))

  /*
   * Шаблоны реестра, которые книга умеет принимать, обязаны узнаваться
   * все. Список записан целиком, а не «сколько-нибудь»: узнавание тут
   * не украшение, а условие того, что файл вообще загрузится — без него
   * человека спросят «что в файле», а он не знает, чем наши наборы
   * отличаются от шаблонов реестра.
   */
  const templates: [string, string][] = [
    ['КРС_Основные_сведения_v.2.1_2.6.0.xlsx', 'Животные'],
    ['КРС_Участие_в_выставках_и_соревнованиях_v1.1_2.6.0.xlsx', 'Выставки'],
    ['КРС_Осеменение_v1.2_2.6.0.xlsx', 'Осеменения'],
    ['КРС_Контрольное__доение_v1.2_2.6.0.xlsx', 'Контрольные дойки'],
    ['КРС_Отел_Аборт_Запуск_v1.3_2.6.0.xlsx', 'Отёлы'],
  ]

  for (const [file, label] of templates) {
    const path = join('data/shablony-fgias', file)
    if (!existsSync(path)) continue
    const r = readSpreadsheet(new Uint8Array(readFileSync(path)))
    if ('error' in r) continue
    const g = detectDataset((r.rows[0] ?? []).map((t) => t.trim()).filter(Boolean))
    check(
      g.kind === 'sure' && g.dataset.label === label,
      `шаблон реестра «${file.slice(4, 30)}…» узнаётся как «${label}»`,
      g.kind === 'sure' ? g.dataset.label : 'неясно',
    )
  }

  /*
   * И обратное, столь же обязательное: «Лактация» не узнаётся ни одним
   * набором — и не должна. Лактации лежат массивом внутри животного,
   * загрузки по лактациям у книги нет. Узнать шаблон и не суметь его
   * принять хуже, чем честно не узнать: человек получил бы обещание
   * загрузки там, где её не существует.
   */
  const lact = join('data/shablony-fgias', 'КРС_Лактация_молочная_продуктивность_v.1.4_2.6.0.xlsx')
  if (existsSync(lact)) {
    const r = readSpreadsheet(new Uint8Array(readFileSync(lact)))
    if (!('error' in r)) {
      const g = detectDataset((r.rows[0] ?? []).map((t) => t.trim()).filter(Boolean))
      check(
        g.kind === 'unclear',
        'шаблон «Лактация» не узнаётся — загрузки по лактациям у книги нет',
        g.kind === 'sure' ? g.dataset.label : 'неясно',
      )
    }
  }
}

/**
 * Выставки: что уезжает и что придерживается.
 *
 * Правило обязательности здесь мягче, чем в «Лактации», и это осознанно:
 * «Выигрыш» у животного, ничего не выигравшего, пуст по факту,
 * а не по недосмотру.
 */
function shows() {
  console.log('\nВыставки: что уезжает\n')

  const full = {
    date: '2026-06-12T00:00:00.000Z',
    title: 'Агроферма-2026',
    place: 'Москва, ВДНХ',
    awards: 'Диплом I степени',
    prize: '120 000 руб.',
  }

  const base = {
    identNumber: 'RU0000000070028',
    accountingId: '1a421c44-36d2-41c3-881e-38bf83c4f756',
    baseUuid: '60b5cc43-7b0a-416d-920b-6782c2192fcf',
  }

  const ok = buildShows([{ ...base, shows: [full] }])
  check(ok.rows.length === 1, 'полная запись уезжает')
  const row = ok.rows[0]!
  check(row.length === 8, 'в строке восемь значений', String(row.length))
  check(row[1] === '', 'идентификатор строки у новой записи пуст')
  check(row[3] === '2026-06-12', 'дата в виде ГГГГ-ММ-ДД', String(row[3]))
  check(row[4] === 'Агроферма-2026', 'название на месте')

  /* Пустые награды и приз — не повод придерживать строку. */
  const bare = buildShows([{ ...base, shows: [{ date: full.date, title: full.title }] }])
  check(bare.rows.length === 1, 'без наград и приза строка всё равно уезжает')
  check(bare.rows[0]![7] === '', 'выигрыш уходит пустым, а не прочерком')

  /* А дата и название — повод: без них запись ничего не значит. */
  const noDate = buildShows([{ ...base, shows: [{ title: full.title }] }])
  check(noDate.rows.length === 0 && noDate.held[0]?.why === 'Дата мероприятия', 'без даты придержана')

  const noTitle = buildShows([{ ...base, shows: [{ date: full.date }] }])
  check(
    noTitle.rows.length === 0 && noTitle.held[0]?.why === 'Название мероприятия',
    'без названия придержана',
  )

  const noKey = buildShows([{ ...base, baseUuid: null, shows: [full] }])
  check(noKey.rows.length === 0, 'без номера реестра не уезжает ничего')
  check(
    noKey.held.length === 1,
    'придержано одно животное, а не каждая его выставка',
    `записей ${noKey.held.length}`,
  )

  /* Животное без выставок в отчёт не попадает вовсе — их не бывает у большинства. */
  const none = buildShows([{ ...base, shows: [] }])
  check(none.rows.length === 0 && none.held.length === 0, 'животное без выставок не придержано')
}

/* ------------------------------------------------------------------ */

columns()
values()
lactations()
shows()
pedigree()
summary()
ageGroups()
mainSheet()
fgiasImport()
datasetDetection()
templates()
roundtrip()
forecastKeys()

console.log('')
if (failures) {
  console.log(`Не сошлось: ${failures}\n`)
  process.exit(1)
}
console.log('Всё сошлось.\n')
