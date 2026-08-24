import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ACCOUNT_TABS, accountTabHref } from '../components/AccountNav'
import { HERD_SUBTABS } from '../components/HerdNav'
import { DATA_SUBTABS } from '../components/DataNav'
import { FARM_SUBTABS } from '../components/FarmNav'
import { PERSONAL_SUBTABS } from '../components/PersonalNav'
import { herdSummary } from '../lib/herd-summary'

/**
 * Проверка навигации кабинета на живом сервере и живой базе.
 *
 * ## Что именно проверяется и почему именно это
 *
 * Разбор навигации (`docs/navigaciya-razbor.md`) нашёл семь поломок, и шесть
 * из них — одного рода: страница есть, работает, отдаёт двести, и при этом
 * в неё нельзя попасть либо непонятно, где ты. Такое не ловит ни сборка,
 * ни обход страниц по списку адресов: `smoke` открывал бы `/bulls/compare`
 * и радовался, а из меню на него не было ни одной ссылки.
 *
 * Поэтому проверяются не страницы, а утверждения о навигации:
 *
 *  1. Каждый адрес из каждого меню отвечает. Меню, ведущее в никуда, хуже
 *     отсутствующего пункта: пункт обещает.
 *  2. На каждой странице кабинета ровно один пункт подсвечен — в каждом ряду.
 *     Ноль означает «вы вне разделов», два — «вы в двух местах сразу»;
 *     оба ответа неверны, и оба выглядели правдоподобно.
 *  3. Прежние адреса приводят туда, куда переехало содержимое. Они ушли
 *     в закладки и письма, и оттуда их не забрать.
 *  4. Число животных в «Обзоре» совпадает с числом в списке стада. Это
 *     та самая пара 74 и 86: два места считали одно понятие по-разному,
 *     и оба выглядели авторитетно.
 *  5. В шапке есть дверь в кабинет и есть ссылка на сравнение быков,
 *     а «Аукционов» — заглушки на треть меню — нет.
 *
 * ## Почему по живому серверу, а не по разметке компонентов
 *
 * Подсветка — свойство собранной страницы, а не компонента: ряд может быть
 * верным, а страница его не нарисовать, передать не тот раздел или нарисовать
 * дважды. Ровно так и было с уведомлениями — компонент исправен, страница
 * не передавала раздел вовсе.
 *
 *   npm run check:nav                       # против http://localhost:3000
 *   BASE=https://… npm run check:nav
 */

const BASE = process.env.BASE ?? 'http://localhost:3000'
const EMAIL = process.env.NAV_EMAIL ?? 'farmer@nazarovskoe.ru'
const PASSWORD = process.env.NAV_PASSWORD ?? 'plemkniga123'

const TAG = 'CHK-NAV'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

let cookie = ''

const get = async (path: string, follow = false) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: follow ? 'follow' : 'manual',
  })
  const body = await res.text()
  return { status: res.status, location: res.headers.get('location'), body }
}

/**
 * Ряды навигации на странице.
 *
 * Каждый ряд — это `<nav aria-label="…">`, и подпись у него своя: подписи
 * заведены для читающих программ, но здесь оказываются кстати — по ним
 * ряд и опознаётся. Разбор регулярным выражением, а не разбором разметки:
 * нужно посчитать вхождения в куске текста, и тащить для этого разборщик
 * DOM в скрипт значило бы завести зависимость ради одного `match`.
 */
const navRows = (html: string): { label: string; current: number }[] => {
  const out: { label: string; current: number }[] = []
  const re = /<nav\s+aria-label="([^"]+)"[\s\S]*?<\/nav>/g
  for (const m of html.matchAll(re)) {
    out.push({
      label: m[1],
      current: (m[0].match(/aria-current="page"/g) ?? []).length,
    })
  }
  return out
}

/** Ряды кабинета, у которых подсветка обязана быть ровно одна. */
const CABINET_ROWS = [
  'Разделы личного кабинета',
  'Разделы стада',
  'Разделы данных',
  'Разделы хозяйства',
  'Личные страницы',
]

async function login() {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const raw = res.headers.getSetCookie?.() ?? []
  cookie = raw.map((c) => c.split(';')[0]).join('; ')
  return res.ok && cookie.length > 0
}

