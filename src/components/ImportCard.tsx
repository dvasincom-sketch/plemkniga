'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { importDataAction, type ImportState } from '@/actions/data'
import { Select } from '@/components/Select'
import { FileUploadIcon } from '@/components/CardIcons'
import { XLSX_MAX_ROWS } from '@/lib/table-limits'

/**
 * Загрузка файлом — одна карточка на четыре набора данных.
 *
 * ## Что изменилось
 *
 * Раньше карточка принимала только животных, а подписана была «добавление
 * животных и отправка событий» — событий она не принимала никогда.
 * Теперь наборов четыре: животные, отёлы, осеменения и контрольные дойки.
 *
 * Вид данных выбирается **до** файла, а не угадывается по его содержимому.
 * Угадывание здесь было бы вредным: файл отёлов и файл доек различаются
 * одной колонкой, и ошибка угадывания означала бы тысячу записей не в той
 * таблице — а вытащить их обратно нечем.
 *
 * ## Шаблон здесь, и только здесь
 *
 * Ссылка на шаблон меняется вместе с выбранным набором. Держать её ещё
 * и отдельной карточкой наверху страницы значило бы дважды предлагать одно
 * действие, причём наверху — без выбора набора, то есть всегда для животных.
 */


type Choice = { value: string; label: string }

/**
 * Что прочитали из книги — и, главное, чего не прочитали.
 *
 * Показывается только тогда, когда есть о чём сказать: у книги с одним
 * листом, уместившейся в потолок, эта строка сообщала бы «всё хорошо»,
 * а такие строки читать перестают, и вместе с ними перестают читать те,
 * в которых сказано важное.
 *
 * Стоит первым среди замечаний, потому что это самая крупная из потерь:
 * непрочитанный лист — это не строка и не колонка, это целая таблица,
 * которой в стаде не окажется.
 */
function SheetNote({ sheet }: { sheet?: ImportState['sheet'] }) {
  if (!sheet) return null
  if (!sheet.others.length && !sheet.truncated) return null

  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-ink-700">
      <p className="font-medium">Прочитан лист «{sheet.name}»</p>
      {!!sheet.others.length && (
        <p className="mt-1 leading-snug">
          Остальные листы не читались: {sheet.others.map((s) => `«${s}»`).join(', ')}. Чтобы
          загрузить их, сохраните каждый отдельным файлом.
        </p>
      )}
      {sheet.truncated && (
        <p className="mt-1 leading-snug">
          В листе больше {XLSX_MAX_ROWS.toLocaleString('ru-RU')} строк — прочитаны первые{' '}
          {XLSX_MAX_ROWS.toLocaleString('ru-RU')}, остальные не загружены. Разделите файл.
        </p>
      )}
    </div>
  )
}

/**
 * Кодировка, если она оказалась не UTF-8.
 *
 * Говорится потому, что распознавание может ошибиться, и тогда рядом
 * с вопросительными знаками в кличках будет стоять объяснение, откуда
 * они взялись. Без него человек ищет причину в своих данных — и не
 * находит, потому что в его данных всё в порядке.
 */
function EncodingNote({ encoding }: { encoding?: ImportState['encoding'] }) {
  if (!encoding) return null

  const name = encoding === 'utf-16' ? 'UTF-16' : 'windows-1251'

  return (
    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
      <p className="leading-snug">
        Файл прочитан в кодировке {name}. Если в кличках и названиях появились вопросительные
        знаки или незнакомые буквы, сохраните файл в UTF-8 и загрузите заново.
      </p>
    </div>
  )
}

