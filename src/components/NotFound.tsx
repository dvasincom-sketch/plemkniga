import Link from 'next/link'

/**
 * Содержимое страницы «не найдено».
 *
 * ## Зачем своя страница
 *
 * До сих пор на несуществующий адрес отвечала стандартная страница
 * Next.js: чёрный фон, «404 — This page could not be found». Весь сайт
 * по-русски, а промахнувшийся ссылкой зоотехник видит английскую надпись
 * на чёрном и делает единственный разумный вывод — система сломалась.
 * Дальше он не ищет, он звонит.
 *
 * ## Почему поиск, а не только извинения
 *
 * Чаще всего сюда попадают двумя путями: опечатались в номере животного
 * или перешли по старой ссылке из письма. Первому нужен поиск по номеру —
 * он здесь и работает: поле уходит в ту же строку поиска, что и в книге.
 * Второму нужны двери: книга, кабинет, загрузка.
 *
 * Страница не спрашивает, что случилось, и не предлагает «попробовать
 * снова»: адрес не исправится от повтора. Она предлагает то, ради чего
 * человек пришёл.
 *
 * ## Почему компонент, а не страница
 *
 * Страниц две. `app/(frontend)/not-found.tsx` ловит `notFound()` внутри
 * приложения — там есть общая раскладка, шапка и подвал. `app/not-found.tsx`
 * ловит адреса, не совпавшие ни с одним маршрутом; раскладка в этом
 * проекте живёт внутри групп маршрутов, и до неё такой адрес не доходит —
 * страница несёт собственные `html` и `body`. Содержимое у обеих одно
 * и то же, и копировать его в два файла значило бы получить две разные
 * страницы «не найдено» через месяц.
 */
export function NotFoundContent() {
  return (
    <div className="mx-auto max-w-[70ch] py-16">
      <p className="text-[13px] uppercase tracking-[0.09em] text-ink-500">Страница не найдена</p>

      <h1 className="mt-3 text-[30px] font-medium leading-tight sm:text-[36px]">
        Такой страницы в книге нет
      </h1>

      <p className="mt-5 text-[15px] leading-relaxed text-ink-700">
        Адрес не совпал ни с одним разделом. Обычно это опечатка в номере животного
        или ссылка из старого письма: разделы кабинета за это время переименовывались.
        Данные при этом на месте — не найден именно адрес.
      </p>

      {/*
         Поиск уходит в книгу теми же параметрами, что и обычная строка
         поиска: `id` — индивидуальный номер. Отдельного обработчика
         у формы нет намеренно, иначе он разошёлся бы с настоящим поиском.
      */}
      <form action="/" method="get" className="mt-8">
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Искать животное по номеру</span>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              name="id"
              placeholder="Например, 3662217000196"
              className="field field-on-light w-full max-w-[22rem]"
            />
            <button type="submit" className="btn btn-accent">
              Найти
            </button>
          </div>
        </label>
      </form>

      <p className="mt-10 text-[14px] font-medium">Куда ещё можно пойти</p>
      <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-700">
        <li>
          <Link href="/" className="underline underline-offset-4 hover:text-forest-500">
            Племенная книга
          </Link>{' '}
          — общий список животных и поиск по нему
        </li>
        <li>
          <Link href="/account" className="underline underline-offset-4 hover:text-forest-500">
            Личный кабинет
          </Link>{' '}
          — своё стадо, данные и документы
        </li>
        <li>
          <Link
            href="/account?tab=data&sub=write"
            className="underline underline-offset-4 hover:text-forest-500"
          >
            Загрузка данных
          </Link>{' '}
          — запись события и загрузка файлом
        </li>
      </ul>

      <p className="mt-8 text-[14px] leading-relaxed text-ink-500">
        Если сюда привела ссылка из письма Ассоциации, напишите на{' '}
        <a
          href="mailto:info@holstein-russia.ru"
          className="underline underline-offset-4 hover:text-forest-500"
        >
          info@holstein-russia.ru
        </a>{' '}
        — ссылку поправят.
      </p>
    </div>
  )
}
