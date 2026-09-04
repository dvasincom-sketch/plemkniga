import Link from 'next/link'
import { termHref, type Term } from '@/lib/terms'
import { USE_LABEL, usesOf } from '@/lib/term-links'

/**
 * Обвязка статьи словаря.
 *
 * ## Почему определение вынесено в карточку, а не набрано абзацем
 *
 * Пришедший с вопроса «что такое сервис-период» решает за две секунды,
 * тут ему ответили или нет. Абзац такой скорости не даёт: его надо начать
 * читать. Карточка сверху отвечает целиком и сразу, а всё, что ниже, —
 * для того, кто после ответа захотел подробностей.
 *
 * ## Почему число стоит отдельной плашкой
 *
 * Это единственное, чем наша статья отличается от десяти чужих статей
 * про то же слово. «Порог внимания 6,25 %», «границы 10…775 дней»,
 * «глубина обхода шесть колен» — числа из работающего кода, а не из
 * учебника, и их надо видеть, не читая.
 */
export function TermHeader({ term }: { term: Term }) {
  return (
    <>
      <nav className="text-[14px] text-ink-500">
        <Link href="/ru/slovar" className="underline underline-offset-4 hover:text-forest-500">
          Словарь
        </Link>
      </nav>

      <section className="mt-6 max-w-[75ch]">
        <h1 className="text-[34px] font-medium leading-tight sm:text-[44px]">{term.title}</h1>

        {term.also && term.also.length > 0 && (
          <p className="mt-3 text-[14px] text-ink-500">Ещё говорят: {term.also.join(', ')}</p>
        )}

        <p className="mt-6 rounded-2xl bg-ink-50 p-6 text-[19px] leading-relaxed text-ink-900">
          {term.short}
        </p>
      </section>
    </>
  )
}

/**
 * Три части статьи.
 *
 * Порядок закреплён здесь, а не оставлен на усмотрение страницы: он и есть
 * жанр. «Чего это не означает» в конце и всегда — без этой части словарь
 * превращается в рекламный буклет, где каждое слово значит именно то,
 * что удобно.
 */
export function TermBody({ term }: { term: Term }) {
  if (!term.body) return null
  const { what, how, not } = term.body

  const Section = ({ title, paragraphs }: { title: string; paragraphs: string[] }) => (
    <section className="mt-14 max-w-[75ch]">
      <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">{title}</h2>
      {paragraphs.map((p) => (
        <p key={p.slice(0, 40)} className="mt-5 text-[16px] leading-relaxed text-ink-700">
          {p}
        </p>
      ))}
    </section>
  )

  return (
    <>
      <Section title="Что это" paragraphs={what} />
      <Section title="Как это считает книга" paragraphs={how} />
      <Section title="Чего это не означает" paragraphs={not} />
    </>
  )
}

/** Куда идти дальше и на чём это стоит. */
export function TermFooter({ term }: { term: Term }) {
  /*
   * Где это слово работает — считается, а не перечисляется руками.
   *
   * Перечень с обеих сторон дал бы две правды об одной связи: добавивший
   * термин в разбор забыл бы дописать разбор в термин, и увидеть это
   * нельзя было бы ни с одной из двух страниц. Объявляет связь та
   * сторона, которая про неё знает, — разбор, исследование, порода,
   * — а здесь она читается обратно (`lib/term-links.ts`).
   */
  const uses = usesOf(term.slug)

  return (
    <>
      {uses.length > 0 && (
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[20px] font-medium leading-tight">Где это работает</h2>

          <ul className="mt-4 space-y-2">
            {uses.map((u) => (
              <li key={u.href} className="text-[15px] leading-relaxed">
                <span className="text-ink-500">{USE_LABEL[u.kind]}: </span>
                <Link
                  href={u.href}
                  className="underline underline-offset-4 hover:text-forest-500"
                >
                  {u.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {term.see && term.see.length > 0 && (
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[20px] font-medium leading-tight">Читать дальше</h2>
          {/*
             Адрес соседнего термина пересчитывается, а не берётся как
             написан. Написан он бывает путём — `/ru/slovar/kompozit`, —
             и если у того термина статьи нет, путь ведёт в «не найдено».
             Разбор в `lib/terms.ts`: ссылка на определение без статьи
             обязана вести на его строку в указателе, и решать это должен
             код, а не память пишущего.
          */}
          <ul className="mt-4 space-y-2">
            {term.see.map((s) => {
              const slug = s.href.startsWith('/ru/slovar/') ? s.href.slice('/ru/slovar/'.length) : null
              const href = slug ? termHref(slug) : s.href

              return (
                <li key={s.href}>
                  <Link
                    href={href}
                    className="text-[15px] underline underline-offset-4 hover:text-forest-500"
                  >
                    {s.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {term.sources && term.sources.length > 0 && (
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[20px] font-medium leading-tight">Источники</h2>
          <ul className="mt-4 space-y-3">
            {term.sources.map((s) => (
              <li key={s.title} className="text-[15px] leading-relaxed text-ink-700">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-forest-500"
                  >
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
