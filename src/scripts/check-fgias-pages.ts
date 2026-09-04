import { FGIAS_PAGES, templateOf, templatesWithoutPage } from '@/lib/fgias-pages'
import { TERMS } from '@/lib/terms'
import { NOTES } from '@/lib/notes'
import { BOOK_FEATURES } from '@/lib/book-features'
import {
  BULL_COLUMNS,
  CALVING_CALVES_COLUMNS,
  CALVING_COLUMNS,
  DNA_COLUMNS,
  GRADE_COLUMNS,
  INSEMINATION_COLUMNS,
  INTERVAL_COLUMNS,
  IPC_COLUMNS,
  LACTATION_COLUMNS,
  LINEAR_COLUMNS,
  MILK_TEST_COLUMNS,
  OWNERSHIP_COLUMNS,
  PEDIGREE_COLUMNS,
  SEMEN_COLUMNS,
  SERVICE_COLUMNS,
  SHOW_COLUMNS,
  TYPE_COLUMNS,
  WEIGHING_COLUMNS,
  YOUNG_COLUMNS,
  type FgiasColumn,
} from '@/lib/fgias-export'
import { MAIN_COLUMNS } from '@/lib/fgias-main'

/**
 * Страницы шаблонов ФГИАС ПР не расходятся с контрактом.
 *
 * ## Что здесь ловится и почему именно это
 *
 * Двадцать страниц отвечают человеку, который открыл файл реестра
 * и не понимает, что писать. Ценность у них ровно одна — точность:
 * имя колонки, приведённое приблизительно, бесполезно, потому что
 * по нему ищут строку в своём файле и не находят.
 *
 * **Имя колонки, которого в шаблоне нет.** Главная проверка. Написать
 * «Дата отёла» вместо «Дата отела» легко: в контракте реестра «ё»
 * не везде, и рука сама ставит правильную букву. Читатель после этого
 * ищет несуществующую колонку и решает, что у него не тот файл.
 *
 * **Страница, потерявшая связь с реестром шаблонов.** Имя шаблона
 * связывает страницу с числом колонок и заполнения. Разойдись оно —
 * паспорт наверху либо покажет числа из ниоткуда, либо не покажет
 * вовсе, а страница будет выглядеть целой.
 *
 * **Пустая часть.** Тип требует все шесть, но пустой массив типу
 * не противоречит: раздел «Где спотыкаются» без единой записи —
 * это заголовок, обещающий ответ, которого нет.
 *
 * ## Почему соответствие имени шаблона колонкам описано здесь
 *
 * В `fgias-export.ts` колонки объявлены двадцатью отдельными массивами,
 * и связи «имя шаблона → массив» там нет: сборщику она не нужна, он
 * знает свой набор в лицо. Заводить её там ради проверки значило бы
 * менять рабочий код под нужды прогона. Поэтому карта лежит здесь,
 * и ошибка в ней видна сразу: половина имён перестанет находиться.
 *
 *   npm run check:fgias-pages
 */

const COLUMNS: Record<string, FgiasColumn[]> = {
  'Основные сведения': MAIN_COLUMNS,
  'Лактация: молочная продуктивность': LACTATION_COLUMNS,
  'Контрольное доение': MILK_TEST_COLUMNS,
  'Отёл / Аборт / Запуск': CALVING_COLUMNS,
  'Осеменение': INSEMINATION_COLUMNS,
  'Родословная': PEDIGREE_COLUMNS,
  'Достоверность происхождения': DNA_COLUMNS,
  'Подтверждение владения': OWNERSHIP_COLUMNS,
  'Живая масса': WEIGHING_COLUMNS,
  'Молочность по отёлу': CALVING_CALVES_COLUMNS,
  'Корова: линейная оценка': LINEAR_COLUMNS,
  'Корова: оценка типа телосложения': TYPE_COLUMNS,
  'Бык: комплексная оценка экстерьера': BULL_COLUMNS,
  'Экстерьер молодняка (самки)': YOUNG_COLUMNS,
  'Комплексный класс': GRADE_COLUMNS,
  'Индекс племенной ценности': IPC_COLUMNS,
  'Межотельный период': INTERVAL_COLUMNS,
  'Сервис-период': SERVICE_COLUMNS,
  'Наличие спермопродукции': SEMEN_COLUMNS,
  'Участие в выставках и соревнованиях': SHOW_COLUMNS,
}

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

