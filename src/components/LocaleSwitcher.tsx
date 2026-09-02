'use client'

import { useRouter } from 'next/navigation'
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from '@/lib/i18n/locales'

/**
 * Переключатель языка.
 *
 * ## Почему он есть, хотя язык определяется сам
 *
 * Любое угадывание ошибается, и главное свойство хорошего угадывания —
 * не точность, а возможность его отменить. Человек, попавший не на свой
 * язык, должен исправить это одним движением и больше к вопросу
 * не возвращаться.
 *
 * ## Почему список, а не выпадающее меню
 *
 * Языков шесть, они помещаются в строку, и каждый написан своим письмом:
 * кириллицей, латиницей, армянским алфавитом. В свёрнутом меню человек
 * видит только текущий язык и должен догадаться, что остальные там есть.
 * Развёрнутый список решает это без единого нажатия — своё слово
 * находят глазами.
 *
 * ## Почему cookie, а не только адрес
 *
 * Адрес помнит язык этой страницы, cookie помнит выбор человека. Нужны
 * оба: по адресу ссылку пересылают коллеге, по cookie узнают язык
 * при следующем заходе на корень. Записывается cookie здесь, на клиенте,
 * а не серверным действием — это предпочтение показа, а не данные,
 * и гонять ради него запрос на сервер незачем.
 *
 * `SameSite=Lax` и без `Secure` в разработке: на localhost по http
 * браузер молча выбросил бы `Secure`-cookie, и выбор языка не сохранялся
 * бы именно там, где его проверяют.
 */
export function LocaleSwitcher({
  active,
  label,
  hrefs,
}: {
  active: Locale
  /** Подпись на языке страницы: «Язык», «Language», «Тіл». */
  label: string
  /**
   * Куда вести для каждого языка — готовыми адресами, а не функцией.
   *
   * Здесь стояло `hrefOf: (locale) => string`, и сборка на этом падала:
   * функцию нельзя передать из серверного компонента в клиентский, её
   * нечем сериализовать. Ошибка вылезла только на `next build`, при
   * предварительной отрисовке `/eaeu/ru`, — в разработке страница
   * работала, потому что там серверный компонент и клиентский живут
   * в одном процессе.
   *
   * Простой объект решает это без потерь: адреса всё так же знает
   * страница, а не переключатель, и их всего шесть.
   */
  hrefs: Record<Locale, string>
}) {
  const router = useRouter()

  const choose = (locale: Locale) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie =
      `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}` +
      `; SameSite=Lax${secure}`
    router.push(hrefs[locale])
  }

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-1 gap-y-2">
      <span className="mr-2 text-[13px] text-ink-500">{label}</span>

      {LOCALES.map((l) => {
        const isActive = l.code === active

        return (
          <button
            key={l.code}
            type="button"
            onClick={() => choose(l.code)}
            aria-current={isActive ? 'true' : undefined}
            /*
               lang на самой кнопке: без него синтезатор речи прочитает
               «Қазақша» правилами языка страницы, то есть невнятно.
               Это единственное место, где на одном экране соседствуют
               шесть языков, и разметить их — не педантизм.
            */
            lang={l.code}
            className={`rounded-lg px-3 py-1.5 text-[14px] transition-colors ${
              isActive
                ? 'bg-forest-500 text-white'
                : 'text-ink-700 hover:bg-ink-50 hover:text-forest-500'
            }`}
          >
            {l.native}
          </button>
        )
      })}
    </nav>
  )
}
