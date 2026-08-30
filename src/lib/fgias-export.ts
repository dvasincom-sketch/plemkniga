/**
 * Сборка файлов для ФГИАС ПР — шаблоны «Лактация» и «Родословная».
 *
 * ## Три идентификатора, и почему их нельзя путать
 *
 * В шапке шаблона стоят три колонки, и все три называются похоже:
 *
 *   Базовый номер ФГИАС ПР      — uuid животного в реестре, выдаёт реестр
 *   Идентификатор ФГИАС ПР      — uuid самой записи, нужен для обновления
 *   Идентификатор учётной системы — наш ключ, наш и остаётся
 *
 * Первый нам не принадлежит. Он появляется после того, как хозяйство сдало
 * «Основные сведения» и получило обратный файл, — и до этого его нет
 * ни у кого. Второй пуст у новой записи по самому шаблону: в листе «Пример»
 * эта ячейка не заполнена. Третий — единственный, который мы знаем сами.
 *
 * Соблазн подставить в первую колонку наш `animals.uuid` силён и обходится
 * дорого. Поле у нас так и подписано было — «GUID (ФГИАС ПР)», — хотя
 * выдаёт его `randomUUID()` при создании карточки и к реестру оно
 * отношения не имеет. Реестр такой файл либо отвергнет, либо, что хуже,
 * заведёт второе животное рядом с настоящим: базовый номер для него —
 * первичный ключ, а не подсказка. Разбирать потом придётся вручную
 * и по одному.
 *
 * Поэтому наш uuid уходит ровно туда, где он и есть по смыслу, —
 * в «Идентификатор учётной системы», а базовый номер либо взят из
 * обратного файла, либо строка не уезжает вовсе.
 *
 * ## Почему строка придерживается, а не уезжает с пустой ячейкой
 *
 * Реестр отвергает запись целиком за незаполненное обязательное поле,
 * и отвергает молча — без указания колонки. Файл на двадцать тысяч строк,
 * из которых половина отвалится по одной и той же причине, стоит
 * хозяйству дня разбирательств и ничего не объясняет.
 *
 * Здесь наоборот: строка с недостающим обязательным полем не попадает
 * в файл, а попадает в список придержанных с названием поля. Файл при
 * этом меньше, чем хотелось бы, — зато он уезжает целиком, а список
 * говорит, что именно вносить.
 *
 * ## Что считается обязательным
 *
 * В шаблонах, где поле необязательно, лист «Описание контракта» пишет
 * это прямо: у «Основных сведений» под линией и мастью стоит
 * «НЕОБЯЗАТЕЛЬНО». В «Лактации» такой пометки нет ни под одной колонкой,
 * поэтому обязательными считаются все, кроме «Идентификатора ФГИАС ПР», —
 * его пустым оставляет сам лист «Пример».
 *
 * Чтение строгое намеренно. Ошибиться можно в обе стороны, и цена разная:
 * лишняя придержанная строка стоит одной записи в отчёте, а лишняя
 * отправленная — отказа всего файла.
 *
 * ## Модуль ничего не знает про Payload
 *
 * Здесь только сборка таблицы из простых объектов. Так её можно прогнать
 * проверкой на машине без базы — и она прогоняется: `check:fgias-export`
 * работает на выдуманных животных и проверяет ровно те правила, которые
 * дороже всего стоят на живых.
 */

import { ISAG_LOCI as ISAG_ORDER } from '@/lib/isag'

/* ------------------------------------------------------------------ */
/*  Колонки шаблонов                                                    */
/* ------------------------------------------------------------------ */

export type FgiasType = 'uuid' | 'string' | 'int' | 'float' | 'date'

export type FgiasColumn = {
  /** Заголовок слово в слово из шаблона — по нему реестр и читает файл. */
  title: string
  type: FgiasType
  width?: number
}

/**
 * Тринадцать колонок шаблона «КРС_Лактация_молочная_продуктивность_v.1.4».
 *
 * Порядок и написание взяты из самого файла, а не переписаны на слух.
 * «Дней» здесь — не «Дойных дней»: так в шаблоне, и переименовывать чужую
 * шапку под свою привычку значит менять то единственное, по чему реестр
 * узнаёт колонку.
 */
export const LACTATION_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Номер лактации', type: 'int' },
  { title: 'Дата отела', type: 'date', width: 14 },
  { title: 'Дней', type: 'int' },
  { title: 'Признак', type: 'uuid', width: 38 },
  { title: 'Удой, кг', type: 'int' },
  { title: 'Удой 305, кг', type: 'int' },
  { title: 'Жир, %', type: 'float' },
  { title: 'Жир, кг', type: 'float' },
  { title: 'Белок, %', type: 'float' },
  { title: 'Белок, кг', type: 'float' },
]

/**
 * Четырнадцать гнёзд родословной — в порядке шаблона, а не в нашем.
 *
 * Порядок здесь не алфавитный и не по рядам: сперва вся отцовская сторона
 * (О, ОО, МО, ООО, МОО, ОМО, ММО), затем вся материнская. Переставить их
 * «как логичнее» значит сдвинуть все значения на соседние гнёзда —
 * то есть выдать деда за бабку, и молча.
 *
 * Код читается справа налево: «МО» — мать отца, «ООМ» — отец отца матери.
 * Записать наоборот легко и незаметно: на «ОО» и «ММ» порядок безразличен,
 * ошибка вылезет только на смешанных путях.
 */
export const PEDIGREE_NESTS = [
  'О',
  'ОО',
  'МО',
  'ООО',
  'МОО',
  'ОМО',
  'ММО',
  'М',
  'ОМ',
  'ММ',
  'ООМ',
  'МОМ',
  'ОММ',
  'МММ',
] as const

/** Пятнадцать колонок шаблона «КРС_Родословная_v1.1»: ключ и четырнадцать гнёзд. */
export const PEDIGREE_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  ...PEDIGREE_NESTS.map((code) => ({ title: code, type: 'uuid' as const, width: 38 })),
]

/**
 * Восемь колонок шаблона «КРС_Участие_в_выставках_и_соревнованиях_v1.1».
 *
 * Обратите внимание на вторую: здесь она называется «Идентификатор
 * **строки** ФГИАС ПР», а не «Идентификатор ФГИАС ПР», как в «Лактации».
 * Реестр называет одно и то же по-разному от шаблона к шаблону, и это
 * не мелочь: заголовок — единственное, по чему он узнаёт колонку.
 * Списано с файла, а не приведено к общему виду.
 */
export const SHOW_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор строки ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата мероприятия', type: 'date', width: 14 },
  { title: 'Название мероприятия', type: 'string', width: 32 },
  { title: 'Место проведения', type: 'string', width: 28 },
  { title: 'Сведения о полученных наградах', type: 'string', width: 32 },
  { title: 'Выигрыш', type: 'string', width: 20 },
]

export type Show = {
  date?: string | null
  title?: string | null
  place?: string | null
  awards?: string | null
  prize?: string | null
}

export type ShowAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  shows?: Show[] | null
}

/**
 * Выставки — по строке на мероприятие.
 *
 * ## Что здесь обязательно
 *
 * Дата и название. Мероприятие без даты неотличимо от другого такого же,
 * а без названия — это вообще не запись о выставке. Место, награды
 * и выигрыш уходят пустыми, если их не заполнили: приз бывает не у всех
 * участников, и пустая ячейка здесь говорит правду, а не скрывает пробел.
 *
 * Это отличается от «Лактации», где обязательным считается всё
 * (решение №239), и отличается не по вкусу: там лист контракта
 * не помечает необязательным ни одной колонки, а здесь смысл колонок
 * сам отвечает за себя — «Выигрыш» у животного, ничего не выигравшего,
 * пуст по факту, а не по недосмотру.
 */
export function buildShows(animals: ShowAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  for (const a of animals) {
    const list = (a.shows ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `выставок: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `выставок: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const show of list) {
      const date = fgiasDate(show.date)
      const title = typeof show.title === 'string' && show.title.trim() ? show.title.trim() : ''

      const missing = !date ? 'Дата мероприятия' : !title ? 'Название мероприятия' : null
      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `выставка ${show.title ?? show.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

      rows.push([
        a.baseUuid,
        /* Идентификатор строки у новой записи пуст — как и в «Лактации». */
        '',
        a.accountingId,
        /* `date` проверен цепочкой `missing` выше — компилятор её не следит. */
        date!,
        title,
        txt(show.place),
        txt(show.awards),
        txt(show.prize),
      ])
    }
  }

  return { columns: SHOW_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Семь колонок шаблона «КРС_Живая_масса_v1.5».
 *
 * Вторая здесь снова «Идентификатор ФГИАС ПР», без слова «строки», —
 * как в «Лактации» и в отличие от выставок. Списано с файла.
 */
export const WEIGHING_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата взвешивания', type: 'date', width: 14 },
  { title: 'Живая масса', type: 'float', width: 12 },
  { title: 'Привязка', type: 'uuid', width: 38 },
  { title: 'Номер лактации взвешивания', type: 'int' },
]

export type Weighing = {
  date?: string | null
  weight?: number | null
  /** Ключ реестра из справочника признаков — подставляет вызывающий. */
  signUuid?: string | null
  lactationNumber?: number | null
}

export type WeighingRow = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  weighings?: Weighing[] | null
}

/**
 * Живая масса — по строке на взвешивание.
 *
 * ## Что обязательно
 *
 * Дата, масса и привязка. Первые две очевидны, третья — нет, и она важнее
 * прочих: восемьсот килограммов при продаже и восемьсот при выбытии
 * говорят о разном, и без признака число не значит ничего. Реестр требует
 * его ключом справочника, поэтому взвешивание без признака придерживается,
 * а не уезжает с пустой ячейкой.
 *
 * Номер лактации необязателен: контракт помечает его «только для самок
 * при наличии лактации», а тёлку взвешивают до первого отёла.
 *
 * ## Масса не округляется
 *
 * Контракт объявил её `float` с двумя знаками, и это единственное число
 * во всей выгрузке, которое уезжает как есть. У лактаций удой объявлен
 * целым, и там округление неизбежно и объявлено; здесь округлять нечего.
 */
export function buildWeighings(animals: WeighingRow[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  for (const a of animals) {
    const list = (a.weighings ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `взвешиваний: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `взвешиваний: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const w of list) {
      const date = fgiasDate(w.date)
      const weight = fgiasFloat(w.weight)
      const sign = typeof w.signUuid === 'string' && w.signUuid.trim() ? w.signUuid.trim() : ''

      const missing = !date
        ? 'Дата взвешивания'
        : weight === undefined
          ? 'Живая масса'
          : !sign
            ? 'Привязка'
            : null

      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `взвешивание ${w.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const lact = fgiasInt(w.lactationNumber)

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        date!,
        weight!,
        sign,
        /* Номер лактации необязателен: тёлку взвешивают до первого отёла. */
        lact.value ?? '',
      ])
    }
  }

  return { columns: WEIGHING_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Десять колонок шаблона «КРС_Комплексный_класс_v1.6».
 *
 * Порядок непривычный: «Идентификатор учётной системы» здесь третий,
 * а не первый, как в «Основных сведениях», и не второй, как в «Живой
 * массе». Списано с файла — реестр расставляет ключи по-своему в каждом
 * шаблоне, и приводить их к общему виду нельзя: заголовок и место
 * колонки — единственное, по чему он узнаёт, что куда класть.
 */
export const GRADE_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата оценки', type: 'date', width: 14 },
  { title: 'Комплексный класс, балл', type: 'float', width: 14 },
  { title: 'Комплексный класс', type: 'uuid', width: 38 },
  { title: 'Организация-оценщик наименование', type: 'string', width: 30 },
  { title: 'Организация-оценщик ИНН', type: 'string', width: 14 },
  { title: 'Организация-оценщик КПП', type: 'string', width: 12 },
  { title: 'Организация-оценщик страна регистрации', type: 'uuid', width: 38 },
]

