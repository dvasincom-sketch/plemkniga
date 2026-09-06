import Link from 'next/link'
import type { Note } from '@/lib/notes'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbLd, graph, noteLd } from '@/lib/jsonld'

/**
 * Обвязка разбора: заголовок, паспорт, подпись автора и список источников.
 *
 * ## Почему паспорт стоит до текста, а не после
 *
 * Специалист решает, читать ли разбор, по двум вещам: на каком материале
 * он сделан и кто за него отвечает. Спрятать это в конец значит заставить
 * его дочитать, чтобы узнать, стоило ли начинать. Паспорт до текста —
 * не украшение, а честное «вот на чём это стоит, дальше решайте сами».
 *
 * ## Почему источники внизу, а ссылки на них по тексту
 *
 * Ссылка в середине абзаца уводит с середины абзаца. Число по тексту
 * названо вместе с источником словами («по таблице USDA»), а адрес,
 * по которому это проверяют, лежит в конце — там, где его ищут,
 * когда дочитали и захотели проверить.
 */
export function NoteHeader({ note }: { note: Note }) {
  return (
    <>
      {/*
         Разметка для поисковых систем стоит здесь, а не на каждой
         странице разбора по отдельности. Довод тот же, по которому
         паспорт и источники рисует общая обвязка: разбор, добавленный
         завтра, получает её вместе с заголовком и не может её забыть.
         Собирается она из той же записи `Note`, из которой напечатаны
         заголовок, подпись автора и список источников ниже, — второй
         правды об одном разборе не заводится.
      */}
      <JsonLd
        data={graph(
          noteLd(note),
          breadcrumbLd([
            { name: 'Разборы', path: '/ru/razbory' },
            { name: note.title, path: `/ru/razbory/${note.slug}` },
          ]),
        )}
      />

      <nav className="text-[14px] text-ink-500">
        <Link href="/ru/razbory" className="underline underline-offset-4 hover:text-forest-500">
          Разборы
        </Link>
      </nav>

      <section className="mt-6 max-w-[75ch]">
        <h1 className="text-[34px] font-medium leading-tight sm:text-[44px]">{note.title}</h1>

        <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{note.lead}</p>

        <p className="mt-5 text-[14px] text-ink-500">
          {note.authorUrl ? (
            <a
              href={note.authorUrl}
              className="underline underline-offset-4 hover:text-forest-500"
              rel="noopener noreferrer"
            >
              {note.author}
            </a>
          ) : (
            note.author
          )}
          {' · '}
          {new Date(note.date).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </section>

      <section className="mt-8 max-w-[75ch] rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
        <dl className="divide-y divide-ink-100">
          {note.passport.map((p) => (
            <div key={p.label} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6">
              <dt className="w-[22ch] shrink-0 text-[14px] text-ink-500">{p.label}</dt>
              <dd className="text-[15px]">{p.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}

export function NoteSources({ note }: { note: Note }) {
  return (
    <section className="mt-14 max-w-[75ch]">
      <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Источники</h2>

      <ul className="mt-5 space-y-5">
        {note.sources.map((s) => (
          <li key={s.title} className="text-[15px] leading-relaxed">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
              >
                {s.title}
              </a>
            ) : (
              <span className="font-medium">{s.title}</span>
            )}
            {s.what && <p className="mt-1 text-[14px] text-ink-500">{s.what}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Соседние разборы — чтобы дочитавший не упирался в конец страницы.
 *
 * Показываются все, кроме текущего. Довод «их пока двое, и подбирать
 * похожие было бы механикой ради механики» отработал своё: разборов
 * теперь полтора десятка, и список читается как список, а не как
 * продолжение чтения. Подбирать похожие по общим терминам стоит,
 * когда для этого найдётся правило лучше, чем «те же слова в `terms`»;
 * до тех пор честнее полный список, чем подбор, объяснить который
 * нельзя.
 */
export function NoteNeighbours({ notes, current }: { notes: Note[]; current: string }) {
  const others = notes.filter((n) => n.slug !== current)
  if (others.length === 0) return null

  return (
    <section className="mt-14">
      <h2 className="text-[20px] font-medium leading-tight">Другие разборы</h2>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {others.map((n) => (
          <Link
            key={n.slug}
            href={`/ru/razbory/${n.slug}`}
            className="rounded-xl border border-ink-100 bg-white px-4 py-3 transition-colors hover:border-forest-500"
          >
            <span className="text-[15px] font-medium">{n.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