const termSlugs = new Set(TERMS.map((t) => t.slug))
const noteSlugs = new Set(NOTES.map((n) => n.slug))
const featureSlugs = new Set(BOOK_FEATURES.map((f) => f.slug))
const pageSlugs = new Set(FGIAS_PAGES.map((p) => p.slug))

const seen = new Set<string>()

for (const page of FGIAS_PAGES) {
  if (seen.has(page.slug)) fail(`${page.slug} — слаг повторяется`)
  seen.add(page.slug)

  if (!/^[a-z0-9-]+$/.test(page.slug)) fail(`${page.slug} — в слаге не только строчная латиница`)

  const template = templateOf(page)
  if (!template) {
    fail(`${page.slug} — шаблона «${page.template}» нет в реестре: паспорт покажет пустоту`)
    continue
  }

  /* Шесть частей: пустая означает заголовок, обещающий ответ, которого нет. */
  if (page.what.length === 0) fail(`${page.slug} — нет части «что это за шаблон»`)
  if (page.required.length === 0) fail(`${page.slug} — не названа ни одна обязательная колонка`)
  if (page.ours.length === 0) fail(`${page.slug} — не сказано, что кладёт книга`)
  if (page.errors.length === 0) fail(`${page.slug} — нет части «где спотыкаются»`)
  if (page.gaps.length === 0) fail(`${page.slug} — не сказано, чего книга не кладёт`)
  if (page.limits.length === 0) fail(`${page.slug} — не сказано, чего шаблон не закрывает`)

  const columns = COLUMNS[page.template]
  if (!columns) {
    fail(`${page.slug} — в карте прогона нет колонок шаблона «${page.template}»`)
  } else {
    const titles = new Set(columns.map((c) => c.title))

    for (const r of page.required) {
      /*
         Требование, не выражаемое колонкой, сверять не с чем: «хотя бы
         один признак в шкале» — это условие приёма, а не строка шапки.
      */
      if (r.kind === 'condition') continue
      if (!titles.has(r.name)) {
        fail(`${page.slug} — колонки «${r.name}» в шаблоне нет: читатель не найдёт её у себя`)
      }
    }

    if (page.required.length > columns.length) {
      fail(`${page.slug} — обязательных колонок больше, чем колонок в шаблоне`)
    }
  }

  for (const slug of page.terms ?? []) {
    if (!termSlugs.has(slug)) fail(`${page.slug} → нет термина «${slug}»`)
  }

  for (const s of page.see ?? []) {
    const href = s.href
    let ok = true

    if (href.startsWith('/ru/fgias/')) ok = pageSlugs.has(href.slice('/ru/fgias/'.length))
    else if (href.startsWith('/ru/razbory/')) ok = noteSlugs.has(href.slice('/ru/razbory/'.length))
    else if (href.startsWith('/ru/book/')) ok = featureSlugs.has(href.slice('/ru/book/'.length))
    else if (href.startsWith('/ru/slovar/')) {
      ok = termSlugs.has(href.slice('/ru/slovar/'.length).split('#')[0]!)
    }

    if (!ok) fail(`${page.slug} → ссылка в пустоту: ${href}`)
  }
}

console.log(`Страниц шаблонов: ${FGIAS_PAGES.length}`)

/*
 * Шаблон без страницы — не ошибка: реестр волен добавить двадцать первый,
 * и останавливать этим выкладку значило бы держать в отчёте красную
 * строку, которую закроют не сегодня. Но сказать об этом надо: в таблице
 * такой шаблон останется без ссылки, и молча.
 */
const orphans = templatesWithoutPage()
if (orphans.length > 0) {
  console.log(`\nШаблоны без своей страницы (${orphans.length}):`)
  for (const t of orphans) console.log(`  · ${t.name}`)
}

console.log(
  failures === 0
    ? '\n  ✓ страницы шаблонов сходятся с контрактом реестра'
    : `\n  ✗ мест, где страница расходится с контрактом: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
