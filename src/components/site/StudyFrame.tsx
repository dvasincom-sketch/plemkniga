import Link from 'next/link'
import { nf } from '@/lib/format'
import { termHref } from '@/lib/terms'
import {
  demandTally,
  fieldTally,
  type Study,
  type StudyDemand,
  type StudyDemandKind,
  type StudyField,
  type StudyHolding,
} from '@/lib/studies'

/**
 * Обвязка страницы исследования.
 *
 * ## Почему паспорт работы стоит до текста
 *
 * Довод тот же, что у разборов: специалист решает, читать ли, по тому,
 * на каком материале это сделано. Здесь к нему добавляется своё —
 * строка «что мы прочли». Работа, из которой у нас только аннотация,
 * и работа, прочитанная целиком, дают тексты разной силы, и читатель
 * обязан знать это до первого утверждения, а не после последнего.
 *
 * ## Почему порядок частей закреплён здесь
 *
 * Порядок и есть жанр — как три части у статьи словаря. Оставленный
 * на усмотрение пишущего, он немедленно расходится: одному покажется,
 * что «чего не хватает» лучше в конце, другому — что оговорки можно
 * и опустить. Семь заголовков стоят в коде, страница их не выбирает
 * и пропустить не может, потому что тип требует все семь.
 *
 * Последним стоит не «чего пересчёт не докажет», а «что книга должна
 * научиться хранить», и заголовок написан требованием, а не оговоркой.
 * Разница не в вежливости: страница, кончающаяся перечнем причин, по
 * которым мы чего-то не можем, закрепляет эти причины. Страница,
 * кончающаяся списком работ, называет их временными.
 *
 * ## Почему у полей, у счёта и у требований своя разметка, а не абзацы
 *
 * Это три таблицы, которые читают глазами, а не подряд: соискатель ищет
 * в первой своё поле, во второй — есть ли у нас материал, а в третьей
 * своё место в коде ищем уже мы. Набранные прозой, они превратились бы
 * в перечисление через запятую, по которому ничего не найти, — и главное,
 * перестали бы считаться из кода.
 */

/**
 * Что мы прочли.
 *
 * Двумя способами сразу и намеренно: значком у заголовка паспорта, который
 * виден до чтения, и строкой в самом паспорте, которая объясняет значок.
 * Значок без подписи пришлось бы разгадывать, подпись без значка — искать
 * в таблице из четырёх строк, а знать это нужно раньше первого утверждения
 * о работе.
 */
const READ: Record<Study['work']['read'], { badge: string; row: string; className: string }> = {
  full: {
    badge: 'прочитан полный текст',
    row: 'Прочитан полный текст',
    className: 'bg-forest-50 text-forest-600',
  },
  abstract: {
    badge: 'прочитана открытая часть',
    row: 'Прочитана открытая часть: название, аннотация, объём выборки',
    className: 'bg-amber-50 text-amber-700',
  },
}

/**
 * Род требования.
 *
 * Подпись говорит, кто это закрывает, а не сколько это стоит. «Вне книги»
 * стоит особняком потому, что это единственное, чего нельзя взять и
 * сделать: полный текст покупается, код в стандарте ждут. Смешать его
 * с остальным значило бы сделать весь список одинаково недостижимым.
 */
const DEMAND_KIND: Record<StudyDemandKind, { label: string; className: string }> = {
  field: { label: 'поле в книге', className: 'bg-forest-50 text-forest-600' },
  intake: { label: 'загрузка и обмен', className: 'bg-brand-50 text-forest-600' },
  calc: { label: 'расчёт', className: 'bg-amber-50 text-amber-700' },
  outside: { label: 'вне книги', className: 'bg-ink-100 text-ink-500' },
}

/**
 * Состояние поля.
 *
 * Три значения, а не «есть или нет». Промежуточное здесь самое частое:
 * поле заведено, но заполнено не у всех, или величина не хранится, а
 * выводится из соседних. Свести это к «есть» значило бы пообещать
 * соискателю выборку, которой он не получит.
 */
const STATE: Record<StudyField['state'], { label: string; className: string }> = {
  yes: { label: 'есть', className: 'bg-forest-50 text-forest-600' },
  partial: { label: 'не у всех', className: 'bg-amber-50 text-amber-700' },
  no: { label: 'нет', className: 'bg-ink-100 text-ink-500' },
}