export type Grading = {
  date?: string | null
  /** Ключ класса из справочника реестра — подставляет вызывающий. */
  gradeUuid?: string | null
  score?: number | null
  assessor?: {
    name?: string | null
    inn?: string | null
    kpp?: string | null
    countryUuid?: string | null
  } | null
}

export type GradingAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  gradings?: Grading[] | null
}

/**
 * Комплексный класс — по строке на бонитировку.
 *
 * ## Что обязательно
 *
 * Дата и класс. Класс без даты — не запись о бонитировке, а свойство
 * неизвестного возраста: корову бонитируют ежегодно, и «элита» без года
 * не отвечает на вопрос, элита ли она сейчас.
 *
 * Именно поэтому класс, записанный в карточке до этой правки, сюда
 * не попадает и попасть не может. Даты у него нет и взяться ей неоткуда,
 * а подставить сегодняшнюю значило бы сказать реестру, что мы оценили
 * полторы тысячи животных сегодня.
 *
 * ## Балл может быть пустым
 *
 * Инструкция по бонитировке считает балл по трём группам признаков,
 * но в племенных свидетельствах его печатают не всегда, а класс печатают
 * всегда. Требовать балл значило бы придержать записи, у которых
 * с реестром всё в порядке.
 *
 * ## Оценщик берётся из связи
 *
 * Наименование, ИНН и КПП — из организации, а не копией в каждой
 * строке: копия однажды уехала бы со старым ИНН. Страна регистрации
 * выводится из наличия ИНН, разбор — в `lib/grading.ts`.
 */
export function buildGrades(animals: GradingAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const list = (a.gradings ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `бонитировок: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `бонитировок: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const g of list) {
      const date = fgiasDate(g.date)
      const grade = txt(g.gradeUuid)

      const missing = !date ? 'Дата оценки' : !grade ? 'Комплексный класс' : null
      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `бонитировка ${g.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const score = fgiasFloat(g.score)

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        date!,
        score ?? '',
        grade,
        txt(g.assessor?.name),
        txt(g.assessor?.inn),
        txt(g.assessor?.kpp),
        txt(g.assessor?.countryUuid),
      ])
    }
  }

  return { columns: GRADE_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Одиннадцать колонок шаблона «КРС_Отел_Аборт_Запуск_v1.3».
 *
 * Здесь «Идентификатор учётной системы» стоит **первым**, а базовый
 * номер вторым — единственный шаблон с таким порядком. Списано с файла.
 */
export const CALVING_COLUMNS: FgiasColumn[] = [
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Дата события', type: 'date', width: 14 },
  { title: 'Тип события', type: 'uuid', width: 38 },
  { title: 'Номер лактации события', type: 'int' },
  { title: 'Результат', type: 'uuid', width: 38 },
  { title: 'Легкость отела', type: 'uuid', width: 38 },
  { title: 'Количество живых телочек', type: 'int' },
  { title: 'Количество живых бычков', type: 'int' },
  { title: 'Количество мертворожденных (нежизнеспособных)', type: 'int' },
]

export type CalvingEvent = {
  date?: string | null
  /** Ключи реестра — подставляет вызывающий. */
  eventUuid?: string | null
  birthTypeUuid?: string | null
  easeUuid?: string | null
  number?: number | null
  liveHeifers?: number | null
  liveBulls?: number | null
  stillborn?: number | null
}

export type CalvingAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  calvings?: CalvingEvent[] | null
}

/**
 * Отёл, аборт и запуск — по строке на событие.
 *
 * ## Что обязательно
 *
 * Дата, тип события и номер лактации. Первые два очевидны, третий —
 * ось всей отчётности: события воспроизводства реестр вешает на номер
 * отёла, и строка без него не встаёт в хронологию ни у нас, ни у него.
 *
 * ## Три числа уходят пустыми, а не нулями
 *
 * Ноль мертворождённых и «не считали» — разные утверждения, и колонка
 * объявлена целым числом, а не обязательным. У аборта чисел нет
 * по существу; у отёлов, загруженных до этой правки, они есть только
 * там, где прежнее поле «Результат» их подразумевало: «Тёлка» — одна
 * живая тёлочка, «Мертворождение» — один мертворождённый. Двойня
 * молчит про пол, и выдумывать его миграция не стала.
 *
 * Ноль в этих колонках означал бы «мы посчитали, и не родилось никого» —
 * для отёла это неправда всегда.
 *
 * ## Тип рождения подставляется из чисел
 *
 * Если его не выбрали руками, он считается по сумме плодов: один,
 * двойня, тройня, множественные. Мертворождённые считаются наравне
 * с живыми — двойня, из которой один телёнок мёртв, остаётся двойнёй.
 * Когда чисел нет вовсе, колонка уходит пустой: «Не определено» —
 * это утверждение о родах, а не признание, что мы не знаем.
 */
export function buildCalvings(animals: CalvingAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const list = (a.calvings ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `событий отёла: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `событий отёла: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const c of list) {
      const date = fgiasDate(c.date)
      const event = txt(c.eventUuid)
      const number = fgiasInt(c.number)

      const missing = !date
        ? 'Дата события'
        : !event
          ? 'Тип события'
          : number.value === undefined
            ? 'Номер лактации события'
            : null

      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `событие ${c.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const heifers = fgiasInt(c.liveHeifers)
      const bulls = fgiasInt(c.liveBulls)
      const dead = fgiasInt(c.stillborn)

      rows.push([
        a.accountingId,
        a.baseUuid,
        '',
        date!,
        event,
        number.value!,
        txt(c.birthTypeUuid),
        txt(c.easeUuid),
        heifers.value ?? '',
        bulls.value ?? '',
        dead.value ?? '',
      ])
    }
  }

  return { columns: CALVING_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Двадцать семь колонок шаблона «КРС_Достоверность_происхождения_v1.1».
 *
 * Последние двенадцать — панель ISAG в порядке шаблона: BM1818, BM1824,
 * BM2113, затем ETH3, ETH10, ETH225. Внутри ETH числа идут 3, 10, 225,
 * то есть и не по возрастанию строки. Переписывать «как ровнее» нельзя:
 * перестановка сдвинула бы генотип на соседний локус.
 */
export const DNA_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Лаборатория наименование организации', type: 'string', width: 30 },
  { title: 'Лаборатория ИНН', type: 'string', width: 14 },
  { title: 'Лаборатория КПП', type: 'string', width: 12 },
  { title: 'Дата проведения исследования', type: 'date', width: 14 },
  { title: 'Номер генетического сертификата', type: 'string', width: 20 },
  { title: 'Дата выдачи генетического сертификата', type: 'date', width: 14 },
  { title: 'Проба', type: 'uuid', width: 38 },
  { title: 'Метод исследований', type: 'uuid', width: 38 },
  { title: 'Способ подтверждения происхождения', type: 'uuid', width: 38 },
  { title: 'Результат подтверждения', type: 'uuid', width: 38 },
  { title: 'Количество SNP-маркеров', type: 'int' },
  { title: 'Группа крови', type: 'string', width: 16 },
  { title: 'BM1818', type: 'string', width: 12 },
  { title: 'BM1824', type: 'string', width: 12 },
  { title: 'BM2113', type: 'string', width: 12 },
  { title: 'ETH3', type: 'string', width: 12 },
  { title: 'ETH10', type: 'string', width: 12 },
  { title: 'ETH225', type: 'string', width: 12 },
  { title: 'INRA023', type: 'string', width: 12 },
  { title: 'SPS115', type: 'string', width: 12 },
  { title: 'TGLA53', type: 'string', width: 12 },
  { title: 'TGLA122', type: 'string', width: 12 },
  { title: 'TGLA126', type: 'string', width: 12 },
  { title: 'TGLA227', type: 'string', width: 12 },
]

export type DnaTest = {
  date?: string | null
  labName?: string | null
  labInn?: string | null
  labKpp?: string | null
  certificateNumber?: string | null
  certificateDate?: string | null
  /** Ключ реестра метода исследования — подставляет вызывающий. */
  methodUuid?: string | null
  authMethodUuid?: string | null
  verdictUuid?: string | null
  snpCount?: number | null
  /** Пары аллелей по локусам ISAG, ключ — имя локуса. */
  loci?: Record<string, string | null | undefined> | null
}

export type DnaAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  /** Группа крови — свойство животного, а не теста. */
  bloodGroup?: string | null
  dnaTests?: DnaTest[] | null
}

/**
 * Достоверность происхождения — по строке на тест.
 *
 * ## Что обязательно
 *
 * Дата исследования и результат подтверждения. Всё прочее уходит пустым,
 * если не заполнено, и это не послабление: тест, у которого нет номера
 * сертификата, — обычный тест, а не испорченная запись. Локусы пусты
 * у тех тестов, которые делали по SNP, а не по микросателлитам, —
 * и наоборот.
 *
 * ## «Проба» уходит пустой всегда
 *
 * В шаблоне колонка связана со справочником «Объект исследования»,
 * а тот оказался списком из семидесяти трёх болезней и генов: HH1, CVM,
 * BLAD, миостатин. На вопрос «какую пробу брали» он не отвечает, и что
 * реестр ждёт в этой колонке, из справочника не следует.
 *
 * Пустая колонка честна; заполненная догадкой — нет. Если реестр
 * откажет, он назовёт колонку, и тогда мы узнаем ответ от него,
 * а не выдумаем.
 *
 * ## Группа крови берётся у животного
 *
 * Реестр спрашивает её в этом шаблоне, но это свойство животного,
 * а не теста. Копия в каждом тесте разошлась бы с оригиналом на первой
 * же правке.
 */
