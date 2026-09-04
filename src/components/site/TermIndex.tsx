'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

/**
 * Указатель словаря с отбором по строке.
 *
 * ## Почему не алфавит
 *
 * Алфавитный список полезен тому, кто слово уже знает и ищет глазами.
 * Наш читатель приходит с другой стороны: он видел число в отчёте
 * и не знает, как называется то, что его смущает. Ему нужен раздел
 * «Воспроизводство», а внутри — десяток строк, среди которых он узнает
 * своё. Поэтому группировка по смыслу, а алфавит только внутри группы.
 *
 * ## Почему отбор на стороне читателя, а не поиск
 *
 * Терминов меньше сотни, и все они уже на странице. Поиск на сервере
 * означал бы запрос, ожидание и пустой экран между ними — ради работы,
 * которую браузер делает мгновенно. Заодно страница остаётся целиком
 * читаемой без сценариев: отбор — удобство поверх готового списка,
 * а не способ его получить.
 *
 * Отбор смотрит и в синонимы: «дни открытые» и `days open` приведут
 * к сервис-периоду, хотя на странице стоит другое слово.
 */
export type IndexTerm = {
  slug: string
  title: string
  short: string
  also?: string[]
  hasPage: boolean
}

export type IndexGroup = {
  key: string
  title: string
  lead: string
  terms: IndexTerm[]
}

export function TermIndex({ groups }: { groups: IndexGroup[] }) {
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return groups

    const hit = (t: IndexTerm) =>
      t.title.toLowerCase().includes(q) ||
      t.short.toLowerCase().includes(q) ||
      (t.also ?? []).some((a) => a.toLowerCase().includes(q))

    return groups
      .map((g) => ({ ...g, terms: g.terms.filter(hit) }))
      .filter((g) => g.terms.length > 0)
  }, [groups, query])

  const total = shown.reduce((n, g) => n + g.terms.length, 0)

  return (
    <>
      <div className="mt-10">
        <label htmlFor="term-filter" className="sr-only">
          Найти термин
        </label>
        <input
          id="term-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти термин: сервис-период, кровность, надёжность…"
          className="w-full max-w-[520px] rounded-xl border border-ink-200 px-4 py-3 text-[16px] outline-none transition-colors focus:border-forest-500"
        />
        {query.trim() !== '' && (
          <p className="mt-3 text-[14px] text-ink-500">
            {total === 0 ? 'Ничего не нашлось' : `Нашлось: ${total}`}
          </p>
        )}
      </div>

      {shown.map((g) => (
        <section key={g.key} className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">{g.title}</h2>
          <p className="mt-3 max-w-[75ch] text-[16px] leading-relaxed text-ink-500">{g.lead}</p>

          {/*
             Якорь на каждой строке, а не только на тех, у кого есть статья:
             на строку без статьи ведут ссылки «читать дальше» из соседних
             терминов, и вести им больше некуда (`lib/terms.ts`, `termHref`).
          */}
          <dl className="mt-6 space-y-5">
            {g.terms.map((t) => (
              <div
                key={t.slug}
                id={t.slug}
                className="max-w-[80ch] scroll-mt-24 border-t border-ink-100 pt-5"
              >
                <dt className="text-[17px] font-medium">
                  {/*
                     Ссылка стоит только у термина со своей статьёй. Строка
                     указателя, ведущая на страницу, которой нет, хуже строки
                     без ссылки: по ней идут и не находят обещанного.
                  */}
                  {t.hasPage ? (
                    <Link
                      href={`/ru/slovar/${t.slug}`}
                      className="underline underline-offset-4 hover:text-forest-500"
                    >
                      {t.title}
                    </Link>
                  ) : (
                    t.title
                  )}
                </dt>
                <dd className="mt-2 text-[16px] leading-relaxed text-ink-700">{t.short}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  )
}