export function StudyHeader({ study }: { study: Study }) {
  const { work } = study

  return (
    <>
      <nav className="text-[14px] text-ink-500">
        <Link
          href="/ru/issledovaniya"
          className="underline underline-offset-4 hover:text-forest-500"
        >
          Исследования
        </Link>
      </nav>

      <section className="mt-6 max-w-[75ch]">
        <h1 className="text-[34px] font-medium leading-tight sm:text-[44px]">{study.title}</h1>

        <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{study.lead}</p>

        <p className="mt-5 text-[14px] text-ink-500">
          {study.authorUrl ? (
            <a
              href={study.authorUrl}
              className="underline underline-offset-4 hover:text-forest-500"
              rel="noopener noreferrer"
            >
              {study.author}
            </a>
          ) : (
            study.author
          )}
          {' · '}
          {new Date(study.date).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </section>

      {/*
         Паспорт работы. Название стоит по-английски и ссылкой: искать
         работу будут по названию, а перевод названия не находится ни
         в одной базе.
      */}
      <section className="mt-8 max-w-[75ch] rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] uppercase tracking-wide text-ink-400">Работа</p>
          {/*
             Пометка о прочитанном стоит у самого заголовка паспорта,
             а не только строкой ниже: она определяет цену всего, что
             написано дальше, и читается раньше названия работы.
          */}
          <span
            className={`rounded-full px-2 py-[2px] text-[12px] ${READ[work.read].className}`}
          >
            {READ[work.read].badge}
          </span>
        </div>

        <p className="mt-3 text-[17px] leading-snug">
          <a
            href={work.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
          >
            {work.title}
          </a>
        </p>

        <dl className="mt-5 divide-y divide-ink-100">
          {[
            { label: 'Авторы', value: work.authors },
            { label: 'Где и когда', value: `${work.journal}, ${work.year}` },
            { label: 'Выборка', value: work.sample },
            { label: 'Что мы прочли', value: READ[work.read].row },
          ].map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6"
            >
              <dt className="w-[16ch] shrink-0 text-[14px] text-ink-500">{row.label}</dt>
              <dd className="text-[15px] leading-relaxed">{row.value}</dd>
            </div>
          ))}
        </dl>

        {/*
           Что следует из «прочитана открытая часть» — словами, на самой
           странице. Пометка сама по себе сообщает факт о нас, а читателю
           нужно следствие: чего эта страница не говорит о работе и почему
           здесь не будет ни одной величины из закрытого текста.
        */}
        {work.read === 'abstract' && (
          <p className="mt-6 border-t border-ink-100 pt-6 text-[14px] leading-relaxed text-ink-500">
            Страница написана по открытой части и потому не пересказывает выводов работы:
            всё, что здесь сказано о ней, проверяется по названию, аннотации и объёму
            выборки. Величин и корреляций из закрытого текста тут нет — ни своими словами,
            ни через чужой пересказ. Наша половина страницы, начиная со второй части,
            от этого не зависит: она про нашу базу.
          </p>
        )}
      </section>
    </>
  )
}

const Part = ({ title, paragraphs }: { title: string; paragraphs: readonly string[] }) => (
  <section className="mt-14 max-w-[75ch]">
    <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">{title}</h2>
    {paragraphs.map((p) => (
      <p key={p.slice(0, 40)} className="mt-5 text-[16px] leading-relaxed text-ink-700">
        {p}
      </p>
    ))}
  </section>
)

/** Поля книги поимённо — второй частью. */
function Fields({ study }: { study: Study }) {
  const tally = fieldTally(study)

  return (
    <div className="mt-6 max-w-[75ch] overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <ul className="divide-y divide-ink-100">
        {study.fields.map((f) => (
          <li key={`${f.where}:${f.name}`} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <code className="text-[15px] font-medium">{f.name}</code>
              <span className="text-[13px] text-ink-400">{f.where}</span>
              <span
                className={`rounded-full px-2 py-[2px] text-[12px] ${STATE[f.state].className}`}
              >
                {STATE[f.state].label}
              </span>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{f.what}</p>
          </li>
        ))}
      </ul>

      {/*
         Итог считается из самого списка (`fieldTally`), а не пишется
         рядом с ним: дописанная строка иначе сделала бы подпись неверной,
         и неверной молча.
      */}
      <p className="border-t border-ink-100 bg-ink-50 px-5 py-4 text-[14px] text-ink-500 sm:px-6">
        Полей названо {study.fields.length}: есть {tally.yes}, заполнено не у всех{' '}
        {tally.partial}, нет {tally.no}.
      </p>
    </div>
  )
}