export function buildDna(animals: DnaAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const list = (a.dnaTests ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `тестов: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `тестов: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const t of list) {
      const date = fgiasDate(t.date)
      const verdict = txt(t.verdictUuid)

      const missing = !date
        ? 'Дата проведения исследования'
        : !verdict
          ? 'Результат подтверждения'
          : null

      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `тест ${t.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const snp = fgiasInt(t.snpCount)

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        txt(t.labName),
        txt(t.labInn),
        txt(t.labKpp),
        date!,
        txt(t.certificateNumber),
        fgiasDate(t.certificateDate) ?? '',
        /* «Проба» — см. разбор выше: справочник не отвечает на этот вопрос. */
        '',
        txt(t.methodUuid),
        txt(t.authMethodUuid),
        verdict,
        snp.value ?? '',
        txt(a.bloodGroup),
        ...ISAG_ORDER.map((l) => txt(t.loci?.[l])),
      ])
    }
  }

  return { columns: DNA_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Разница в днях между двумя датами вида `ГГГГ-ММ-ДД`.
 *
 * Считается через `Date.UTC` от разобранных чисел, а не через
 * `new Date(строка)`: второе читает строку по часовому поясу машины,
 * и межотельный период на сервере западнее Гринвича вышел бы на день
 * короче, чем у зоотехника. Разбор тот же, что у `fgiasDate`,
 * и по той же причине.
 */
const daysBetween = (from: string, to: string): number | undefined => {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from)
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to)
  if (!a || !b) return undefined
  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) -
    Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  return Math.round(ms / 86_400_000)
}

/**
 * Десять колонок шаблона «КРС_Осеменение_v1.2».
 *
 * Наш ключ первым, как в «Отёле», — из двадцати шаблонов таких два.
 */
export const INSEMINATION_COLUMNS: FgiasColumn[] = [
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Дата осеменения', type: 'date', width: 14 },
  { title: 'Номер осеменения', type: 'int' },
  { title: 'Номер лактации', type: 'int' },
  { title: 'Бык-осеменитель', type: 'uuid', width: 38 },
  { title: 'Метод осеменения', type: 'uuid', width: 38 },
  { title: 'Плодотворность', type: 'string', width: 12 },
  { title: 'Дата подтверждения стельности', type: 'date', width: 14 },
]

export type Insemination = {
  date?: string | null
  /** Базовый номер быка в реестре — подставляет вызывающий. */
  bullBaseUuid?: string | null
  methodUuid?: string | null
  lactationNumber?: number | null
  attemptNumber?: number | null
  /** `true` — стельная, `false` — яловая, `undefined` — ещё не проверяли. */
  fruitful?: boolean | null
  pregnancyCheckDate?: string | null
}

export type InseminationAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  inseminations?: Insemination[] | null
}

/**
 * Осеменения — по строке на попытку.
 *
 * ## Бык нужен номером реестра, и это главное препятствие
 *
 * Колонка «Бык-осеменитель» ждёт базовый номер ФГИАС ПР быка, а не его
 * кличку и не номер со свидетельства. То есть осеменение нельзя сдать,
 * пока бык не зарегистрирован — ровно та же стена, что у родословной.
 *
 * Разница в том, что здесь она преодолима силами хозяйства: быки
 * привозного семени в книге заведены карточками, и базовые номера
 * приходят им тем же обратным файлом, что и коровам. Поэтому строка
 * придерживается с отдельной причиной — «Базовый номер быка», — чтобы
 * в отчёте было видно, чего именно не хватает: своей регистрации
 * или регистрации производителя.
 *
 * ## Номер осеменения считается, если его не вели
 *
 * Реестр ждёт порядковый номер попытки внутри лактации. У нас это поле
 * необязательное и заполнено не везде. Считать его по датам можно точно:
 * попытки внутри одной лактации упорядочены во времени, и третья
 * по счёту — она и есть третья. Своя нумерация хозяйства при этом
 * уважается: если `attemptNumber` заполнен, берётся он.
 *
 * ## Плодотворность может уйти пустой
 *
 * «Стельная» — да, «Яловая» и «Выкидыш» — нет, «Ожидает проверки» —
 * пусто. Последнее не то же самое, что «нет»: осеменение, которое ещё
 * не проверяли, ничем не хуже прочих, и записать ему «неплодотворно»
 * значило бы объявить яловой корову, о которой мы пока ничего не знаем.
 */
export function buildInseminations(animals: InseminationAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const list = (a.inseminations ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `осеменений: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `осеменений: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    /*
     * Счётчик попыток внутри лактации. Порядок берётся из дат, поэтому
     * список сортируется здесь, а не полагается на порядок выборки:
     * из базы записи приходят по `id`, а заводят их задним числом.
     */
    const sorted = [...list].sort((x, y) =>
      String(fgiasDate(x.date) ?? '').localeCompare(String(fgiasDate(y.date) ?? '')),
    )
    const seen = new Map<number, number>()

    for (const i of sorted) {
      const date = fgiasDate(i.date)
      const bull = txt(i.bullBaseUuid)

      const missing = !date ? 'Дата осеменения' : !bull ? 'Базовый номер быка' : null
      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `осеменение ${i.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const lact = fgiasInt(i.lactationNumber)
      const key = lact.value ?? 0
      const nth = (seen.get(key) ?? 0) + 1
      seen.set(key, nth)

      const attempt = fgiasInt(i.attemptNumber)

      rows.push([
        a.accountingId,
        a.baseUuid,
        '',
        date!,
        attempt.value ?? nth,
        lact.value ?? '',
        bull,
        txt(i.methodUuid),
        /*
         * Реестр объявил колонку булевой, а в примере написал `TRUE`.
         * Пишем словом, как в примере: числа 1 и 0 в булевой колонке
         * читаются двояко, а пустая ячейка означает «не проверяли».
         */
        i.fruitful === true ? 'TRUE' : i.fruitful === false ? 'FALSE' : '',
        fgiasDate(i.pregnancyCheckDate) ?? '',
      ])
    }
  }

  return { columns: INSEMINATION_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Пятнадцать колонок шаблона «КРС_Контрольное__доение_v1.2».
 *
 * Вторая снова «Идентификатор **строки** ФГИАС ПР», как у выставок.
 *
 * А «КПП лаборатории» записан в шаблоне с переносом строки внутри
 * ячейки, и перенос сохранён здесь дословно. Соблазн выписать заголовок
 * в одну строку велик — узнаванию перенос не мешает, `headerKey` его
 * схлопывает, — но сверка с настоящим файлом идёт строгим сравнением,
 * и это правильно: заголовок мы не приводим к удобному виду, а списываем.
 * Реестр узнаёт колонку по нему, и решать за реестр, что перенос лишний,
 * значит однажды решить так же про слово.
 */
export const MILK_TEST_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор строки ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Номер контрольного доения', type: 'int' },
  { title: 'Дата проведения контрольного доения', type: 'date', width: 14 },
  { title: 'Номер пробы', type: 'string', width: 16 },
  { title: 'Наименование лаборатории', type: 'string', width: 30 },
  { title: 'ИНН лаборатории', type: 'string', width: 14 },
  { title: 'КПП лаборатории \n(при наличии)', type: 'string', width: 12 },
  { title: 'День лактации', type: 'int' },
  { title: 'Суточный удой, (кг)', type: 'float', width: 14 },
  { title: 'Жир, (%)', type: 'float', width: 10 },
  { title: 'Белок, (%)', type: 'float', width: 10 },
  { title: 'Количество соматических клеток', type: 'int' },
  { title: 'Номер лактации', type: 'int' },
]

export type MilkTest = {
  date?: string | null
  number?: number | null
  dailyYield?: number | null
  fatPercent?: number | null
  proteinPercent?: number | null
  somaticCells?: number | null
  lactationNumber?: number | null
  lab?: { name?: string | null; inn?: string | null; kpp?: string | null } | null
}

/** Отёл в том виде, в каком его читают сборщики производных таблиц. */
export type CalvingPoint = {
  number?: number | null
  date?: string | null
}

export type MilkTestAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  milkTests?: MilkTest[] | null
  /** Отёлы животного — из них считается день лактации. */
  calvings?: CalvingPoint[] | null
}

/**
 * Контрольные дойки — по строке на замер.
 *
 * ## День лактации считается, а не хранится
 *
 * Это разница в днях между дойкой и отёлом той лактации, к которой она
 * относится. Хранить его значило бы завести второй ответ на вопрос,
 * у которого уже есть первый, — и однажды они разойдутся: дату отёла
 * правят, а посчитанный день лактации останется прежним.
 *
 * Отёл ищется по номеру лактации замера. Если номера нет или отёла
 * с таким номером в книге не заведено, колонка уходит пустой — но сама
 * дойка уезжает: удой, жир и белок реестру нужны и без дня лактации.
 *
 * Отрицательный день не пишется вовсе. Он означает дойку раньше отёла,
 * то есть ошибку в данных, и отправлять её в реестр числом «−12» хуже,
 * чем не отправлять: проверка данных о ней и так скажет.
 *
 * ## Номер пробы уходит пустым
 *
 * Книга его не ведёт. Это номер пробирки в лаборатории, и появляется
 * он в лабораторной выгрузке, которую хозяйство загружает к нам, —
 * но колонки под него у нас нет, и заводить её ради одного шаблона
 * рано: сперва надо увидеть, приходит ли он в присылаемых файлах.
 */
