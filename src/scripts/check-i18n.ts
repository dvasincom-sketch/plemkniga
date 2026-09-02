import { EAEU_MESSAGES, type Messages } from '@/lib/i18n/eaeu-messages'
import { SITE_MESSAGES, type SiteMessages } from '@/lib/i18n/site-messages'
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
import { negotiateLocale, resolveLocale } from '@/lib/i18n/negotiate'

/**
 * Переводы и выбор языка — без базы и без сервера.
 *
 * ## Что здесь может сломаться молча
 *
 * Полнота набора ключей проверяется типами: `Record<Locale, Messages>`
 * не соберётся, если язык забыт целиком. А вот три вещи типы не ловят,
 * и все три выглядят на странице как рабочий текст:
 *
 * **Русская строка в нерусском языке.** Самый частый способ «перевести»
 * — скопировать русский текст и вернуться к нему позже. Не возвращаются.
 * Страница на казахском с русским абзацем посреди выглядит не как
 * недоделка, а как небрежность, и опознаётся мгновенно тем самым
 * человеком, ради которого страницу и писали.
 *
 * **Пустая строка.** Пустое место на странице читается как поломка
 * вёрстки, а не как отсутствие перевода.
 *
 * **Разное число возможностей.** У русского шесть карточек, у киргизского
 * пять — и страница просто покажет пять, ничего не сказав.
 *
 * Плюс отдельно проверяется разбор `Accept-Language`: он решает, что
 * человек увидит первым, а ошибиться в нём легко — веса, диалекты,
 * порядок, пустой заголовок.
 *
 *   npm run check:i18n
 */

const fails: string[] = []

/** Обойти все строки набора, отдавая путь и значение. */
function walk(node: unknown, path: string, out: [string, string][]): void {
  if (typeof node === 'string') {
    out.push([path, node])
    return
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, out))
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out)
  }
}

const stringsOf = (m: Messages | SiteMessages): [string, string][] => {
  const out: [string, string][] = []
  walk(m, '', out)
  return out
}

/**
 * Похоже ли на русский текст.
 *
 * Кириллица сама по себе ничего не значит: казахский, киргизский
 * и белорусский тоже пишутся кириллицей. Различие ищется по буквам,
 * которых в этих алфавитах нет, и по служебным словам.
 *
 * Проверка нарочно грубая и даёт ложные срабатывания на коротких
 * строках вроде «REST». Лучше лишний раз спросить, чем пропустить
 * непереведённый абзац: цена ложной тревоги — взгляд человека,
 * цена пропуска — страница, которую не станут читать.
 */
const looksRussian = (s: string): boolean => {
  /*
   * Тип у запасного значения проставлен руками: без него `?? []` даёт
   * `never[]`, и `includes` начинает требовать `never`. Ошибка ловится
   * только сборкой, а выглядит как придирка к пустому массиву.
   */
  const words: string[] = s.toLowerCase().match(/[а-яё]+/g) ?? []
  if (words.length < 3) return false

  const markers = [
    'что', 'это', 'который', 'которые', 'которым', 'если', 'когда', 'чтобы',
    'система', 'данные', 'книга', 'оценка', 'животных', 'хозяйств', 'ещё',
    'только', 'после', 'каждой', 'всей', 'нужна', 'сейчас',
  ]

  return markers.filter((w) => words.includes(w)).length >= 2
}

/* ------------------------------------------------------------------ *
 *  1. Полнота и осмысленность строк                                  *
 * ------------------------------------------------------------------ */

/*
 * Наборов два: страница для стран союза и витрина продукта. Проверяются
 * одинаково и одним проходом — иначе второй набор заведётся без проверки
 * ровно потому, что первый уже проверен.
 */
const SETS: [name: string, byLocale: Record<Locale, Messages | SiteMessages>][] = [
  ['страница ЕАЭС', EAEU_MESSAGES],
  ['витрина продукта', SITE_MESSAGES],
]