export function ImportCard({ datasets }: { datasets: (Choice & { hint: string })[] }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importDataAction, {})
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [kind, setKind] = useState(datasets[0]?.value ?? 'animals')

  const current = datasets.find((d) => d.value === kind)

  return (
    <div className="card flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[21px] font-medium">Импорт данных</h3>
        <p className="mt-1.5 text-[13px] text-ink-500">
          Массовая загрузка из файла: животные, отёлы, осеменения, дойки
        </p>

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
              {/*
                 Вид данных первым: от него зависит и набор колонок,
                 и шаблон, и то, куда лягут строки. Выбирать его после
                 файла значит выбирать вслепую.
              */}
              {/*
                 `div`, а не `label`, и это не вкусовщина. `Select` у нас
                 свой: триггер — кнопка, варианты — кнопки рядом. Клик
                 по варианту внутри метки браузер переадресует на её элемент
                 управления, то есть на тот же триггер, и он открывает список
                 обратно сразу после того, как выбор его закрыл. Со стороны
                 это выглядит как «список не закрывается».
              */}
              <div className="block text-[14px]">
                <span className="mb-1.5 block text-ink-700">Что загружаем</span>
                <input type="hidden" name="kind" value={kind} />
                <Select
                  name="kindPicker"
                  options={datasets.map((d) => ({ value: d.value, label: d.label }))}
                  defaultValue={kind}
                  placeholder=""
                  onLight
                  onChange={setKind}
                  ariaLabel="Что загружаем"
                />
              </div>

              {current && <p className="text-[13px] leading-snug text-ink-500">{current.hint}</p>}

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-ink-300 px-4 py-3 text-sm text-ink-700 hover:border-brand-400">
                {/*
                   Расширения и типы перечислены вместе и оба неполно —
                   это не дублирование, а признание того, что ни одному
                   из двух списков верить нельзя. Тип браузер выводит
                   из расширения по таблице системы, и на книге, названной
                   `.xls`, регулярно отдаёт `application/octet-stream`.
                   Список здесь — подсказка окну выбора файла, а не заслон:
                   настоящий вид файла определяется на сервере по первым
                   байтам, потому что имя ставит человек.
                */}
                <input
                  type="file"
                  name="file"
                  accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
                />
                <span className="truncate">{fileName || 'Выберите файл Excel, CSV или TXT…'}</span>
              </label>

              {/*
                 Раньше здесь перечислялись восемь колонок из двадцати с лишним,
                 и перечень отставал от разбора: «Возраст» и «Состояние» система
                 принимала, а подсказка о них молчала. Список переехал в таблицу
                 на странице и собирается из того же реестра, что и разбор.
              */}
              {/*
                 Потолок строк назван здесь, до нажатия, а не в ответе
                 после него. Книга на семьдесят тысяч строк выглядит
                 принятой ровно так же, как книга на пять тысяч, и разницу
                 видно только тому, кто пойдёт пересчитывать карточки.
              */}
              <p className="text-xs leading-relaxed text-ink-500">
                Книга Excel (.xlsx или .xls) — читается первый лист, до{' '}
                {XLSX_MAX_ROWS.toLocaleString('ru-RU')} строк. Либо таблица CSV или TXT:
                разделитель «точка с запятой», запятая или табуляция. Кодировку определяем сами —
                и UTF-8, и windows-1251. До 8 МБ.
              </p>

              {/*
                 Две ссылки на один шаблон, а не выпадающий список из двух
                 пунктов: выбор здесь делается один раз и ни на что дальше
                 не влияет, а список потребовал бы нажать дважды ради того,
                 что решается наведением глаза.

                 XLSX стоит первым, потому что шаблон открывают в Excel,
                 а Excel, открывая CSV, портит колонку номера: `0987654321`
                 он читает числом и теряет ведущий ноль ещё до того, как
                 человек начнёт заполнять.
              */}
              <p className="text-xs leading-relaxed text-ink-500">
                Скачать шаблон:{' '}
                <a
                  href={`/account/import/template?kind=${kind}&format=xlsx`}
                  download
                  className="underline underline-offset-4"
                >
                  XLSX
                </a>{' '}
                или{' '}
                <a
                  href={`/account/import/template?kind=${kind}`}
                  download
                  className="underline underline-offset-4"
                >
                  CSV
                </a>{' '}
                — в нём правильные заголовки и строка с примером; её перед загрузкой удалите.
                Полный список колонок — в таблице ниже.
              </p>

              {/*
                 Отметка снята по умолчанию, и это главное в ней.

                 Запись со знаком Ассоциации файлом молча не переписывается:
                 подпись под данными, которых Ассоциация не видела,
                 обесценивает не одну карточку, а сам знак. Но и запретить
                 правку нельзя — данные принадлежат хозяйству. Поэтому
                 выбор, и делается он до загрузки, а не постфактум.

                 Проверяется только при `animals`: файл событий карточек
                 не трогает, и отметка там означала бы обещание, которому
                 нечего исполнять.
              */}
              {kind === 'animals' && (
                <label className="flex items-start gap-2 text-[13px] leading-snug text-ink-700">
                  <input
                    type="checkbox"
                    name="updateVerified"
                    value="1"
                    className="mt-0.5"
                  />
                  <span>
                    Обновлять записи со знаком «Верифицировано ассоциацией».
                    <span className="mt-0.5 block text-ink-500">
                      У изменённых записей знак снимется — подтверждать их придётся заново.
                      Без отметки такие строки не принимаются, и вы увидите, какие именно.
                    </span>
                  </span>
                </label>
              )}

              <button type="submit" className="btn btn-forest" disabled={pending}>
                {pending ? 'Загружаем…' : 'Импортировать'}
              </button>

              {state.error && (
                <div className="text-sm text-red-700">
                  <p>{state.error}</p>
                  {!!state.unknownColumns?.length && (
                    <p className="mt-1 leading-snug text-ink-700">
                      В файле распознаны не все заголовки:{' '}
                      {state.unknownColumns.map((c) => `«${c}»`).join(', ')}
                    </p>
                  )}
                  {/*
                     Имя листа нужнее всего именно при отказе. «Не найдены
                     обязательные колонки» у книги с тремя листами почти
                     всегда означает не отсутствие колонок, а то, что
                     заголовки лежат на втором листе, — и без этой строки
                     человек идёт править заголовки, которые в порядке.
                  */}
                  <SheetNote sheet={state.sheet} />
                  <EncodingNote encoding={state.encoding} />
                </div>
              )}

              {state.ok && (
                <div className="text-sm text-forest-600">
                  <p>
                    {state.dataset ? `${state.dataset}: ` : ''}создано {state.created}
                    {state.updated ? `, обновлено ${state.updated}` : ''}, пропущено {state.skipped}
                  </p>

                  <SheetNote sheet={state.sheet} />
                  <EncodingNote encoding={state.encoding} />

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
                     Неизвестные колонки — не придирка, а потеря данных.
                     Файл принят, строки записаны, но содержимое этих колонок
                     не попало никуда.
                  */}
                  {!!state.unknownColumns?.length && (
                    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">Колонки не распознаны и не записаны:</p>
                      <p className="mt-1 leading-snug">
                        {state.unknownColumns.map((c) => `«${c}»`).join(', ')}
                      </p>
                      <p className="mt-1 text-ink-500">Сверьте заголовки с таблицей ниже.</p>
                    </div>
                  )}

                  {/*
                     Совпадение цифр — единственный блок здесь, который
                     ничего не требует. Он стоит после отказов и потерь
                     намеренно: сначала то, что не записалось, потом
                     то, что записалось и вызывает вопрос. Обратный
                     порядок читался бы как «загрузка не удалась».
                  */}
                  {!!state.identMatches?.length && (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">Записи с одинаковыми цифрами в номерах:</p>
                      <ul className="mt-1 space-y-1">
                        {state.identMatches.slice(0, 3).map((m) => (
                          <li key={m.core} className="leading-snug">
                            {m.row ? `строка ${m.row} — ` : ''}
                            {m.text}
                          </li>
                        ))}
                      </ul>
                      {state.identMatches.length > 3 && (
                        <p className="mt-1 text-ink-500">
                          и ещё {state.identMatches.length - 3}
                        </p>
                      )}
                      <p className="mt-1 text-ink-500">
                        Строки приняты. Автоматически такие записи не объединяются: цифры
                        совпадают и у одного животного под разными номерами, и у двух разных.
                      </p>
                    </div>
                  )}

                  {/*
                     Снятие знака — событие поимённое. «Обновлено 40»
                     ничего не говорит о том, что у двух из сорока пропало
                     подтверждение, добытое неделей ожидания.
                  */}
                  {!!state.unverified?.length && (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">
                        Снят знак «Верифицировано ассоциацией»: {state.unverified.length}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {state.unverified.slice(0, 5).map((u) => (
                          <li key={u.ident} className="leading-snug">
                            № {u.ident} — файл изменил {u.fields.join(', ')}
                          </li>
                        ))}
                      </ul>
                      {state.unverified.length > 5 && (
                        <p className="mt-1 text-ink-500">
                          и ещё {state.unverified.length - 5}
                        </p>
                      )}
                      <p className="mt-1 text-ink-500">
                        Данные записаны, уровень достоверности стал «Черновик». Подтвердить
                        заново — заявкой на верификацию.
                      </p>
                    </div>
                  )}

                  {!!state.unresolved?.length && (
                    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">Не нашлись в справочниках:</p>
                      <p className="mt-1 leading-snug">{state.unresolved.join(', ')}</p>
                      <p className="mt-1 text-ink-500">
                        Строки записаны, эти значения пропущены.
                      </p>
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

      <FileUploadIcon />
    </div>
  )
}