export function buildMilkTests(animals: MilkTestAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []
  let rounded = 0

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const list = (a.milkTests ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `доек: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `доек: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    const calvingOf = new Map<number, string>()
    for (const c of a.calvings ?? []) {
      const n = fgiasInt(c.number).value
      const d = fgiasDate(c.date)
      if (n !== undefined && d) calvingOf.set(n, d)
    }

    const sorted = [...list].sort((x, y) =>
      String(fgiasDate(x.date) ?? '').localeCompare(String(fgiasDate(y.date) ?? '')),
    )
    const seen = new Map<number, number>()

    for (const t of sorted) {
      const date = fgiasDate(t.date)
      const yield_ = fgiasFloat(t.dailyYield)

      const missing = !date
        ? 'Дата проведения контрольного доения'
        : yield_ === undefined
          ? 'Суточный удой'
          : null

      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `дойка ${t.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      const lact = fgiasInt(t.lactationNumber)
      const key = lact.value ?? 0
      const nth = (seen.get(key) ?? 0) + 1
      seen.set(key, nth)

      const start = lact.value === undefined ? undefined : calvingOf.get(lact.value)
      const day = start ? daysBetween(start, date!) : undefined

      const cells = fgiasInt(t.somaticCells)
      if (cells.rounded) rounded += 1

      const own = fgiasInt(t.number)

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        own.value ?? nth,
        date!,
        /* Номер пробы книга не ведёт — см. разбор выше. */
        '',
        txt(t.lab?.name),
        txt(t.lab?.inn),
        txt(t.lab?.kpp),
        day !== undefined && day >= 0 ? day : '',
        yield_!,
        fgiasFloat(t.fatPercent) ?? '',
        fgiasFloat(t.proteinPercent) ?? '',
        cells.value ?? '',
        lact.value ?? '',
      ])
    }
  }

  return { columns: MILK_TEST_COLUMNS, rows, held, rounded }
}

/**
 * Шесть колонок шаблона «КРС_Молочность_по_отелу_v1.0».
 *
 * Несмотря на название, молока здесь нет вовсе: таблица связывает отёл
 * с полученными телятами. Реестр называет её так, потому что молочность
 * коровы мясного направления меряют по приплоду, — а книга ведёт
 * молочное, и для неё это просто связь «отёл → телята».
 */
export const CALVING_CALVES_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор строки ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Номер отела', type: 'int' },
  { title: 'Дата определения', type: 'date', width: 14 },
  { title: 'Идентификатор теленка', type: 'string', width: 44 },
]

export type CalvingCalves = {
  number?: number | null
  date?: string | null
  /** Базовые номера телят в реестре — подставляет вызывающий. */
  calfBaseUuids?: (string | null | undefined)[] | null
}

export type CalvingCalvesAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  calvings?: CalvingCalves[] | null
}

/**
 * Молочность по отёлу — связь отёла с приплодом.
 *
 * ## Несколько телят в одной ячейке
 *
 * Реестр ждёт их номера через точку с запятой в одной ячейке — так
 * написано в контракте шаблона. Это единственное место во всей выгрузке,
 * где ячейка содержит список, и разбирать её обратно придётся тем же
 * разделителем.
 *
 * ## Строка без телят не уезжает
 *
 * Отёл без связанного приплода — это вся строка целиком: кроме номера
 * телёнка, в ней нет ничего, чего реестр не знает из «Отёла». Отправить
 * её пустой значило бы сдать отчёт ни о чём.
 *
 * Придержано будет почти всё: на две тысячи отёлов приплод связан
 * у четырёх. Это не поломка выгрузки, а состояние книги, и отчёт
 * называет его прямо.
 */
export function buildCalvingCalves(animals: CalvingCalvesAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  for (const a of animals) {
    const list = (a.calvings ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `отёлов: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `отёлов: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const c of list) {
      const date = fgiasDate(c.date)
      const number = fgiasInt(c.number)
      const calves = (c.calfBaseUuids ?? []).filter(
        (v): v is string => typeof v === 'string' && v.trim() !== '',
      )

      const missing = !date
        ? 'Дата определения'
        : number.value === undefined
          ? 'Номер отела'
          : calves.length === 0
            ? 'Базовый номер телёнка'
            : null

      if (missing) {
        held.push({
          identNumber: a.identNumber,
          what: `отёл ${c.number ?? c.date ?? '?'}`,
          why: missing,
        })
        continue
      }

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        number.value!,
        date!,
        /* Несколько телят — через точку с запятой, так велит контракт. */
        calves.join(';'),
      ])
    }
  }

  return { columns: CALVING_CALVES_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Пять колонок шаблона «КРС_Межотельный_период_v1.1».
 */
export const INTERVAL_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Номер отела', type: 'int' },
  { title: 'Межотельный период, дни', type: 'int' },
]

export type IntervalAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  calvings?: CalvingPoint[] | null
}

/**
 * Межотельный период — считается, а не хранится.
 *
 * ## Почему в книге такого поля нет и не будет
 *
 * Это разница между датами двух соседних отёлов. Хранить её значило бы
 * завести второй ответ на вопрос, у которого уже есть первый: правку
 * даты отёла пришлось бы разносить по всем производным, и однажды
 * не разнесли бы.
 *
 * Реестру она нужна отдельной таблицей — значит, книга обязана уметь
 * её посчитать и отдать, а не хранить.
 *
 * ## Номер — позднейшего из двух отёлов
 *
 * Период «до отёла номер три» естественнее, чем «после отёла номер
 * два»: так его и спрашивают у зоотехника, и так он ложится рядом
 * с номером лактации в остальных таблицах.
 *
 * У первого отёла периода нет по определению — до него отёлов
 * не было. Строка не заводится вовсе и в придержанные не попадает:
 * это не пробел в данных, а свойство первого отёла.
 *
 * ## Отрицательный и нулевой не уезжают
 *
 * Контракт требует целое от нуля. Ноль означал бы два отёла в один
 * день, отрицательное — что второй раньше первого; и то и другое —
 * ошибка ввода, о которой скажет проверка данных, а не выгрузка.
 */
export function buildIntervals(animals: IntervalAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  for (const a of animals) {
    const points = (a.calvings ?? [])
      .map((c) => ({ number: fgiasInt(c.number).value, date: fgiasDate(c.date) }))
      .filter((c): c is { number: number; date: string } => c.number !== undefined && !!c.date)
      .sort((x, y) => x.date.localeCompare(y.date))

    if (points.length < 2) continue

    if (!a.baseUuid || !a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `межотельных периодов: ${points.length - 1}`,
        why: a.baseUuid ? 'Идентификатор учётной системы' : 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    for (let i = 1; i < points.length; i++) {
      const days = daysBetween(points[i - 1]!.date, points[i]!.date)
      if (days === undefined || days <= 0) {
        held.push({
          identNumber: a.identNumber,
          what: `период до отёла № ${points[i]!.number}`,
          why: 'Даты отёлов идут не по порядку',
        })
        continue
      }

      rows.push([a.baseUuid, '', a.accountingId, points[i]!.number, days])
    }
  }

  return { columns: INTERVAL_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Пять колонок шаблона «КРС_Сервис_период_молочное_направление_v1.1».
 */
export const SERVICE_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Номер лактации', type: 'int' },
  { title: 'Сервис-период, дни', type: 'int' },
]

/** Границы, объявленные контрактом шаблона. */
export const SERVICE_MIN = 10
export const SERVICE_MAX = 775

export type ServiceAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  calvings?: CalvingPoint[] | null
  /** Даты осеменений — из них ищется то, от которого пошла стельность. */
  inseminationDates?: (string | null | undefined)[] | null
}

/**
 * Сервис-период — от отёла до плодотворного осеменения.
 *
 * ## Почему из осеменений, а не из межотельного периода
 *
 * Считать его как «межотельный минус двести восемьдесят пять» было бы
 * проще и почти всегда близко к правде. Но это производная
 * от производной: ошиблись бы там, где стельность вышла короче или
 * длиннее обычного, — то есть ровно на тех коровах, ради которых
 * показатель и смотрят.
 *
 * Поэтому берётся настоящая дата: последнее осеменение перед следующим
 * отёлом. Оно и есть плодотворное — то, после которого корова
 * не осеменялась, потому что стала стельной.
 *
 * ## Только там, где следующий отёл уже случился
 *
 * Пока корова не отелилась второй раз, сервис-период первой лактации
 * не определён: осеменения были, но которое из них плодотворное, ещё
 * неизвестно. Контракт говорит о том же с другой стороны — при номере
 * последнего отёла, равном единице, колонка не заполняется.
 *
 * ## Границы контракта соблюдаются, а не подгоняются
 *
 * Реестр требует от десяти до семисот семидесяти пяти дней. Значение
 * вне этих границ придерживается с названной причиной, а не
 * прижимается к краю: сервис-период в восемьсот дней — это либо
 * пропущенный отёл, либо ошибка в датах, и обрезать его до 775 значило
 * бы отправить в реестр придуманное число вместо честного отказа.
 */
export function buildService(animals: ServiceAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  for (const a of animals) {
    const points = (a.calvings ?? [])
      .map((c) => ({ number: fgiasInt(c.number).value, date: fgiasDate(c.date) }))
      .filter((c): c is { number: number; date: string } => c.number !== undefined && !!c.date)
      .sort((x, y) => x.date.localeCompare(y.date))

    if (points.length < 2) continue

    if (!a.baseUuid || !a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `сервис-периодов: ${points.length - 1}`,
        why: a.baseUuid ? 'Идентификатор учётной системы' : 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    const dates = (a.inseminationDates ?? [])
      .map((d) => fgiasDate(d))
      .filter((d): d is string => !!d)
      .sort((x, y) => x.localeCompare(y))

    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]!
      const to = points[i]!

      /* Плодотворное — последнее осеменение строго между двумя отёлами. */
      const between = dates.filter((d) => d > from.date && d < to.date)
      const fruitful = between[between.length - 1]

      if (!fruitful) {
        held.push({
          identNumber: a.identNumber,
          what: `лактация № ${from.number}`,
          why: 'Нет осеменения между отёлами',
        })
        continue
      }

      const days = daysBetween(from.date, fruitful)
      if (days === undefined || days < SERVICE_MIN || days > SERVICE_MAX) {
        held.push({
          identNumber: a.identNumber,
          what: `лактация № ${from.number}`,
          why: `Сервис-период вне границ ${SERVICE_MIN}–${SERVICE_MAX} дней`,
        })
        continue
      }

      /*
       * Номер лактации — той, что закончилась этим сервис-периодом,
       * то есть более раннего отёла. Реестр называет колонку «Номер
       * лактации», а не «Номер отёла», как в межотельном периоде,
       * и это не описка: сервис-период принадлежит лактации, которая
       * шла, а межотельный период — промежутку между двумя.
       */
      rows.push([a.baseUuid, '', a.accountingId, from.number, days])
    }
  }

  return { columns: SERVICE_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Восемнадцать линейных признаков шаблона «КРС_Корова_Линейная_оценка».
 *
 * ## Один список на заголовки и на значения
 *
 * Заголовки колонок и поля, из которых берутся числа, стоят парами
 * в одном месте. Разведи их на два списка — и однажды кто-нибудь
 * вставит колонку в один, забыв про другой: файл уедет с правильной
 * шапкой, а «угол копыта» окажется в колонке «глубина вымени».
 * Ошибка при этом молчаливая: реестр примет числа от одного до девяти
 * куда угодно.
 *
 * ## Порядок взят из шаблона и не алфавитный
 *
 * Он и не тематический: центральная связка стоит второй, а глубина
 * вымени пятнадцатой, хотя обе про вымя. Переписывать «как ровнее»
 * нельзя по той же причине, что у панели ISAG.
 *
 * ## Два признака реестра книга не меряет
 *
 * «Ширина задней части вымени» и «Выраженность скакательного сустава»
 * в нашей шкале не заведены. Колонки уходят пустыми, а не заполняются
 * соседним похожим признаком: ширина задней части вымени — не то же
 * самое, что высота его прикрепления, и подставить одно вместо другого
 * значило бы соврать про экстерьер, а по экстерьеру выбирают быка.
 *
 * ## Два наших признака реестр не спрашивает
 *
 * «Ориентация передних ног» и «Гармоничность движения» в шаблоне
 * отсутствуют. Книга их ведёт и продолжит: это не лишние данные,
 * а данные, которые государству пока не нужны.
 */
export const LINEAR_TRAITS: { title: string; key: string | null }[] = [
  /* Реестр зовёт его «Тип животного», книга — «Тип телосложения». */
  { title: 'Тип животного', key: 'bodyType' },
  { title: 'Центральная связка (глубина доли)', key: 'centralLigament' },
  { title: 'Ширина таза', key: 'rumpWidth' },
  { title: 'Ширина задней части вымени', key: null },
  { title: 'Выраженность скакательного сустава', key: null },
  /* «Высота задней части вымени» — это прикрепление задних долей. */
  { title: 'Высота задней части вымени', key: 'rearUdder' },
  { title: 'Длина сосков (передних)', key: 'teatLength' },
  { title: 'Крепость телосложения или ширина груди', key: 'chestWidth' },
  { title: 'Расположение передних сосков', key: 'frontTeatPlacement' },
  { title: 'Положение таза', key: 'rumpAngle' },
  { title: 'Угол копыта', key: 'hoofAngle' },
  { title: 'Постановка задних ног (вид сбоку)', key: 'rearLegsSide' },
  { title: 'Постановка задних ног (вид сзади)', key: 'rearLegsRear' },
  { title: 'Расположение задних сосков', key: 'rearTeatPlacement' },
  { title: 'Глубина вымени', key: 'udderDepth' },
  { title: 'Глубина туловища', key: 'bodyDepth' },
  { title: 'Прикрепление передних долей вымени', key: 'foreUdder' },
  { title: 'Рост', key: 'height' },
]

/** Двадцать шесть колонок: восемь общих и восемнадцать признаков. */
export const LINEAR_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор строки ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата оценки', type: 'date', width: 14 },
  { title: 'Номер отела', type: 'int' },
  { title: 'Наименование организации-оценщика', type: 'string', width: 30 },
  { title: 'ИНН организации-оценщика', type: 'string', width: 14 },
  { title: 'КПП организации-оценщика', type: 'string', width: 12 },
  ...LINEAR_TRAITS.map((t) => ({ title: t.title, type: 'int' as const })),
]

export type LinearScore = {
  date?: string | null
  lactation?: number | null
  assessor?: { name?: string | null; inn?: string | null; kpp?: string | null } | null
  /** Признаки по ключам нашей шкалы 1–9. */
  traits?: Record<string, number | null | undefined> | null
}

export type LinearAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  scores?: LinearScore[] | null
}

/** Шкала линейной оценки, объявленная контрактом шаблона. */
export const LINEAR_MIN = 1
export const LINEAR_MAX = 9

/**
 * Линейная оценка — по строке на осмотр.
 *
 * ## Шкала совпала, и это редкость
 *
 * Реестр требует целое от одного до девяти по каждому признаку —
 * ровно наша шкала. Совпадение не случайно: девятибалльной линейной
 * оценкой меряют экстерьер во всём мире, и мы перешли на неё
 * миграцией `20260828_140000_linear_score`, отказавшись от прежней
 * шкалы отклонений −2…+2.
 *
 * Три соседних шаблона — оценка типа телосложения, комплексная оценка
 * быка, экстерьер молодняка — устроены на шкале 50–100, и вот там
 * совпадения нет: это не другое поле, а другая система измерения.
 *
 * ## Значение вне шкалы придерживается
 *
 * Не прижимается к краю и не округляется. Число вне единицы-девятки
 * означает, что в поле попало что-то другое — балл по стобалльной
 * шкале, опечатка, чужой формат, — и отправлять его реестру, обрезав
 * до девятки, значило бы выдать чужое измерение за своё.
 *
 * ## Строка без единого признака не уезжает
 *
 * Осмотр, в котором не заполнен ни один из восемнадцати, — это дата
 * и подпись без содержания. Реестру такая строка ничего не сообщает,
 * а в отчёте она честно называется придержанной.
 */
export function buildLinear(animals: LinearAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const list = (a.scores ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `оценок экстерьера: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `оценок экстерьера: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    for (const s of list) {
      const date = fgiasDate(s.date)
      if (!date) {
        held.push({
          identNumber: a.identNumber,
          what: `оценка ${s.date ?? '?'}`,
          why: 'Дата оценки',
        })
        continue
      }

      const values = LINEAR_TRAITS.map((t) => {
        if (!t.key) return ''
        const n = fgiasInt(s.traits?.[t.key]).value
        if (n === undefined) return ''
        return n >= LINEAR_MIN && n <= LINEAR_MAX ? n : ''
      })

      if (values.every((v) => v === '')) {
        held.push({
          identNumber: a.identNumber,
          what: `оценка ${date}`,
          why: 'Ни одного признака в шкале 1–9',
        })
        continue
      }

      const lact = fgiasInt(s.lactation)

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        date,
        lact.value ?? '',
        txt(s.assessor?.name),
        txt(s.assessor?.inn),
        txt(s.assessor?.kpp),
        ...values,
      ])
    }
  }

  return { columns: LINEAR_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Пять колонок шаблона «КРС_Индекс_племенной_ценности_v1.2».
 *
 * Шапка у него лежит на листе «Пример», а лист «Контракт» устроен
 * иначе, чем у прочих: не шапкой, а таблицей описаний, где колонки
 * перечислены строками. Списано с «Примера» — именно он и есть форма
 * загрузки.
 */
export const IPC_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата расчёта', type: 'date', width: 14 },
  { title: 'Результат оценки племенной ценности', type: 'string', width: 20 },
]

export type IpcAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  ipc?: number | null
  evaluationDate?: string | null
}

/**
 * Индекс племенной ценности — по строке на животное.
 *
 * ## Почему индекс уходит строкой, а не числом
 *
 * Колонка объявлена текстовой, и в примере реестра стоит «11».
 * То есть число, записанное строкой: реестр не берётся утверждать,
 * по какой методике его считали, и принимает результат как он есть.
 *
 * Нам это на руку. Индекс книги — собственный расчёт по собственной
 * базе сравнения, и выдавать его за общероссийский было бы неверно;
 * текстовая колонка честно означает «вот наш результат», а не «вот
 * значение известной всем величины».
 *
 * ## Без даты расчёта строка не уезжает
 *
 * Индекс пересчитывается при каждом обновлении базы сравнения,
 * и число без дня, когда его получили, не отличить от прошлогоднего.
 * Та же причина, по которой не уезжает комплексный класс без даты
 * оценки.
 */
export function buildIpc(animals: IpcAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  for (const a of animals) {
    const value = fgiasFloat(a.ipc)
    if (value === undefined) continue

    if (!a.baseUuid || !a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: 'индекс племенной ценности',
        why: a.baseUuid ? 'Идентификатор учётной системы' : 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    const date = fgiasDate(a.evaluationDate)
    if (!date) {
      held.push({
        identNumber: a.identNumber,
        what: 'индекс племенной ценности',
        why: 'Дата расчёта',
      })
      continue
    }

    rows.push([a.baseUuid, '', a.accountingId, date, String(value)])
  }

  return { columns: IPC_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Сводная оценка по стобалльной шкале — три шаблона на одну запись.
 *
 * ## Один осмотр, три формы
 *
 * Реестр разложил сводную оценку по трём шаблонам: корова, бык,
 * молодняк. Наборы у них разные, шкалы у двух совпадают, у третьего
 * своя. В книге это одна запись об осмотре: бонитёр приезжает и ставит
 * всё, что положено этому животному по возрасту и полу.
 *
 * ## Наборы расходятся ровно на одном поле
 *
 * У коровы реестр спрашивает качество вымени, у быка — заднюю часть
 * туловища: вымени у него нет, и оценивают то, что он передаёт дочерям.
 * Остальные четыре — пара к паре, хотя названы по-разному: «выраженность
 * молочного типа» у коровы и «молочные признаки» у быка это одно и то же,
 * а «общий вид и развитие» и «общий вид» отличаются только словом.
 *
 * Списки заголовков и полей идут парами по той же причине, что
 * у линейной оценки: разведи их — и оценка ног уедет в колонку вымени
 * молча, потому что оба числа лежат в шкале 50–100.
 */
export const TYPE_TRAITS: { title: string; key: string }[] = [
  { title: 'Объем туловища', key: 'bodyVolume' },
  { title: 'Выраженность молочного типа', key: 'dairyCharacter' },
  { title: 'Качество ног', key: 'legQuality' },
  { title: 'Качество вымени', key: 'udderQuality' },
  { title: 'Общий вид и развитие', key: 'generalView' },
]

export const BULL_TRAITS: { title: string; key: string }[] = [
  { title: 'Общий вид', key: 'generalView' },
  { title: 'Объём туловища', key: 'bodyVolume' },
  { title: 'Молочные признаки', key: 'dairyCharacter' },
  { title: 'Задняя часть туловища', key: 'rearBody' },
  { title: 'Качество ног', key: 'legQuality' },
]

/**
 * Экстерьер молодняка. Шкалы короткие и разные: у общего вида
 * и конечностей 1–3, у туловища 1–4. Границы стоят при каждом признаке,
 * а не общей парой чисел, — иначе «4» в общем виде уехало бы как
 * допустимое.
 */
export const YOUNG_TRAITS: { title: string; key: string; max: number }[] = [
  { title: 'Общий вид', key: 'youngGeneral', max: 3 },
  {
    title: 'Голова и шея, грудь, холка, спина, поясница, средняя часть туловища, зад',
    key: 'youngBody',
    max: 4,
  },
  { title: 'Конечности и копыта', key: 'youngLegs', max: 3 },
]

/** Шкала сводной оценки, объявленная контрактом шаблонов. */
export const SCORE_MIN = 50
export const SCORE_MAX = 100

/** Общая голова трёх шаблонов сводной оценки. */
const scoreHead = (withLactation: boolean): FgiasColumn[] => [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор строки ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата оценки', type: 'date', width: 14 },
  ...(withLactation ? [{ title: 'Номер отела', type: 'int' as const }] : []),
  { title: 'Наименование организации-оценщика', type: 'string', width: 30 },
  { title: 'Страна регистрации организации-оценщика', type: 'uuid', width: 38 },
  { title: 'ИНН организации-оценщика', type: 'string', width: 14 },
  { title: 'КПП организации-оценщика', type: 'string', width: 12 },
]

export const TYPE_COLUMNS: FgiasColumn[] = [
  ...scoreHead(true),
  ...TYPE_TRAITS.map((t) => ({ title: t.title, type: 'int' as const })),
]

export const BULL_COLUMNS: FgiasColumn[] = [
  ...scoreHead(false),
  ...BULL_TRAITS.map((t) => ({ title: t.title, type: 'int' as const })),
]

export const YOUNG_COLUMNS: FgiasColumn[] = [
  ...scoreHead(false),
  ...YOUNG_TRAITS.map((t) => ({ title: t.title, type: 'int' as const })),
]

export type ScoreAssessor = {
  name?: string | null
  inn?: string | null
  kpp?: string | null
  countryUuid?: string | null
}

export type ScoreSheet = {
  date?: string | null
  lactation?: number | null
  assessor?: ScoreAssessor | null
  traits?: Record<string, number | null | undefined> | null
}

export type ScoreAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  /** Пол: у быка свой набор признаков и нет номера отёла. */
  sex?: string | null
  scores?: ScoreSheet[] | null
}

/**
 * Сводная оценка — общий сборщик трёх шаблонов.
 *
 * ## Что обязательно
 *
 * Дата и хотя бы один признак в своей шкале. Осмотр, в котором
 * не заполнено ничего, — дата и подпись без содержания.
 *
 * ## Значение вне шкалы придерживается
 *
 * Не прижимается к краю. Сорок девять баллов там, где шкала начинается
 * с пятидесяти, означают, что в поле попало что-то другое: балл
 * по линейной шкале, опечатка, чужой формат. Обрезать его до пятидесяти
 * значило бы выдать чужое измерение за своё — то же правило, что
 * в линейной оценке.
 *
 * ## Пол решает, какой шаблон собирается
 *
 * Бык в коровий файл не попадает и наоборот. Это не строгость ради
 * строгости: у быка нет номера отёла и нет вымени, и его оценка,
 * уехавшая коровьим шаблоном, была бы принята — с пустым выменем
 * и чужим набором колонок.
 */
function buildScores(
  animals: ScoreAnimal[],
  opts: {
    columns: FgiasColumn[]
    traits: { title: string; key: string; max?: number }[]
    withLactation: boolean
    min: number
    /** Кого берём: `male` — быки, `female` — коровы и тёлки. */
    sex: 'male' | 'female'
    what: string
  },
): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    const mine = opts.sex === 'male' ? a.sex === 'male' : a.sex !== 'male'
    if (!mine) continue

    const list = (a.scores ?? []).filter(Boolean)
    if (list.length === 0) continue

    if (!a.baseUuid || !a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `${opts.what}: ${list.length}`,
        why: a.baseUuid ? 'Идентификатор учётной системы' : 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    for (const s of list) {
      const date = fgiasDate(s.date)
      if (!date) {
        held.push({ identNumber: a.identNumber, what: opts.what, why: 'Дата оценки' })
        continue
      }

      const values = opts.traits.map((t) => {
        const n = fgiasInt(s.traits?.[t.key]).value
        if (n === undefined) return ''
        return n >= opts.min && n <= (t.max ?? SCORE_MAX) ? n : ''
      })

      if (values.every((v) => v === '')) {
        held.push({
          identNumber: a.identNumber,
          what: `${opts.what} ${date}`,
          why: 'Ни одной оценки в своей шкале',
        })
        continue
      }

      const lact = fgiasInt(s.lactation)

      rows.push([
        a.baseUuid,
        '',
        a.accountingId,
        date,
        ...(opts.withLactation ? [lact.value ?? ''] : []),
        txt(s.assessor?.name),
        txt(s.assessor?.countryUuid),
        txt(s.assessor?.inn),
        txt(s.assessor?.kpp),
        ...values,
      ])
    }
  }

  return { columns: opts.columns, rows, held, rounded: 0 }
}

/** Корова: оценка типа телосложения — четырнадцать колонок. */
export const buildTypeScores = (animals: ScoreAnimal[]): Built =>
  buildScores(animals, {
    columns: TYPE_COLUMNS,
    traits: TYPE_TRAITS,
    withLactation: true,
    min: SCORE_MIN,
    sex: 'female',
    what: 'оценок типа телосложения',
  })

/** Бык: комплексная оценка экстерьера — тринадцать колонок. */
export const buildBullScores = (animals: ScoreAnimal[]): Built =>
  buildScores(animals, {
    columns: BULL_COLUMNS,
    traits: BULL_TRAITS,
    withLactation: false,
    min: SCORE_MIN,
    sex: 'male',
    what: 'комплексных оценок',
  })

/** Экстерьер молодняка (самки) — одиннадцать колонок, шкалы 1–3 и 1–4. */
export const buildYoungScores = (animals: ScoreAnimal[]): Built =>
  buildScores(animals, {
    columns: YOUNG_COLUMNS,
    traits: YOUNG_TRAITS,
    withLactation: false,
    min: 1,
    sex: 'female',
    what: 'оценок молодняка',
  })

/**
 * Десять колонок шаблона «КРС_Наличие_спермопродукции_v1.2».
 *
 * «КПП собственника» здесь снова с переносом строки внутри ячейки,
 * как у лаборатории в контрольном доении, и снова сохранён дословно.
 */
export const SEMEN_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор строки ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Дата обновления', type: 'date', width: 14 },
  { title: 'Семенной код', type: 'string', width: 18 },
  { title: 'Статус наличия', type: 'string', width: 12 },
  { title: 'Наименование собственника', type: 'string', width: 34 },
  { title: 'ИНН собственника', type: 'string', width: 14 },
  { title: 'КПП собственника \n(при наличии)', type: 'string', width: 12 },
  { title: 'ОГРНИП собственника (обязательно для ИП)', type: 'string', width: 18 },
]

export type SemenAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  sex?: string | null
  code?: string | null
  available?: boolean | null
  updatedAt?: string | null
  owner?: { name?: string | null; inn?: string | null; kpp?: string | null; ogrn?: string | null } | null
}

/**
 * Наличие спермопродукции — по строке на быка.
 *
 * ## Что обязательно
 *
 * Семенной код и дата обновления. Код — то, чем семя названо в каталоге
 * и на соломинке; без него строка не отвечает на вопрос, чего именно
 * есть в наличии. Дата отвечает на второй вопрос: на какой день верно
 * «есть». Утверждение о складе без даты протухает молча — «семя есть»
 * годичной давности хуже пустоты, потому что выглядит как ответ.
 *
 * ## «Нет в наличии» — это тоже ответ
 *
 * Строка с `FALSE` уезжает наравне с `TRUE`. Реестр спрашивает статус,
 * а не наличие: «семени больше нет» — сведение, которого он ждёт,
 * и молчание вместо него означало бы, что семя всё ещё есть.
 *
 * ## ОГРНИП только у предпринимателя
 *
 * Контракт требует его при двенадцатизначном ИНН и не хочет при
 * десятизначном. Проверяется длиной ИНН, а не отдельным признаком:
 * длина и есть то, чем предприниматель отличается от организации
 * в этом номере.
 */
export function buildSemen(animals: SemenAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    /* Спермопродукция бывает только у быка — у коровы её не спрашивают. */
    if (a.sex !== 'male') continue

    const code = txt(a.code)
    const date = fgiasDate(a.updatedAt)

    /* Быка, о складе которого ничего не заведено, не придерживаем. */
    if (!code && !date && a.available === null) continue
    if (!code && !date && a.available === undefined) continue

    if (!a.baseUuid || !a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: 'наличие спермопродукции',
        why: a.baseUuid ? 'Идентификатор учётной системы' : 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    const missing = !code ? 'Семенной код' : !date ? 'Дата обновления' : null
    if (missing) {
      held.push({ identNumber: a.identNumber, what: 'наличие спермопродукции', why: missing })
      continue
    }

    const inn = txt(a.owner?.inn)

    rows.push([
      a.baseUuid,
      '',
      a.accountingId,
      date!,
      code,
      a.available ? 'TRUE' : 'FALSE',
      txt(a.owner?.name),
      inn,
      /* КПП не бывает у предпринимателя — контракт запрещает его при ИНН из двенадцати цифр. */
      inn.length === 12 ? '' : txt(a.owner?.kpp),
      inn.length === 12 ? txt(a.owner?.ogrn) : '',
    ])
  }

  return { columns: SEMEN_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Восемь колонок шаблона «подтверждение_владения_2.0».
 *
 * Единственный шаблон из двадцати, где «Идентификатора учётной системы»
 * нет вовсе — как и в родословной. Животное названо только номером
 * реестра, и сдать эти сведения можно лишь после регистрации.
 */
export const OWNERSHIP_COLUMNS: FgiasColumn[] = [
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Событие, Тип поступления', type: 'uuid', width: 38 },
  { title: 'Событие, Дата поступления', type: 'date', width: 14 },
  { title: 'Страна регистрации собственника', type: 'uuid', width: 38 },
  { title: 'Наименование собственника', type: 'string', width: 34 },
  { title: 'ИНН собственника', type: 'string', width: 14 },
  { title: 'КПП собственника', type: 'string', width: 12 },
  { title: 'ОГРН/ОГРНИП собственника', type: 'string', width: 18 },
]

export type OwnershipAnimal = {
  identNumber: string
  baseUuid?: string | null
  /** Тип поступления ключом реестра — подставляет вызывающий. */
  arrivalUuid?: string | null
  arrivalDate?: string | null
  owner?: {
    name?: string | null
    inn?: string | null
    kpp?: string | null
    ogrn?: string | null
    countryUuid?: string | null
  } | null
}

/**
 * Подтверждение владения — по строке на животное.
 *
 * ## Что это вообще за отчёт
 *
 * Не история движений, как можно решить по названию, а одно
 * утверждение: кто владеет животным сегодня и как оно к нему попало.
 * Реестру нужно связать животное с собственником; путь, которым оно
 * прошло через три хозяйства, его здесь не интересует.
 *
 * ## Как узнаётся тип поступления
 *
 * Двумя способами, и оба — записи, а не догадки. Если есть перемещение
 * к нынешнему владельцу, тип берётся из него: продажа — «Покупка»,
 * поступление извне — «Импорт». Если перемещений нет, но хозяйство
 * рождения совпадает с владельцем, это «Рождение», и дата поступления —
 * дата рождения.
 *
 * ## Почему «нет записей» не читается как «родилось здесь»
 *
 * Соблазн: раз животное наше и никуда не приезжало, значит родилось
 * у нас. Соблазн неверен. Хозяйство, перенёсшее историю из прежней
 * системы учёта, не имеет перемещений вовсе — и все его покупные коровы
 * уехали бы в реестр как рождённые здесь. Это ложь государству
 * о происхождении, и делается она молча.
 *
 * Поэтому такая строка придерживается с причиной «Неизвестно, как
 * животное поступило». Причина действенная: заполнить место рождения
 * или записать перемещение — обе работы понятны и по силам хозяйству.
 */
export function buildOwnership(animals: OwnershipAnimal[]): Built {
  const rows: (string | number)[][] = []
  const held: Held[] = []

  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  for (const a of animals) {
    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: 'подтверждение владения',
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    const arrival = txt(a.arrivalUuid)
    const date = fgiasDate(a.arrivalDate)

    if (!arrival || !date) {
      held.push({
        identNumber: a.identNumber,
        what: 'подтверждение владения',
        why: 'Неизвестно, как животное поступило',
      })
      continue
    }

    if (!txt(a.owner?.name)) {
      held.push({
        identNumber: a.identNumber,
        what: 'подтверждение владения',
        why: 'Наименование собственника',
      })
      continue
    }

    rows.push([
      a.baseUuid,
      arrival,
      date,
      txt(a.owner?.countryUuid),
      txt(a.owner?.name),
      txt(a.owner?.inn),
      txt(a.owner?.kpp),
      txt(a.owner?.ogrn),
    ])
  }

  return { columns: OWNERSHIP_COLUMNS, rows, held, rounded: 0 }
}

/**
 * Справочник «Признаки молочной продуктивности» (`sp_signums`).
 *
 * Две записи, обе прочитаны из открытого реестра 30 августа 2026 года.
 * Ключи выписаны сюда, а не берутся запросом при каждой выгрузке:
 * справочник из двух строк за год не менялся ни разу, а выгрузка,
 * падающая оттого, что чужой сервер не ответил, хуже выгрузки
 * с устаревшим ключом. Сверка `sync:fgias-nsi` эти два ключа проверяет
 * заодно со всеми прочими и скажет, если они разойдутся.
 */
export const MILK_SIGNUM = {
  highest: '12900398-636d-4666-992f-fb7a2cb63bb8',
  middle: '13b0b38b-8b07-410a-8b0e-21ac70831443',
} as const

/* ------------------------------------------------------------------ */
/*  Приведение значений                                                 */
/* ------------------------------------------------------------------ */

/**
 * Дата в том виде, в каком её ждёт шаблон: `ГГГГ-ММ-ДД`.
 *
 * Через `Date` не идём вовсе. У нас дата хранится полуночью UTC,
 * а `new Date(...).getFullYear()` отвечает по часовому поясу машины,
 * на которой запущена выгрузка: у зоотехника восточнее Гринвича
 * «15 марта» превратилось бы в «15 марта», а на сервере западнее —
 * в «14 марта». Обрезание строки не зависит ни от чего.
 *
 * Значение, не начинающееся с даты, возвращается пустым, а не
 * подправляется: строку с непонятной датой лучше придержать.
 */
export const fgiasDate = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/** Число как есть — с проверкой, что это вообще число. */
export const fgiasFloat = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/**
 * Целое там, где контракт требует `int`.
 *
 * Удой у нас хранится дробным, а реестр объявил колонку целой. Округление
 * тут неизбежно, и потерять оно может ровно полкило из восьми тысяч —
 * но происходить молча оно не должно: счётчик округлений печатается
 * в отчёте выгрузки. Правило простое и общее — любое преобразование
 * данных по дороге к получателю называется вслух.
 */
export const fgiasInt = (v: unknown): { value?: number; rounded: boolean } => {
  const n = fgiasFloat(v)
  if (n === undefined) return { rounded: false }
  const r = Math.round(n)
  return { value: r, rounded: r !== n }
}

/* ------------------------------------------------------------------ */
/*  Общий вид результата                                                */
/* ------------------------------------------------------------------ */

/** Строка, которая не поехала, и почему. */
export type Held = {
  identNumber: string
  /** Что именно придержано: «лактация 3», «родословная». */
  what: string
  /** Название недостающего поля — слово в слово из шаблона. */
  why: string
}

export type Built = {
  columns: FgiasColumn[]
  rows: (string | number)[][]
  held: Held[]
  /** Сколько значений округлено до целого по требованию контракта. */
  rounded: number
}

/* ------------------------------------------------------------------ */
/*  Лактации                                                            */
/* ------------------------------------------------------------------ */

export type Lactation = {
  number?: number | null
  calvingDate?: string | null
  dd?: number | null
  milkYield?: number | null
  milk305?: number | null
  fat305?: number | null
  fatKg?: number | null
  protein305?: number | null
  proteinKg?: number | null
}

export type ExportAnimal = {
  identNumber: string
  /** Наш неизменный ключ — он же «Идентификатор учётной системы». */
  accountingId?: string | null
  /** Базовый номер ФГИАС ПР. Берётся из обратного файла и больше ниоткуда. */
  baseUuid?: string | null
  lactations?: Lactation[] | null
}

/**
 * Единственная догадка во всей выгрузке — и она названа вслух.
 *
 * ## В чём вопрос
 *
 * Колонка «Признак» связана со справочником «Признаки молочной
 * продуктивности», а в нём ровно два значения: «наивысшая» и «средняя».
 * При этом строка шаблона — конкретная лактация: у неё свой номер, своя
 * дата отёла, свои дойные дни. Конкретная лактация «средней» быть
 * не может, и два прочтения расходятся:
 *
 *   1. Признак делит лактации животного: лучшая помечена «наивысшая»,
 *      остальные «средняя».
 *   2. Реестр ждёт по две строки на животное: одну наивысшую и одну
 *      усреднённую по всем лактациям.
 *
 * Первое прочтение сохраняет данные как есть, второе их сворачивает
 * и теряет. Мы берём первое, потому что необратимое преобразование
 * по догадке дороже обратимого.
 *
 * ## Почему догадка вообще допущена
 *
 * Оставить колонку пустой значит не отдать ни одной строки: поле
 * обязательное. То есть выбор не между догадкой и точностью, а между
 * догадкой названной и выгрузкой, которой нет.
 *
 * Поэтому: догадка проставляется, считается и печатается отдельной
 * строкой в отчёте каждого прогона, а ключом `--priznak=нет` выключается
 * целиком — для хозяйства, которому в поддержке реестра ответили иначе.
 *
 * ## Как выбирается лучшая
 *
 * По удою за 305 дней, а при его отсутствии — по общему удою: сравнивать
 * незаконченную лактацию с законченной по общему удою нечестно, но
 * выбирать не из чего, когда 305 не посчитан. Равенство разрешается
 * меньшим номером лактации — не потому, что так правильнее, а чтобы файл
 * не менялся между прогонами при одних и тех же данных.
 */
export const chooseSignums = (lactations: Lactation[]): string[] => {
  let bestAt = -1
  let bestValue = -Infinity
  let bestNumber = Infinity

  lactations.forEach((l, i) => {
    const value = fgiasFloat(l.milk305) ?? fgiasFloat(l.milkYield)
    if (value === undefined) return
    const number = fgiasFloat(l.number) ?? Infinity
    if (value > bestValue || (value === bestValue && number < bestNumber)) {
      bestAt = i
      bestValue = value
      bestNumber = number
    }
  })

  return lactations.map((_, i) => (i === bestAt ? MILK_SIGNUM.highest : MILK_SIGNUM.middle))
}

export type LactationOptions = {
  /** Проставлять ли «Признак» догадкой. Без него строки не уедут вовсе. */
  signum?: boolean
}

export function buildLactations(
  animals: ExportAnimal[],
  options: LactationOptions = {},
): Built {
  const signum = options.signum !== false

  const rows: (string | number)[][] = []
  const held: Held[] = []
  let rounded = 0

  for (const a of animals) {
    const list = (a.lactations ?? []).filter(Boolean)
    if (list.length === 0) continue

    /*
     * Базовый номер проверяется один раз на животное, а не на лактацию:
     * иначе корова с четырьмя лактациями даёт четыре одинаковые строки
     * в отчёте, и список придержанных перестаёт читаться ровно там,
     * где он всего нужнее — при первой выгрузке, когда базового номера
     * нет ни у кого.
     */
    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: `лактаций: ${list.length}`,
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    if (!a.accountingId) {
      held.push({
        identNumber: a.identNumber,
        what: `лактаций: ${list.length}`,
        why: 'Идентификатор учётной системы',
      })
      continue
    }

    const signums = chooseSignums(list)

    list.forEach((l, i) => {
      const what = `лактация ${l.number ?? '?'}`

      const number = fgiasInt(l.number)
      const date = fgiasDate(l.calvingDate)
      const days = fgiasInt(l.dd)
      const milk = fgiasInt(l.milkYield)
      const milk305 = fgiasInt(l.milk305)
      const fat = fgiasFloat(l.fat305)
      const fatKg = fgiasFloat(l.fatKg)
      const protein = fgiasFloat(l.protein305)
      const proteinKg = fgiasFloat(l.proteinKg)

      /*
       * Порядок проверок повторяет порядок колонок в шаблоне. Он не влияет
       * ни на что, кроме отчёта, — а отчёт от этого читается как сама
       * таблица: недостающее поле ищется там же, где стоит в файле.
       */
      const missing =
        number.value === undefined
          ? 'Номер лактации'
          : date === undefined
            ? 'Дата отела'
            : days.value === undefined
              ? 'Дней'
              : milk.value === undefined
                ? 'Удой, кг'
                : milk305.value === undefined
                  ? 'Удой 305, кг'
                  : fat === undefined
                    ? 'Жир, %'
                    : fatKg === undefined
                      ? 'Жир, кг'
                      : protein === undefined
                        ? 'Белок, %'
                        : proteinKg === undefined
                          ? 'Белок, кг'
                          : !signum
                            ? 'Признак'
                            : null

      if (missing) {
        held.push({ identNumber: a.identNumber, what, why: missing })
        return
      }

      rounded += [number, days, milk, milk305].filter((n) => n.rounded).length

      /*
       * Восклицательные знаки ниже держатся на цепочке `missing`: до сюда
       * доходят только строки, в которых проверено каждое из этих полей.
       * Компилятор такую цепочку не прослеживает, а разворачивать её
       * в двенадцать отдельных `if` значило бы получить двенадцать мест,
       * где порядок проверок и порядок колонок могут разойтись.
       */
      rows.push([
        a.baseUuid!,
        /*
         * «Идентификатор ФГИАС ПР» уходит пустым, и это не пробел.
         * Колонка нужна для обновления уже существующей записи; у новой
         * её нет и быть не может, что и показывает лист «Пример»
         * самого шаблона.
         */
        '',
        a.accountingId!,
        number.value!,
        date!,
        days.value!,
        signums[i]!,
        milk.value!,
        milk305.value!,
        fat!,
        fatKg!,
        protein!,
        proteinKg!,
      ])
    })
  }

  /*
   * Отдельного счётчика догадок нет намеренно: «Признак» проставлен
   * в каждой уехавшей строке, потому что без него строка не уезжает вовсе.
   * Число догадок и есть число строк, и заводить под него второе поле
   * значило бы завести поле, которое всегда равно соседнему.
   */
  return { columns: LACTATION_COLUMNS, rows, held, rounded }
}

/* ------------------------------------------------------------------ */
/*  Родословная                                                         */
/* ------------------------------------------------------------------ */

export type PedigreeSource = {
  id: number
  identNumber: string
  baseUuid?: string | null
  fatherId?: number | null
  motherId?: number | null
  /** Вид номера: `rf`, `rus`, `usa`, `can`, `deu`, `icar`, `internal`. */
  idFormat?: string | null
}

/**
 * Чей это номер — наш, чужой страны или внутрихозяйственный.
 *
 * Деление нужно ровно для одного вопроса: что человеку делать
 * с предком, у которого нет номера реестра. Ответы разные настолько,
 * что общий счётчик их прячет.
 */
export type IdOrigin = 'ours' | 'foreign' | 'internal'

export const idOrigin = (format?: string | null): IdOrigin => {
  if (format === 'rf' || format === 'rus') return 'ours'
  if (format === 'usa' || format === 'can' || format === 'deu' || format === 'icar') return 'foreign'
  /*
   * Пустой формат считается внутрихозяйственным, а не нашим. Это выбор
   * в сторону осторожности: записать животное без известного вида номера
   * в «сдадим сами» значит пообещать работу, которая может не получиться.
   */
  return 'internal'
}

export type PedigreeGaps = {
  /** Связей «потомок → родитель», где родитель заведён в книге. */
  links: number
  /** Из них родитель без номера реестра — по виду его номера. */
  noKey: Record<IdOrigin, number>
  /**
   * Различных предков без номера — не связей.
   *
   * Разница решает, сколько работа стоит. Один американский бык стоит
   * в родословной у сорока дочерей и даёт сорок связей; узнать его номер
   * надо один раз. Отчёт, считающий только связи, завышает объём работы
   * во столько раз, во сколько бык плодовит, — а именно по этому числу
   * человек решает, браться руками или ждать ответа реестра.
   */
  noKeyAnimals: Record<IdOrigin, number>
  /**
   * Их номера — чтобы отчёт мог назвать поимённо, когда их немного.
   *
   * Живой прогон показал, зачем: двенадцать иностранных быков на сто
   * шестьдесят восемь связей. Двенадцать номеров человек выпишет
   * и отнесёт в поддержку реестра за вечер, а «12» без номеров — это
   * ещё один запрос ко мне.
   *
   * Список ограничен сверху: по российским предкам их две с половиной
   * сотни, и печатать их значит утопить те двенадцать, ради которых
   * всё и затевалось.
   */
  noKeyList: Record<IdOrigin, string[]>
  /** Ссылок на родителя, которого в книге нет вовсе. */
  dangling: number
}

/** Сколько номеров запоминать на каждый вид. Дальше — только счёт. */
export const NO_KEY_LIST_CAP = 40

/**
 * Отчего родословная не собирается — с разбором по видам номера.
 *
 * ## Зачем это отдельно от сборки строк
 *
 * Первая редакция отчёта печатала одно число: «связей с родителями 1597,
 * из них предок не зарегистрирован в реестре 1597». На живой книге оно
 * оказалось пустым дважды.
 *
 * **Оно сто процентов по построению.** Пока обратного файла не было
 * ни разу, номера реестра нет ни у кого, значит и у каждого предка его
 * нет. Число, которое сегодня не может быть иным, не сообщает ничего,
 * а выглядит как беда.
 *
 * **И оно скрывало главное.** В примерах шли `HOUSA13599440`,
 * `HOUSA16736241` — американские быки. Совет под числом гласил: «чинится
 * сдачей „Основных сведений“ на предков». Для своей коровы это верно.
 * Для американского быка, который хозяйству не принадлежит и в стаде
 * не стоит, это совет сделать невозможное — то есть отправить зоотехника
 * тратить дни на работу, которой нет.
 *
 * Поэтому счёт идёт по видам номера: своих мы сдадим сами, с чужими
 * вопрос открыт, внутрихозяйственные вовсе не имеют внешнего имени.
 */
export function pedigreeGaps(animals: PedigreeSource[]): PedigreeGaps {
  const byId = new Map<number, PedigreeSource>()
  for (const a of animals) byId.set(a.id, a)

  const gaps: PedigreeGaps = {
    links: 0,
    noKey: { ours: 0, foreign: 0, internal: 0 },
    noKeyAnimals: { ours: 0, foreign: 0, internal: 0 },
    noKeyList: { ours: [], foreign: [], internal: [] },
    dangling: 0,
  }

  /** Предки без номера — по одному разу каждый, как бы часто ни встречались. */
  const seen = new Set<number>()

  for (const a of animals) {
    for (const pid of [a.fatherId, a.motherId]) {
      if (typeof pid !== 'number') continue
      const parent = byId.get(pid)
      if (!parent) {
        /*
         * Ссылка на животное, которого в выборке нет. При выгрузке одного
         * хозяйства это обычное дело: отец стоит в другом. Считается
         * отдельно, потому что «предка нет у нас» и «предка нет в реестре»
         * чинятся разным.
         */
        gaps.dangling += 1
        continue
      }
      gaps.links += 1
      if (parent.baseUuid) continue

      const origin = idOrigin(parent.idFormat)
      gaps.noKey[origin] += 1
      if (!seen.has(parent.id)) {
        seen.add(parent.id)
        gaps.noKeyAnimals[origin] += 1
        if (gaps.noKeyList[origin].length < NO_KEY_LIST_CAP) {
          gaps.noKeyList[origin].push(parent.identNumber)
        }
      }
    }
  }

  return gaps
}

/**
 * Что уехало бы, будь у всех номера реестра.
 *
 * ## Зачем прогноз
 *
 * Проверка базового номера стоит первой и обрывает разбор строки. Пока
 * номера нет ни у кого, отчёт говорит «придержано 731 из 731» и молчит
 * обо всём остальном: заполнены ли у этих лактаций жир и белок, есть ли
 * у животных предки. То есть хозяйству остаётся только ждать — хотя
 * именно сейчас, в ожидании обратного файла, у него есть время
 * дозаполнить книгу.
 *
 * Прогноз отвечает на вопрос «а если номера придут завтра»: тем же
 * разбором, но с подставленным ключом. Все прочие проверки при этом
 * настоящие, и придержанное в прогнозе — придержано по-настоящему.
 *
 * ## Почему подставленный ключ не может утечь в файл
 *
 * Он не uuid и даже не похож: `ПРОГНОЗ-НЕ-ДЛЯ-ФАЙЛА`. Реестр такой
 * отвергнет на первой же строке, а человек, увидевший его в выгрузке,
 * поймёт причину без нас. Тихий правдоподобный заполнитель здесь был бы
 * ровно тем, против чего написана вся эта выгрузка.
 *
 * Результат прогноза печатается и выбрасывается; файл собирается
 * из настоящего разбора и никогда — из этого.
 */
export const FORECAST_KEY = 'ПРОГНОЗ-НЕ-ДЛЯ-ФАЙЛА'

export const withForecastKeys = <T extends { baseUuid?: string | null }>(rows: T[]): T[] =>
  rows.map((r) => ({ ...r, baseUuid: r.baseUuid ?? FORECAST_KEY }))

/**
 * Родословная — пятнадцать колонок, и все до одной uuid реестра.
 *
 * ## Чем этот шаблон отличается от прочих
 *
 * В «Лактации» и «Осеменении» есть «Идентификатор учётной системы» —
 * лазейка, через которую хозяйство говорит о животном на своём языке.
 * Здесь такой колонки нет вовсе: и само животное, и каждый из
 * четырнадцати предков названы только базовым номером ФГИАС.
 *
 * Отсюда следствие, которое стоит сказать хозяйству до того, как оно
 * начнёт заполнять родословные вручную: пока предок не заведён в реестре,
 * его гнездо не заполнить ничем. Ни номером со свидетельства, ни кличкой,
 * ни нашим внутренним ключом. Порядок работ получается жёсткий —
 * сначала «Основные сведения» на всё стадо вместе с предками, потом
 * обратный файл, и только потом родословная.
 *
 * ## Почему строка без единого предка не уезжает
 *
 * Пятнадцать колонок, из которых заполнена одна, — это утверждение
 * «предков нет», а не «предки неизвестны». Реестр между этими двумя
 * различать нечем, и такая строка затирает родословную, если она там
 * уже была. Придержать её дешевле.
 */
export function buildPedigree(animals: PedigreeSource[]): Built {
  const byId = new Map<number, PedigreeSource>()
  for (const a of animals) byId.set(a.id, a)

  const rows: (string | number)[][] = []
  const held: Held[] = []

  /**
   * Шаг от животного: код читается справа налево.
   *
   * Круг в связях («сам себе предок») обход не вешает по построению:
   * число шагов задано длиной кода, а не тем, кончились ли предки.
   * Множества посещённых здесь нет и не нужно — глубина не превышает трёх.
   */
  const walk = (start: PedigreeSource, code: string): PedigreeSource | undefined => {
    let node: PedigreeSource | undefined = start
    for (let i = code.length - 1; i >= 0; i--) {
      if (!node) return undefined
      const next: number | null | undefined = code[i] === 'О' ? node.fatherId : node.motherId
      node = typeof next === 'number' ? byId.get(next) : undefined
    }
    return node
  }

  for (const a of animals) {
    if (!a.baseUuid) {
      held.push({
        identNumber: a.identNumber,
        what: 'родословная',
        why: 'Базовый номер ФГИАС ПР',
      })
      continue
    }

    const cells = PEDIGREE_NESTS.map((code) => {
      const ancestor = walk(a, code)
      /*
       * Предок, заведённый у нас, но не зарегистрированный в реестре,
       * даёт пустое гнездо — так же, как предок, которого мы не знаем.
       * Внешне это одно и то же, и в файле различить их нечем; разница
       * видна в отчёте, где обе причины считаются порознь.
       */
      return ancestor?.baseUuid ?? ''
    })

    if (cells.every((c) => c === '')) {
      held.push({
        identNumber: a.identNumber,
        what: 'родословная',
        why: 'ни одного предка с базовым номером ФГИАС',
      })
      continue
    }

    rows.push([a.baseUuid, ...cells])
  }

  return { columns: PEDIGREE_COLUMNS, rows, held, rounded: 0 }
}

/* ------------------------------------------------------------------ */
/*  Чтение чужой шапки                                                  */
/* ------------------------------------------------------------------ */

/**
 * Заголовок к сравнимому виду.
 *
 * ## Правило, нарушение которого стоило рабочей команды
 *
 * Приведение применяется к обеим сторонам сравнения. Всегда. Первая
 * редакция этого разбора приводила только то, что пришло из файла,
 * а искомые названия были выписаны строками руками — и одно из них,
 * «Идентификатор учётной системы», содержало «ё». Файл давал «учетной»,
 * константа держала «учётной», и не совпадало ничего: разбор объявлял
 * не подходящим настоящий шаблон ФГИАС, у которого нужная пара колонок
 * стоит в первой же строке.
 *
 * Ошибка того рода, что не ловится ни типами, ни чтением кода:
 * обе строки выглядят одинаково, а различает их одна точка над буквой.
 * Поэтому искомые названия ниже пропущены через `headerKey` тем же
 * вызовом, а не переписаны в приведённом виде: переписанное однажды
 * разойдётся с правилом при следующей правке правила.
 *
 * ## Что именно приводится
 *
 * Регистр, «ё», неразрывный пробел и перенос строки внутри ячейки.
 * Последнее не мелочь: в «Основных сведениях» половина заголовков
 * записана в две строки прямо внутри ячейки — «Импортный ⏎
 * идентификационный номер», — и без схлопывания пробелов не сходится
 * ни один из них.
 */
export const headerKey = (s: string): string =>
  s
    /* Неразрывный пробел записан кодом: глазами он неотличим от обычного. */
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')

/**
 * Колонка по началу заголовка, а не по полному совпадению.
 *
 * Реестр пишет в шапке пояснения: не «УНСМ», а «УНСМ (Уникальный Номер
 * Средств Маркирования)»; не «УНЖ», а «УНЖ (Уникальный номер животного)».
 * Требовать точного совпадения значит не найти ни одной такой колонки,
 * а выписывать пояснения в константы — привязаться к их формулировке,
 * которая живёт до следующей версии шаблона.
 *
 * Начало заголовка устойчивее: название колонки реестр не меняет, меняет
 * пояснение в скобках.
 */
export const columnAt = (titles: string[], wanted: string): number =>
  titles.findIndex((t) => t.startsWith(headerKey(wanted)))

/**
 * Заголовки обратного файла, по которым он и узнаётся.
 *
 * Записаны так, как их пишет реестр, — с «ё» и заглавными. К сравнимому
 * виду их приводит `columnAt` тем же вызовом, что и заголовки из файла.
 */
export const RETURN_COLUMNS = {
  key: 'Идентификатор учётной системы',
  base: 'Базовый номер ФГИАС ПР',
  registration: 'Регистрационный номер ФГИАС ПР',
  unsm: 'УНСМ',
} as const

/**
 * Найти строку шапки среди первых нескольких.
 *
 * Шапка не всегда первая: обратный файл может прийти с листа, где сверху
 * стоит название выгрузки или дата. Разбор чужих форматов показал, что
 * именно это — самая частая причина внятного отказа при загрузке,
 * и повторять ту же ошибку здесь незачем.
 *
 * Глубина в десять строк выбрана не наугад: преамбулы в присланных
 * хозяйствами файлах доходили до шести строк, десять берутся с запасом,
 * а дальше искать нечего — файл с одиннадцатистрочной преамбулой лучше
 * отвергнуть внятно.
 *
 * Живёт здесь, а не в скрипте разбора, ровно затем, чтобы проверка могла
 * позвать её на настоящем шаблоне. Пока она лежала в скрипте, позвать её
 * было нельзя: у скрипта на верхнем уровне стоит `main()`, и импорт ради
 * одной функции поднял бы подключение к базе.
 */
export const findHeader = (rows: string[][]): number => {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const titles = (rows[i] ?? []).map(headerKey)
    if (
      columnAt(titles, RETURN_COLUMNS.key) !== -1 &&
      columnAt(titles, RETURN_COLUMNS.base) !== -1
    ) {
      return i
    }
  }
  return -1
}

/**
 * Похож ли файл на шаблон ФГИАС — и на какой.
 *
 * ## Зачем узнавать чужой шаблон
 *
 * Файл ФГИАС загружается к нам уже сегодня: в шапке «Основных сведений»
 * книга узнаёт тринадцать колонок из сорока шести. Но человек об этом
 * не знает и не должен догадываться — он видит обычный отчёт загрузки
 * и тридцать три «нераспознанных заголовка», из которых половина ему
 * ничего не говорит.
 *
 * Узнать шаблон стоит трёх сравнений, а меняет разговор целиком: вместо
 * «мы не поняли треть вашего файла» получается «это шаблон ФГИАС ПР,
 * из сорока шести колонок книга ведёт тринадцать, остальные она
 * не хранит».
 *
 * ## Почему по паре колонок, а не по всей шапке
 *
 * Шаблоны меняются с версиями реестра: колонку добавят, пояснение
 * в скобках перепишут. Узнавание по полному совпадению шапки перестало
 * бы работать в день выхода версии 2.7 — и перестало бы молча, вернув
 * человека к тем же тридцати трём заголовкам.
 *
 * Пара опознавательных колонок переживает такие правки. Ошибиться она
 * почти не может: «Базовый номер ФГИАС ПР» вместе с «Номером лактации»
 * не встретятся больше нигде.
 */
export const FGIAS_SIGNATURES: { label: string; needs: string[] }[] = [
  {
    label: 'Основные сведения',
    needs: ['Идентификатор учётной системы', 'УНЖ'],
  },
  {
    label: 'Лактация: молочная продуктивность',
    needs: ['Базовый номер ФГИАС ПР', 'Номер лактации'],
  },
  {
    /*
     * Родословная узнаётся по базовому номеру и гнезду «ООМ». Гнёзда
     * «О» и «М» для этого не годятся: одна буква слишком часто
     * встречается заголовком в хозяйственных таблицах.
     */
    label: 'Родословная',
    needs: ['Базовый номер ФГИАС ПР', 'ООМ'],
  },
  {
    /*
     * Балл, а не класс: заголовок «Комплексный класс» встречается
     * и в наших выгрузках, и в хозяйственных таблицах, а «Комплексный
     * класс, балл» — только в шаблоне реестра.
     */
    label: 'Комплексный класс',
    needs: ['Базовый номер ФГИАС ПР', 'Комплексный класс, балл'],
  },
  {
    label: 'Отёл / Аборт / Запуск',
    needs: ['Тип события', 'Количество мертворожденных'],
  },
]

export const fgiasTemplateOf = (rawTitles: string[]): string | null => {
  const titles = rawTitles.map(headerKey)
  const hit = FGIAS_SIGNATURES.find((sig) =>
    sig.needs.every((n) => titles.some((t) => t === headerKey(n) || t.startsWith(headerKey(n)))),
  )
  return hit?.label ?? null
}

/* ------------------------------------------------------------------ */
/*  Отчёт                                                               */
/* ------------------------------------------------------------------ */

/**
 * Свод придержанных строк по причине.
 *
 * Список придержанных на двадцать тысяч строк никто не прочтёт, а вопрос
 * у читателя ровно один: что внести, чтобы уехало больше. Ответ на него —
 * причина и её вес, а не перечисление номеров.
 */
export const holdSummary = (held: Held[]): { why: string; count: number }[] => {
  const by = new Map<string, number>()
  for (const h of held) by.set(h.why, (by.get(h.why) ?? 0) + 1)
  return [...by.entries()]
    .map(([why, count]) => ({ why, count }))
    .sort((a, b) => b.count - a.count)
}
