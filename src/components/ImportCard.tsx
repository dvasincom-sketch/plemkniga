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
    <div className="card flex h-fit items-start justify-between gap-4">
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
            <div className="mt-4 space-y-4">
              {/*
                 Порядок переставлен: сперва действие, потом справка.
                 Раньше было наоборот — четыре абзаца пояснений, выбор
                 образца и длинная врезка про ФГИАС, а поле выбора файла
                 и кнопка терялись среди них. Человек, пришедший загрузить
                 файл, читал стену текста, ни одна строка которой
                 не требовалась ему прямо сейчас.

                 Справка никуда не делась — она под «Подробностями»,
                 в двух шагах от того, кто её ищет, и в нуле шагов
                 от того, кто пришёл по делу.
              */}
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
                 Одна строка вместо абзаца. Всё, что человеку надо знать
                 до нажатия: файл он не подписывает, система разберётся
                 сама и скажет, что разобрала.
              */}
              <p className="text-[13px] leading-snug text-ink-500">
                Excel, CSV или TXT до 8 МБ. Что в файле — животные, отёлы, осеменения или
                дойки — система определит по заголовкам и скажет, что определила.{' '}
                <span className="text-ink-700">Файл ФГИАС ПР грузится как есть.</span>
              </p>

              {/*
                 Выбор набора возвращается ровно тогда, когда система
                 честно не смогла определить его сама. В остальное время
                 его нет, и это главное изменение: ошибались в нём чаще,
                 чем в самом файле.
              */}
              {state.needsKind && (
                <div className="rounded-lg border border-rust-200 bg-rust-50 p-3 text-[14px]">
                  <span className="mb-1.5 block text-ink-700">
                    Не удалось определить, что в файле, — выберите сами
                  </span>
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
                  {current && (
                    <p className="mt-1.5 text-[13px] leading-snug text-ink-500">{current.hint}</p>
                  )}
                </div>
              )}

              {/*
                 Отметка снята по умолчанию, и это главное в ней.

                 Запись со знаком Ассоциации файлом молча не переписывается:
                 подпись под данными, которых Ассоциация не видела,
                 обесценивает не одну карточку, а сам знак. Но и запретить
                 правку нельзя — данные принадлежат хозяйству. Поэтому
                 выбор, и делается он до загрузки, а не постфактум.

                 Остаётся на виду, а не под «Подробностями»: это решение,
                 а не справка. Спрятать его значило бы принять за человека
                 то, чего он не выбирал.

                 Показывается всегда — вид данных до загрузки неизвестен,
                 а файл событий эту отметку просто не читает.
              */}
              <label className="flex items-start gap-2 text-[13px] leading-snug text-ink-700">
                <input type="checkbox" name="updateVerified" value="1" className="checkbox mt-0.5" />
                <span>
                  Обновлять записи со знаком «Верифицировано ассоциацией»
                  <span className="mt-0.5 block text-ink-500">
                    знак снимется, подтверждать придётся заново. Без отметки такие строки
                    не принимаются, и вы увидите какие
                  </span>
                </span>
              </label>

              <button type="submit" className="btn btn-forest" disabled={pending}>
                {pending ? 'Загружаем…' : 'Импортировать'}
              </button>

              {/*
                 Справка — под `details`, и это родной элемент браузера,
                 а не наш аккордеон. Он работает без JavaScript, читается
                 экранным диктором как раскрывающийся блок и не требует
                 состояния: карточка и так живёт внутри формы, где каждое
                 лишнее состояние — лишний повод перерисовать её не вовремя.

                 Внутри всё, что нужно один раз или не нужно вовсе:
                 образец для заполнения, подробности про форматы
                 и объяснение, как книга читает файлы реестра.
              */}
              <details className="group border-t border-ink-200 pt-3">
                <summary className="cursor-pointer list-none text-[13px] text-ink-500 hover:text-ink-700">
                  <span className="underline underline-offset-4">Подробности и образец</span>
                </summary>

                <div className="mt-3 space-y-4">
                  {/*
                     У скачивания образца выбор на месте: образцов четыре,
                     и какой нужен — знает только человек. Это обратный
                     случай тому, что убрано из загрузки: там ответ был
                     в файле, здесь файла ещё нет.
                  */}
                  <div className="text-[14px]">
                    <span className="mb-1.5 block text-ink-700">Образец для заполнения</span>
                    <Select
                      name="templateKind"
                      options={datasets.map((d) => ({ value: d.value, label: d.label }))}
                      defaultValue={kind}
                      placeholder=""
                      onLight
                      onChange={setKind}
                      ariaLabel="Для какого набора нужен образец"
                    />
                    {/*
                       Две ссылки на один шаблон, а не список из двух пунктов:
                       выбор делается один раз и ни на что дальше не влияет.

                       XLSX первым, потому что шаблон открывают в Excel,
                       а Excel, открывая CSV, портит колонку номера:
                       `0987654321` он читает числом и теряет ведущий ноль
                       ещё до того, как человек начнёт заполнять.
                    */}
                    <p className="mt-2 text-xs leading-relaxed text-ink-500">
                      Скачать:{' '}
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
                      — правильные заголовки и строка с примером, её перед загрузкой удалите.
                      Полный список колонок — в таблице ниже.
                    </p>
                  </div>

                  {/*
                     Потолок строк назван здесь, а не в ответе после
                     загрузки: книга на семьдесят тысяч строк выглядит
                     принятой ровно так же, как книга на пять тысяч,
                     и разницу видно только тому, кто пойдёт пересчитывать
                     карточки.
                  */}
                  <p className="text-xs leading-relaxed text-ink-500">
                    Книга Excel — читается первый лист, до{' '}
                    {XLSX_MAX_ROWS.toLocaleString('ru-RU')} строк. Таблица CSV или TXT:
                    разделитель «точка с запятой», запятая или табуляция. Кодировку определяем
                    сами — и UTF-8, и windows-1251.
                  </p>

                  {/*
                     Про файлы ФГИАС сказано до загрузки, а не после.
                     Они принимаются уже сегодня, но узнать об этом было
                     неоткуда: человек видел список наборов, где реестр
                     не упомянут, и делал вывод, что надо перекладывать
                     в наш формат, — то есть делал работу дважды
                     из-за отсутствия одной фразы.
                  */}
                  <p className="text-xs leading-relaxed text-ink-500">
                    <span className="text-ink-700">Файлы ФГИАС ПР.</span> Книга узнаёт «Основные
                    сведения» и берёт оттуда то, что ведёт: номера, кличку, дату рождения,
                    породу, линию, масть, назначение, кровность. Остальные колонки реестра она
                    не хранит и назовёт их в отчёте. Так же грузится обратный файл реестра —
                    базовые номера разложатся по карточкам.
                  </p>
                </div>
              </details>

              {state.error && (
                <div className="text-sm text-red-700">
                  <p>{state.error}</p>
                  {/*
                     Опознанный шаблон называется раньше списка
                     нераспознанных заголовков. Иначе отчёт по файлу
                     реестра читается как разгром: тридцать три чужих
                     колонки, и не понять, беда это или норма.
                  */}
                  {state.fgiasTemplate && (
                    <p className="mt-1 leading-snug text-ink-700">
                      Это шаблон ФГИАС ПР «{state.fgiasTemplate}». Часть его колонок книга
                      не ведёт — они перечислены ниже, и это ожидаемо.
                    </p>
                  )}
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

                  {/*
                     Чем грузили — сказано вслух, потому что человек этого
                     больше не выбирает. Если система поняла файл иначе,
                     чем он, узнать об этом надо здесь, а не через месяц
                     по недостающим карточкам.
                  */}
                  {state.detected && (
                    <p className="mt-1 leading-snug">
                      Вид данных определён по заголовкам: «{state.detected}».
                    </p>
                  )}

                  {/*
                     Опознанный шаблон реестра называется и при удачной
                     загрузке, а не только при отказе. Это подтверждение,
                     которого человек ждёт: он положил чужой файл и хочет
                     знать, что книга поняла, чем он является, — а не
                     догадываться по числу принятых строк.
                  */}
                  {state.fgiasTemplate && (
                    <p className="mt-1 leading-snug">
                      Файл опознан как шаблон ФГИАС ПР «{state.fgiasTemplate}»: колонки взяты
                      по заголовкам реестра.
                    </p>
                  )}

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
                     Служебные строки — сообщение, а не жалоба.

                     «Итого» и подпись зоотехника не ошибка: так устроен
                     любой отчёт, выгруженный для печати. Раньше такая
                     строка заводила карточку животного — номер у неё
                     непустой, а номер единственная обязательная колонка, —
                     и хозяйство получало двух лишних коров с каждого
                     файла, не узнав об этом.

                     Сказано отдельно от «не приняты» намеренно: там беда,
                     которую надо чинить, здесь — то, что система поняла
                     правильно и сделала за человека.
                  */}
                  {!!state.serviceRows?.length && (
                    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">
                        Пропущены строки отчёта: {state.serviceRows.length}
                      </p>
                      <p className="mt-1 leading-snug text-ink-500">
                        Строки {state.serviceRows.slice(0, 8).join(', ')}
                        {state.serviceRows.length > 8 ? ' и другие' : ''} — «Итого», «Всего
                        по ферме», подпись. Это не ошибка: в них подведён итог, а не описано
                        животное. Прежде такая строка заводила карточку.
                      </p>
                    </div>
                  )}

                  {/*
                     Ячейки, которые не разобрались, — отдельным блоком
                     от непринятых строк, и это не оформление.

                     Там строка не попала в книгу целиком, и человек ищет
                     её в файле. Здесь строка попала, а пустой осталась одна
                     колонка — искать надо не строку, а написание значения,
                     и почти всегда одно и то же во всём столбце. Свалить
                     их в один список значило бы отправить человека
                     не туда: «пропущено 0» и при этом двести потерянных
                     ячеек — сочетание, которого он не ждёт.

                     Названы колонка и само написание, а не только номер
                     строки: «„3,85 %“ в колонке „Жир, %“» человек чинит
                     заменой по всему столбцу за минуту, а «строка 148»
                     заставляет открывать файл и искать.
                  */}
                  {!!state.valueIssues?.length && (
                    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">
                        Значения, которые не разобрались: {state.valueProblems ?? state.valueIssues.length}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {state.valueIssues.slice(0, 5).map((v, i) => (
                          <li key={`${v.row}-${v.columnTitle}-${i}`} className="leading-snug">
                            строка {v.row}
                            {v.ident ? ` (${v.ident})` : ''}, «{v.columnTitle}» — {v.reason}
                          </li>
                        ))}
                      </ul>
                      {(state.valueProblems ?? state.valueIssues.length) > 5 && (
                        <p className="mt-1 text-ink-500">
                          и ещё {(state.valueProblems ?? state.valueIssues.length) - 5}
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
                      <p className="mt-1 text-ink-500">
                        Сами строки приняты — пустыми остались только эти поля. Исправьте
                        написание в файле и загрузите его ещё раз: повторная загрузка обновит
                        те же записи, а не заведёт вторые.
                      </p>
                    </div>
                  )}

                  {/*
                     Неизвестные колонки — не придирка, а потеря данных.
                     Файл принят, строки записаны, но содержимое этих колонок
                     не попало никуда.
                  */}
                  {/*
                     Формулировка изменилась вместе с поведением.

                     Было: «не распознаны и не записаны» — то есть отказ.
                     Стало: колонка уходит в карантин, Ассоциация её
                     разбирает и решает, заводить ли признак. Хозяйству
                     важно знать обе половины: в карточках этого пока нет,
                     но и выброшено оно не будет.

                     Обещать сроки нельзя — решение принимает человек,
                     — поэтому сказано, что произойдёт, а не когда.
                  */}
                  {!!state.unknownColumns?.length && (
                    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
                      <p className="font-medium">Колонки книге пока не известны:</p>
                      <p className="mt-1 leading-snug">
                        {state.unknownColumns.map((c) => `«${c}»`).join(', ')}
                      </p>
                      <p className="mt-1 text-ink-500">
                        В карточки они не попали — у книги нет для них признака. Но и не
                        выброшены: переданы Ассоциации на разбор вместе с примерами значений.
                        Если это известный признак под другим названием, сверьте заголовки
                        с таблицей ниже и загрузите ещё раз.
                      </p>
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
