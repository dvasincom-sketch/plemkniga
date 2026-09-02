import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LOCALE_COOKIE } from '@/lib/i18n/locales'
import { resolveLocale } from '@/lib/i18n/negotiate'

/**
 * `/eaeu` — не страница, а развилка: узнать язык и уйти на него.
 *
 * ## Почему переброс, а не показ содержимого прямо здесь
 *
 * Адрес без языка не сообщает, на каком языке страница открылась. Ссылку
 * на неё перешлют коллеге в другой стране, и он увидит другой текст
 * по тому же адресу — а обсуждать они будут, думая, что видят одно и то же.
 * После переброса в адресе всегда стоит язык, и ссылка означает
 * ровно то, что открывший её видит.
 *
 * ## Что здесь не так и почему оставлено
 *
 * Переброс на корне мешает поисковикам и стоит одного лишнего перехода.
 * Правильнее было бы отдавать здесь выбор языка списком — но это
 * страница-предложение, а не документация, и лишний экран перед
 * содержимым отсеет ровно тех, ради кого она написана.
 *
 * Компенсация: ни одна из языковых страниц сама никуда не перебрасывает.
 * Догадка работает один раз, на входе; человек, попавший на `/eaeu/kk`
 * по прямой ссылке, получит казахский независимо от своего браузера.
 *
 * Разбор способа определения языка — в `lib/i18n/negotiate.ts`.
 */

export const dynamic = 'force-dynamic'

export default async function EaeuEntryPage() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])

  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language'),
  })

  redirect(`/eaeu/${locale}`)
}
