'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Счётчик посещаемости.
 *
 * ## Почему он не стоит на закрытых страницах
 *
 * Это главное решение здесь, и оно принято против удобства.
 *
 * Вебвизор записывает не переходы, а **экран**: движения курсора,
 * нажатия и содержимое страницы. На витрине это безобидно — там
 * рекламный текст. В кабинете на экране лежат номера животных, надои,
 * ветеринарные события и реквизиты хозяйства, то есть чужие данные,
 * доверенные книге под обещание, что дальше книги они не пойдут.
 *
 * Отправлять их постороннему сервису значит нарушить это обещание —
 * не в переносном смысле, а буквально: политика обработки, которую
 * Ассоциация подписала своим именем, такой передачи не предусматривает.
 * Поэтому счётчик работает на публичных страницах и молчит везде,
 * где нужен вход.
 *
 * Соблазн сделать иначе понятен: без счётчика в кабинете не видно,
 * какими разделами пользуются. Ответ на этот вопрос надо получать
 * своими средствами — записями в своей же базе, — а не отдавая чужие
 * данные ради удобства измерения.
 *
 * ## Почему переходы считаются вручную
 *
 * Приложение односторончатое: при переходе между разделами страница
 * не перезагружается, и счётчик, поставленный один раз, засчитал бы
 * один просмотр за всё посещение. Отсюда `hit` на каждую смену адреса.
 *
 * Первый просмотр при этом счётчик отправляет сам при запуске, и наш
 * `hit` на первом же адресе удвоил бы его. Поэтому первая смена
 * пропускается — признак хранится в `ref`, а не в состоянии: его смена
 * не должна вызывать перерисовку.
 *
 * ## Почему идентификатор приходит сверху
 *
 * Его читает серверная раскладка из переменной окружения и передаёт
 * сюда свойством. Через `NEXT_PUBLIC_` он вшился бы в сборку, и смена
 * счётчика потребовала бы пересборки — рака, на которую мы уже
 * наступали с адресом хранилища и с базой.
 */

/** Разделы, где счётчика нет: за ними вход и чужие данные. */
const PRIVATE = ['/account', '/association', '/admin', '/checks', '/bench']

const isPrivate = (path: string) =>
  PRIVATE.some((p) => path === p || path.startsWith(`${p}/`))

declare global {
  interface Window {
    ym?: (id: number, action: string, ...rest: unknown[]) => void
  }
}

export function Metrika({ id }: { id?: string }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const first = useRef(true)

  const counter = Number(id)
  const off = !counter || Number.isNaN(counter) || isPrivate(pathname)

  useEffect(() => {
    if (off) return
    if (first.current) {
      first.current = false
      return
    }

    const query = search.toString()
    window.ym?.(counter, 'hit', `${location.origin}${pathname}${query ? `?${query}` : ''}`)
  }, [off, counter, pathname, search])

  if (off) return null

  return (
    <Script id="ym-counter" strategy="afterInteractive">
      {`
        (function(m,e,t,r,i,k,a){
          m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {
            if (document.scripts[j].src === r) { return; }
          }
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,
          a.parentNode.insertBefore(k,a)
        })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=${counter}', 'ym');
        ym(${counter}, 'init', {
          ssr: true,
          webvisor: true,
          clickmap: true,
          ecommerce: 'dataLayer',
          accurateTrackBounce: true,
          trackLinks: true
        });
      `}
    </Script>
  )
}
