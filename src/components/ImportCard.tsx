'use client'

import Link from 'next/link'

import { useActionState, useState } from 'react'
import { importAnimalsAction, type ImportState } from '@/actions/data'

const DocIcon = () => (
  <svg width="92" height="80" viewBox="0 0 92 80" fill="none" aria-hidden="true">
    <rect x="8" y="6" width="52" height="66" rx="5" fill="#d6d6d6" />
    <rect x="16" y="12" width="52" height="66" rx="5" fill="#efefef" stroke="#d0d0d0" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x="24" y={24 + i * 8} width={i % 2 ? 28 : 36} height="4" rx="2" fill="#c9c9c9" />
    ))}
    <path d="M74 34v26m0 0-9-9m9 9 9-9" stroke="#9a9a9a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function ImportCard() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importAnimalsAction,
    {},
  )
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')

  return (
    <div className="card flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[21px] font-medium">Импорт данных</h3>
        <p className="mt-1.5 text-[13px] text-ink-500">Добавление животных и отправка событий</p>

        <form action={formAction} className="mt-5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn btn-brand"
            aria-expanded={open}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M3.5 15.5h13"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Загрузить данные
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline
                points="6 9 12 15 18 9"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {open && (
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-ink-300 px-4 py-3 text-sm text-ink-700 hover:border-brand-400">
                <input
                  type="file"
                  name="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
                />
                <span className="truncate">{fileName || 'Выберите CSV-файл…'}</span>
              </label>

              <p className="text-xs leading-relaxed text-ink-500">
                Ожидаемые колонки: <code>Инд.№</code>, <code>Кличка</code>, <code>Пол</code>,{' '}
                <code>Дата рождения</code>, <code>Удой, л</code>, <code>Жир, %</code>,{' '}
                <code>Белок, %</code>, <code>ИПЦ</code>. Разделитель — точка с запятой.
              </p>

              <button type="submit" className="btn btn-forest" disabled={pending}>
                {pending ? 'Загружаем…' : 'Импортировать'}
              </button>

              {state.error && <p className="text-sm text-red-700">{state.error}</p>}
              {state.ok && (
                <div className="text-sm text-forest-600">
                  <p>
                    Готово: создано {state.created}, обновлено {state.updated}, пропущено{' '}
                    {state.skipped}
                  </p>

                  {/*
                     Причины отказа — прямо здесь, а не только в пакете.
                     Человек ещё не ушёл со страницы и держит файл открытым:
                     это единственный момент, когда опечатку исправить дёшево.
                  */}
                  {!!state.issues?.length && (
                    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">Не приняты строки:</p>
                      <ul className="mt-1 space-y-0.5">
                        {state.issues.slice(0, 3).map((it) => (
                          <li key={it.row} className="leading-snug">
                            строка {it.row}
                            {it.ident ? ` (${it.ident})` : ''} — {it.reason}
                          </li>
                        ))}
                      </ul>
                      {state.issues.length > 3 && (
                        <p className="mt-1 text-ink-500">
                          и ещё {state.issues.length - 3}
                          {state.submissionId && (
                            <>
                              {' — '}
                              <Link
                                href={`/account/submissions/${state.submissionId}`}
                                className="underline underline-offset-4"
                              >
                                весь список в пакете
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {/*
                     Ссылка на пакет — не украшение: загруженные записи остаются
                     черновиком, пока Ассоциация не проверит пакет, и человек
                     должен понимать, что дело не кончилось загрузкой файла.
                  */}
                  {state.submissionId && (
                    <p className="mt-1 text-ink-700">
                      Заведён пакет{' '}
                      <Link
                        href={`/account/submissions/${state.submissionId}`}
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        № {state.submissionNumber}
                      </Link>{' '}
                      — записи получат уровень «Верифицировано ассоциацией» после проверки
                      и вашего согласия.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      <DocIcon />
    </div>
  )
}
