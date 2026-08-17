'use client'

import { useEffect, useState } from 'react'

export type NavSub = { id: string; title: string }
export type NavChapter = { id: string; title: string; subs: NavSub[] }
export type NavPart = { id: string; title: string; chapters: NavChapter[] }

/**
 * Оглавление документации слева.
 *
 * Раскрывается только текущая глава. Первый вариант показывал все 78 пунктов
 * сразу: оглавление получалось выше экрана в два с половиной раза, у него
 * появлялась своя прокрутка, и найти в нём себя было не легче, чем
 * в самом тексте. Теперь постоянно видны части и главы — 23 строки,
 * которые помещаются на экран, — а подразделы показываются у той главы,
 * которую читают. Список перестаёт быть простынёй, не теряя полноты.
 *
 * Почему подсветка считается наблюдателем, а не хешем в адресе. Хеш меняется
 * только при клике; человек, читающий документ прокруткой, весь час видел бы
 * подсвеченным первый пункт. Документ длинный, и «где я сейчас» — не
 * украшение, а единственный способ не потеряться.
 */
export function DocsNav({ parts }: { parts: NavPart[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    /*
       Наблюдаются заголовки, а не блоки разделов.

       Сначала наблюдались сами блоки — те, на которые ведут якоря. Но блок
       части содержит блоки глав, а блок главы — блоки подразделов, и предок
       пересекает экран всегда, когда пересекает потомок. «Первый видимый
       по порядку документа» в такой разметке — это всегда заголовок части,
       и оглавление показывало начало части, где бы ты ни читал.

       У заголовков вложенности нет: они соседи. Заголовок проходит через
       полосу наблюдения — подсветка переезжает на него; между заголовками
       ничего не пересекается, и подсветка остаётся на последнем — то есть
       на разделе, который читают. Это то поведение, которое и нужно.
    */
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-doc-heading]'),
    ).filter((el) => el.dataset.docHeading)

    if (targets.length === 0) return

    /*
       Текущий раздел — последний заголовок, ушедший выше верхней трети
       экрана. Считается по положению, а не по набору пересекающихся:
       набор пуст, когда между заголовками длинный текст, и в самом низу
       документа, где последние заголовки уже прокручены за полосу
       и ниже прокручивать некуда. Первая версия в этом случае оставляла
       подсветку на разделе, мимо которого проехали десять экранов назад.
    */
    const compute = () => {
      const band = window.innerHeight * 0.3
      let current = targets[0]?.dataset.docHeading ?? null
      for (const el of targets) {
        if (el.getBoundingClientRect().top > band) break
        current = el.dataset.docHeading as string
      }
      if (current) setActive(current)
    }

    // Наблюдатель нужен как дешёвый повод пересчитать: он срабатывает
    // на каждом пересечении полосы, в том числе при прыжке по якорю,
    // и не заставляет слушать каждое событие прокрутки
    const observer = new IntersectionObserver(compute, {
      rootMargin: '0px 0px -70% 0px',
      threshold: 0,
    })

    targets.forEach((el) => observer.observe(el))
    compute()

    return () => observer.disconnect()
  }, [parts])

  // Какую главу раскрыть. Прямое совпадение работает для главы и её
  // подразделов, но подсвеченным может оказаться и заголовок части — она
  // ничьей главой не является. Первая версия в этом случае откатывалась
  // к самой первой главе документа, и на середине текста оглавление
  // раскрывало «1. О системе». Заголовок части означает начало части,
  // поэтому раскрываем её первую главу
  const chapters = parts.flatMap((p) => p.chapters)
  const openChapter =
    chapters.find((c) => c.id === active || c.subs.some((s) => s.id === active))?.id ??
    parts.find((p) => p.id === active)?.chapters[0]?.id ??
    parts[0]?.chapters[0]?.id ??
    null

  return (
    <nav aria-label="Оглавление документации" className="text-[14px] leading-snug">
      <p className="mb-4 text-[12px] font-bold uppercase tracking-wide text-ink-500">Содержание</p>

      {parts.map((part) => (
        <div key={part.id} className="mb-5">
          <a
            href={`#${part.id}`}
            className={`block py-1 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
              active === part.id ? 'text-forest-600' : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            {part.title}
          </a>

          <ul className="mt-1">
            {part.chapters.map((chapter) => {
              // Раскрытая глава и есть читаемая: отдельного состояния
              // «раскрыта, но читают другое» не бывает — раскрытие
              // и подсветка идут от одного наблюдателя
              const open = chapter.id === openChapter

              return (
                <li key={chapter.id}>
                  <a
                    href={`#${chapter.id}`}
                    aria-current={open ? 'true' : undefined}
                    className={`block rounded-md px-2.5 py-1.5 transition-colors ${
                      open
                        ? 'bg-brand-50 font-medium text-forest-600'
                        : 'text-ink-700 hover:bg-[#eaeaea] hover:text-ink-900'
                    }`}
                  >
                    {chapter.title}
                  </a>

                  {open && chapter.subs.length > 0 && (
                    /*
                       Подразделы отбиты полосой, а не отступом: одного отступа
                       мало, чтобы отличить их от глав следующей части, когда
                       раскрытая глава последняя в списке.
                    */
                    <ul className="my-1 ml-2.5 border-l border-ink-100 pl-2">
                      {chapter.subs.map((sub) => {
                        const subActive = sub.id === active
                        return (
                          <li key={sub.id}>
                            <a
                              href={`#${sub.id}`}
                              aria-current={subActive ? 'true' : undefined}
                              className={`block rounded-md px-2 py-1 text-[13px] transition-colors ${
                                subActive
                                  ? 'bg-brand-50 font-medium text-forest-600'
                                  : 'text-ink-500 hover:bg-[#eaeaea] hover:text-ink-900'
                              }`}
                            >
                              {sub.title}
                            </a>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