/** Счёт третьей части. Число приходит из кода, отсутствие числа — тоже. */
function Holdings({ holdings }: { holdings: readonly StudyHolding[] }) {
  return (
    <div className="mt-6 max-w-[75ch] overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <ul className="divide-y divide-ink-100">
        {holdings.map((h) => (
          <li key={h.what} className="p-5 sm:p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
              <p className="text-[15px] leading-snug sm:flex-1">{h.what}</p>
              {/*
                 Пустой счёт называется словами, а не прочерком. Прочерк
                 читается как ноль — то есть как утверждение «таких нет», —
                 а мы утверждаем другое: что не считали.
              */}
              <p className="shrink-0 text-[15px] font-medium">
                {h.count === null ? (
                  <span className="text-ink-400">счёт не считался</span>
                ) : (
                  `${nf(h.count, 0)} ${h.unit}`
                )}
              </p>
            </div>
            <p className="mt-2 text-[13px] text-ink-500">{h.from}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Требования к книге — седьмой частью и без вводных абзацев.
 *
 * Абзаца перед списком здесь нет намеренно. Всё, что можно было сказать
 * прозой, уже сказано в «чего не хватает»; повторить это ещё раз значило бы
 * дать требованиям смягчающую рамку — а они и заведены затем, чтобы рамки
 * не было. Список начинается сразу с первой задачи.
 */
function Demands({ study }: { study: Study }) {
  const demands: readonly StudyDemand[] = study.demands
  const tally = demandTally(study)

  return (
    <div className="mt-6 max-w-[75ch] overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <ul className="divide-y divide-ink-100">
        {demands.map((d) => (
          <li key={d.what.slice(0, 60)} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`rounded-full px-2 py-[2px] text-[12px] ${DEMAND_KIND[d.kind].className}`}
              >
                {DEMAND_KIND[d.kind].label}
              </span>
              {/*
                 Место в коде стоит рядом с родом работы, а не в конце
                 абзаца: тот, кто возьмётся, ищет глазами именно его.
                 У требования вне книги места нет, и прочерка тоже —
                 прочерк читался бы как незаполненное поле.
              */}
              {d.where && <code className="text-[13px] text-ink-400">{d.where}</code>}
            </div>

            <p className="mt-2 text-[16px] font-medium leading-relaxed">{d.what}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{d.why}</p>
          </li>
        ))}
      </ul>

      {/*
         Итог считается из самого списка (`demandTally`) и отвечает
         на первый вопрос читателя: много ли из названного зависит от нас.
      */}
      <p className="border-t border-ink-100 bg-ink-50 px-5 py-4 text-[14px] text-ink-500 sm:px-6">
        Требований названо {demands.length}: полей {tally.field}, загрузок и обменов{' '}
        {tally.intake}, расчётов {tally.calc}, вне книги {tally.outside}.
      </p>
    </div>
  )
}

/**
 * Семь частей в закреплённом порядке.
 *
 * Заголовки написаны здесь, а не в реестре: они одинаковы у всех страниц
 * раздела, и разрешить их менять значило бы разрешить менять жанр.
 *
 * Последний заголовок написан требованием — «что книга должна научиться
 * хранить», а не «чего у нас нет». Второе описывает состояние и никого
 * ни к чему не обязывает; первое называет работу и потому может быть
 * сделано или не сделано, и это видно.
 */
export function StudyBody({ study }: { study: Study }) {
  return (
    <>
      <Part title="Что утверждает работа" paragraphs={study.claim} />

      <Part title="Что нужно для проверки" paragraphs={study.needed} />
      <Fields study={study} />

      <Part title="Что у нас есть сегодня" paragraphs={study.have} />
      <Holdings holdings={study.holdings} />

      <Part title="Чего не хватает" paragraphs={study.missing} />
      <Part title="Чем наш ответ будет отличаться" paragraphs={study.difference} />
      <Part title="Чего пересчёт не докажет" paragraphs={study.limits} />

      <section className="mt-14 max-w-[75ch]">
        <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
          Что книга должна научиться хранить
        </h2>
      </section>
      <Demands study={study} />
    </>
  )
}

/** Куда идти дальше и на чём это стоит. */
export function StudyFooter({ study }: { study: Study }) {
  return (
    <>
      {study.see && study.see.length > 0 && (
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[20px] font-medium leading-tight">Читать дальше</h2>

          {/*
             Адрес статьи словаря пересчитывается, а не берётся как
             написан: у термина без развёрнутой статьи своего адреса нет,
             и ссылка на него отдала бы «страница не найдена». Правило
             и его разбор — в `lib/terms.ts`; здесь мы просто им
             пользуемся, как это делает обвязка словаря.
          */}
          <ul className="mt-4 space-y-2">
            {study.see.map((s) => {
              const slug = s.href.startsWith('/ru/slovar/')
                ? s.href.slice('/ru/slovar/'.length)
                : null
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

      <section className="mt-14 max-w-[75ch]">
        <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Источники</h2>

        <ul className="mt-5 space-y-5">
          {study.sources.map((s) => (
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
    </>
  )
}

/** Соседние работы — чтобы дочитавший не упирался в конец страницы. */
export function StudyNeighbours({ studies, current }: { studies: Study[]; current: string }) {
  const others = studies.filter((s) => s.slug !== current)
  if (others.length === 0) return null

  return (
    <section className="mt-14">
      <h2 className="text-[20px] font-medium leading-tight">Другие работы</h2>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {others.map((s) => (
          <Link
            key={s.slug}
            href={`/ru/issledovaniya/${s.slug}`}
            className="rounded-xl border border-ink-100 bg-white px-4 py-3 transition-colors hover:border-forest-500"
          >
            <span className="text-[15px] font-medium">{s.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
