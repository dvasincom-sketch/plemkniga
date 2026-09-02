import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LOCALE_COOKIE } from '@/lib/i18n/locales'
import { resolveLocale } from '@/lib/i18n/negotiate'
import { SITE_PREFIX, isSiteHost } from '@/lib/hosts'

/**
 * Корень витрины: узнать язык и уйти на него.
 *
 * ## Куда именно уйти
 *
 * На **видимый** адрес, а не на внутренний. На витринном домене человек
 * стоит на `plem.online/`, промежуточный обработчик показывает ему
 * содержимое `/site`, и переброс должен вести на `/ru` — который тот же
 * обработчик снова превратит в `/site/ru`. Уйди мы на `/site/ru`, в строке
 * браузера появился бы служебный путь, о котором посетителю знать незачем.
 *
 * На книжном домене всё наоборот: обработчик ничего не переписывает,
 * и уходить надо прямо на `/site/ru`. Отсюда приставка, вычисленная
 * по хосту, а не зашитая.
 *
 * Разбор способа определения языка — в `lib/i18n/negotiate.ts`; коротко:
 * по заголовку браузера, а не по стране IP-адреса, и явный выбор человека
 * сильнее догадки.
 */

export const dynamic = 'force-dynamic'

export default async function SiteEntryPage() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])

  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language'),
  })

  const base = isSiteHost(headerList.get('host')) ? '' : SITE_PREFIX
  redirect(`${base}/${locale}`)
}