async function main() {
  console.log(`${TAG}: навигация кабинета, ${BASE}\n`)

  const ok = await login()
  check(ok, `вход под ${EMAIL}`)
  if (!ok) {
    console.log('\nБез входа проверять кабинет нечем.')
    process.exit(1)
  }

  /* ------------------- 1. каждый адрес из меню отвечает ------------------- */
  console.log('\nАдреса из меню отвечают')
  const menuHrefs = [
    ...ACCOUNT_TABS.map((t) => accountTabHref(t)),
    ...HERD_SUBTABS.map((s) => (s.key === 'list' ? '/account?tab=herd' : `/account?tab=herd&sub=${s.key}`)),
    ...DATA_SUBTABS.map((s) => `/account?tab=data&sub=${s.key}`),
    ...FARM_SUBTABS.map((s) => s.href),
    ...PERSONAL_SUBTABS.map((s) => s.href),
    '/bulls/compare',
    '/account/afc',
  ]
  const pages = new Map<string, string>()
  for (const href of menuHrefs) {
    const r = await get(href)
    check(r.status === 200, href, `ответ ${r.status}`)
    if (r.status === 200) pages.set(href, r.body)
  }

  /* --------------------- 2. подсветка — ровно одна ---------------------- */
  console.log('\nВ каждом ряду подсвечен ровно один пункт')
  for (const [href, html] of pages) {
    const rows = navRows(html).filter((r) => CABINET_ROWS.includes(r.label))
    /*
     * Страница вне кабинета рядов кабинета не рисует, и это не ошибка:
     * `/bulls/compare` — общая страница книги.
     */
    if (rows.length === 0) continue
    const bad = rows.filter((r) => r.current !== 1)
    check(
      bad.length === 0,
      href,
      bad.map((b) => `«${b.label}»: подсвечено ${b.current}`).join(', '),
    )
  }

  /* ---------------------- 3. прежние адреса ведут туда ---------------------- */
  console.log('\nПрежние адреса приводят к переехавшему содержимому')
  const legacy: { from: string; to: string }[] = [
    { from: '/account?tab=access', to: '/account/access' },
    { from: '/account?tab=team', to: '/account/team' },
    { from: '/account?tab=journal', to: '/account/journal' },
    { from: '/account?tab=profile', to: '/account/profile?tab=user' },
    { from: '/analytics', to: '/account?tab=overview' },
  ]
  for (const l of legacy) {
    const r = await get(l.from)
    const moved = r.status >= 300 && r.status < 400 && (r.location ?? '').includes(l.to.split('?')[0])
    check(moved, `${l.from} → ${l.to}`, `ответ ${r.status}${r.location ? `, ${r.location}` : ''}`)
  }

  /*
   * Переименованные вкладки редиректом не отвечают: они показывают новый
   * раздел под прежним адресом. Проверяется не код ответа, а то, что открылся
   * именно тот раздел, — по подсвеченному пункту в разметке.
   */
  const renamedChecks: { from: string; expect: string }[] = [
    { from: '/account?tab=animals', expect: 'Стадо' },
    { from: '/account?tab=settings', expect: 'Хозяйство' },
    { from: '/account?tab=documents', expect: 'Документы' },
    { from: '/account?tab=events', expect: 'Данные' },
  ]
  for (const c of renamedChecks) {
    const r = await get(c.from)
    /*
     * Ищется подпись рядом с `aria-current="page"`. Проверять просто наличие
     * слова на странице нельзя: «Стадо» и «Данные» есть в меню на каждой
     * странице кабинета, и такая проверка проходила бы всегда.
     */
    const opened = new RegExp(`aria-current="page"[\\s\\S]{0,400}?${c.expect}`).test(r.body)
    check(r.status === 200 && opened, `${c.from} открывает «${c.expect}»`, `ответ ${r.status}`)
  }

  /* ------------- 4. числа стада в «Обзоре» и в списке совпадают ------------- */
  console.log('\nЧисло животных названо одинаково всюду')
  const payload = await getPayload({ config })
  const me = await payload.find({
    collection: 'users',
    where: { email: { equals: EMAIL } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const orgId =
    typeof me.docs[0]?.organization === 'number'
      ? me.docs[0].organization
      : ((me.docs[0]?.organization as { id?: number } | null)?.id ?? null)

  if (!orgId) {
    check(false, 'у проверочной учётной записи есть хозяйство')
  } else {
    const [summary, counted] = await Promise.all([
      herdSummary(payload, orgId),
      payload.count({
        collection: 'animals',
        where: { and: [{ owner: { equals: orgId } }, { archived: { not_equals: true } }] },
        overrideAccess: true,
      }),
    ])
    check(summary !== null, 'сводка по стаду считается')
    check(
      summary?.total === counted.totalDocs,
      'в «Обзоре» и в списке стада одно и то же число',
      `сводка ${summary?.total}, список ${counted.totalDocs}`,
    )
    /*
     * И то же число обязано стоять на странице. Расхождение здесь означало бы,
     * что «Обзор» берёт его не из сводки, — то есть завёлся третий счёт.
     */
    const overview = pages.get('/account?tab=overview') ?? ''
    if (summary && overview) {
      const shown = summary.total.toLocaleString('ru-RU')
      check(
        overview.includes(shown) || overview.includes(String(summary.total)),
        `на «Обзоре» напечатано ${shown}`,
      )
    }
  }

  /* ----------------------------- 5. шапка ----------------------------- */
  console.log('\nШапка')
  const home = pages.get('/account?tab=overview') ?? ''
  check(home.includes('Моё хозяйство'), 'дверь в кабинет есть в меню шапки')
  check(home.includes('/bulls/compare'), 'сравнение быков названо в шапке')
  /*
   * «Аукционы» остались страницей и ссылкой в подвале — проверяется, что
   * их нет именно в меню шапки, а не что слова нет на странице вовсе.
   */
  const headerNav = home.match(/<nav class="hidden[\s\S]*?<\/nav>/)?.[0] ?? ''
  check(headerNav.length > 0, 'меню шапки нашлось в разметке')
  check(!headerNav.includes('Аукционы'), 'заглушки «Аукционы» в меню шапки нет')

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