for (const [setName, byLocale] of SETS) {
const reference = stringsOf(byLocale[DEFAULT_LOCALE])
const referencePaths = reference.map(([p]) => p)

console.log(`Строк в наборе «${setName}» (${DEFAULT_LOCALE}): ${reference.length}`)

for (const info of LOCALES) {
  const locale: Locale = info.code
  const items = stringsOf(byLocale[locale])
  const paths = items.map(([p]) => p)

  const missing = referencePaths.filter((p) => !paths.includes(p))
  const extra = paths.filter((p) => !referencePaths.includes(p))

  for (const p of missing) fails.push(`${setName}, ${locale}: нет строки ${p}`)
  for (const p of extra) {
    fails.push(`${setName}, ${locale}: лишняя строка ${p}, которой нет в ${DEFAULT_LOCALE}`)
  }

  for (const [path, value] of items) {
    if (!value.trim()) fails.push(`${setName}, ${locale}: пустая строка ${path}`)

    if (locale !== 'ru' && looksRussian(value)) {
      fails.push(`${setName}, ${locale}: строка ${path} похожа на непереведённый русский текст`)
    }
  }

  const mark = info.reviewed ? 'проверен' : 'НЕ проверен носителем'
  console.log(`  ${locale} (${info.native}): ${items.length} строк, ${mark}`)
}
}

/* ------------------------------------------------------------------ *
 *  2. Разбор Accept-Language                                          *
 * ------------------------------------------------------------------ */

const cases: [header: string | null, expected: Locale, why: string][] = [
  ['kk', 'kk', 'простой тег'],
  ['kk-KZ', 'kk', 'диалект сводится к языку'],
  ['ru-BY,ru;q=0.9', 'ru', 'белорусский русский — это русский'],
  ['en-US,en;q=0.9,ru;q=0.8', 'en', 'первый по весу выигрывает'],
  ['de,fr;q=0.9,hy;q=0.5', 'hy', 'неизвестные пропускаются, известный берётся'],
  ['ru;q=0.3,ky;q=0.8', 'ky', 'порядок задаётся весом, а не написанием'],
  ['de,fr;q=0.9', DEFAULT_LOCALE, 'ни одного знакомого — запасной'],
  ['*', DEFAULT_LOCALE, 'звёздочка не считается согласием'],
  ['', DEFAULT_LOCALE, 'пустой заголовок'],
  [null, DEFAULT_LOCALE, 'заголовка нет вовсе'],
  ['ru;q=0', DEFAULT_LOCALE, 'нулевой вес — это отказ, а не выбор'],
]

for (const [header, expected, why] of cases) {
  const got = negotiateLocale(header)
  if (got !== expected) {
    fails.push(`Accept-Language «${header}» дал ${got}, ожидался ${expected} (${why})`)
  }
}

/*
 * Выбор человека сильнее догадки — это главное свойство, ради которого
 * переключатель вообще существует. Сломайся оно, человек нажимал бы
 * на свой язык и получал бы обратно чужой.
 */
if (resolveLocale({ cookie: 'hy', acceptLanguage: 'ru,en;q=0.9' }) !== 'hy') {
  fails.push('cookie с выбором языка не переспорила заголовок браузера')
}

/* Мусор в cookie — повод спросить браузер, а не показать пустоту. */
if (resolveLocale({ cookie: 'xx', acceptLanguage: 'kk' }) !== 'kk') {
  fails.push('неизвестный язык в cookie не откатился к заголовку браузера')
}

if (resolveLocale({ cookie: null, acceptLanguage: null }) !== DEFAULT_LOCALE) {
  fails.push('без cookie и без заголовка не вернулся запасной язык')
}

console.log(`Проверено случаев разбора Accept-Language: ${cases.length + 3}`)

/* ------------------------------------------------------------------ */

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ переводы полны, и язык определяется как задумано')
process.exit(0)
