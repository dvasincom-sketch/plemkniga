'use client'

import { useId, useRef, useState } from 'react'

/**
 * Справочник колонок загрузки — четыре набора вкладками.
 *
 * ## Что было не так
 *
 * Наборы шли подряд, один под другим, каждый со своим заголовком третьего
 * уровня. На экране это читалось иначе, чем задумано: сверху крупно
 * «Животные», а под ним — таблицы, подзаголовки и ещё таблицы. Всё, что
 * ниже, выглядело продолжением животных, хотя отёлы, осеменения и дойки
 * им не подчинены: это четыре равноправных формата файла. Человек,
 * доскроллив до таблицы отёлов, имел все основания думать, что читает
 * колонки животных, — и заполнить файл не тот.
 *
 * Вкладки убирают ложную иерархию: четыре набора стоят рядом, видно, что
 * их четыре, и видно, какой открыт.
 *
 * ## Почему состояние здесь, а не в адресе страницы
 *
 * Соседний путь напрашивался: `?columns=calvings`, как сделаны вкладки
 * карточки животного. Здесь он навредил бы. На этой же странице стоит
 * карточка загрузки, и после отправки файла в ней лежит результат —
 * сколько принято, что не принято и почему. Переход по адресу перерисовал
 * бы страницу и стёр этот результат ровно в тот момент, когда человек
 * спустился ниже посмотреть, как правильно назвать колонку. Список
 * колонок — справка; справка не имеет права уносить с экрана работу.
 *
 * Цена — данные четырёх наборов уезжают в браузер. Это несколько
 * килобайт разметки, взятых из того же реестра, что и разбор файла,
 * и они бы всё равно уехали: до вкладок на странице печатались все
 * четыре набора сразу.
 *
 * ## Про роли доступности
 *
 * `role="tablist"` обещает читающей программе стрелочную навигацию —
 * поэтому она здесь и сделана, а не только объявлена. Роль без поведения
 * хуже отсутствия роли: незрячий пользователь получает обещание, которое
 * не выполняется.
 */

type Column = {
  key: string
  title: string
  aliases: string[]
  required?: boolean
  what: string
  example: string
  note?: string
}

type Group = { key: string; label: string; intro: string; columns: Column[] }

export type ReferenceDataset = {
  key: string
  label: string
  hint: string
  groups: Group[]
}

export function ColumnReference({ datasets }: { datasets: ReferenceDataset[] }) {
  const [active, setActive] = useState(datasets[0]?.key ?? '')
  const baseId = useId()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const current = datasets.find((d) => d.key === active) ?? datasets[0]
  if (!current) return null

  const onKey = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + datasets.length) % datasets.length
    setActive(datasets[next]!.key)
    tabs.current[next]?.focus()
  }

  return (
    <>
      <nav
        role="tablist"
        aria-label="Наборы данных для загрузки"
        className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {datasets.map((d, i) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            id={`${baseId}-tab-${d.key}`}
            aria-selected={d.key === current.key}
            aria-controls={`${baseId}-panel-${d.key}`}
            /*
             * Из последовательности обхода убраны все вкладки, кроме
             * открытой: внутри стрелочная навигация, снаружи Tab уводит
             * сразу в содержимое. Иначе до таблицы пришлось бы нажимать
             * Tab четыре лишних раза.
             */
            tabIndex={d.key === current.key ? 0 : -1}
            ref={(el) => {
              tabs.current[i] = el
            }}
            onClick={() => setActive(d.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`tab ${d.key === current.key ? 'tab-active' : ''}`}
          >
            {d.label}
          </button>
        ))}
      </nav>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${current.key}`}
        aria-labelledby={`${baseId}-tab-${current.key}`}
        tabIndex={0}
        className="pt-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="max-w-[80ch] text-[14px] leading-relaxed text-ink-500">{current.hint}</p>
          <a
            href={`/account/import/template?kind=${current.key}`}
            download
            className="whitespace-nowrap text-[14px] underline underline-offset-4"
          >
            Скачать шаблон
          </a>
        </div>

        <div className="mt-6 space-y-10">
          {current.groups.map((group) => (
            <div key={group.key} className="pt-1">
              {current.groups.length > 1 && (
                <h3 className="text-[18px] font-medium">{group.label}</h3>
              )}
              <p
                className={`max-w-[80ch] text-[14px] leading-relaxed text-ink-500 ${
                  current.groups.length > 1 ? 'mt-1 mb-4' : 'mb-4'
                }`}
              >
                {group.intro}
              </p>

              <div className="card overflow-x-auto">
                <table className="metric-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="w-[180px]">Заголовок</th>
                      <th>Что записывается</th>
                      <th className="w-[150px]">Пример</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.columns.map((c) => (
                      <tr key={c.key}>
                        <td className="align-top">
                          <code className="text-[13px]">{c.title}</code>
                          {c.required && (
                            <span className="ml-2 rounded bg-[#fdecea] px-1.5 py-0.5 text-[11px] text-[#8c2f27]">
                              обязательна
                            </span>
                          )}
                          {c.aliases.length > 0 && (
                            <span className="mt-1 block text-[12px] leading-snug text-ink-500">
                              также: {c.aliases.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="align-top">
                          <span className="text-[14px] leading-relaxed">{c.what}</span>
                          {c.note && (
                            <span className="mt-1 block text-[13px] leading-relaxed text-ink-500">
                              {c.note}
                            </span>
                          )}
                        </td>
                        <td className="align-top">
                          {c.example ? (
                            <code className="text-[13px]">{c.example}</code>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
