import type { Metadata } from 'next'
import React, { Suspense } from 'react'
import './globals.css'
import { currentTenant } from '@/lib/tenant-server'
import { Metrika } from '@/components/Metrika'
import { BOOK_HOST, SITE_HOSTS, SITE_LOCALE_HEADER, isSiteHost } from '@/lib/hosts'
import { headers } from 'next/headers'
import { isLocale } from '@/lib/i18n/locales'

/*
 * Заголовок и язык берутся у книги, а не вписаны.
 *
 * Постоянное `metadata` здесь не годится: оно вычисляется один раз
 * на сборку, а книг две и они различаются по заголовку запроса.
 * Голштинское имя во вкладке показательной книги — первое, что увидел бы
 * гость, ещё не открыв страницу.
 *
 * `lang` важнее, чем кажется: по нему читающая программа выбирает голос
 * и правила чтения. Английская страница, помеченная `ru`, будет прочитана
 * вслух русским произношением — то есть неразборчиво.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await currentTenant()

  /*
   * Основание для относительных адресов в разметке для поисковых систем.
   *
   * Без него `canonical: '/ru/breeds'` уезжает в разметку как есть,
   * а относительный адрес там не принимается — страница остаётся
   * без указания основной, и поисковая система решает сама, какую
   * из копий считать главной.
   *
   * Домен берётся из заголовка запроса, а не у книги: на витрине
   * и в книге он разный, а раскладка одна на оба домена. Взяв его
   * у книги, мы проставили бы витринным страницам книжный адрес —
   * то есть отдали бы поисковой системе указание считать главной
   * страницу на чужом домене.
   */
  const host = isSiteHost((await headers()).get('host')) ? SITE_HOSTS[0]! : BOOK_HOST

  return {
    metadataBase: new URL(`https://${host}`),
    title: {
      default: `Племенная книга — ${t.org.full}`,
      template: '%s — Племенная книга',
    },
    description:
      'Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте (КРС) с целью определения наиболее перспективных быков-производителей для селекции.',
    /*
     * Разметка для соцсетей и мессенджеров. Ссылку на книгу присылают
     * в переписке чаще, чем набирают руками, и без этих полей она
     * разворачивается голым адресом — то есть выглядит подозрительно
     * ровно там, где решают, открывать её или нет.
     */
    openGraph: {
      type: 'website',
      locale: t.lang === 'ru' ? 'ru_RU' : 'en_US',
      siteName: t.org.full,
    },
    robots: { index: true, follow: true },
  }
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const t = await currentTenant()

  /*
   * Язык страницы, а не язык книги.
   *
   * `<html lang>` читают программа чтения с экрана, переводчик браузера
   * и поисковая система. Пока он брался у арендатора домена, английская
   * страница витрины объявляла себя русской: читалка произносила
   * английский текст русскими правилами, а браузер предлагал перевести
   * уже переведённое.
   *
   * Адреса в обвязке нет, поэтому язык кладёт в заголовок промежуточный
   * обработчик при переписывании адреса (`middleware.ts`). Нет заголовка —
   * значит это книга, и язык у неё свой.
   */
  const header = (await headers()).get(SITE_LOCALE_HEADER)
  const lang = header && isLocale(header) ? header : t.lang

  return (
    <html lang={lang}>
      <body className="min-h-screen bg-canvas antialiased">
        {children}
        {/*
           Счётчик читает адрес страницы, а он в Next доступен только
           внутри границы ожидания: без неё сборка страниц заранее
           падает целиком. Разбор, где счётчик молчит и почему, —
           в самом компоненте.
        */}
        <Suspense fallback={null}>
          <Metrika id={process.env.YANDEX_METRIKA_ID} />
        </Suspense>
      </body>
    </html>
  )
}
