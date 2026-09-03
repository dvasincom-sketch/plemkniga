import Link from 'next/link'
import { Moment } from '@/components/Moment'
import { InfoTip } from '@/components/InfoTip'
import { AREA_LABEL, AREA_ORDER, CHECKS, PROBE_COUNT, checkSpec } from '@/lib/check-registry'
import { FRESH_HOURS, type CheckRunView } from '@/lib/check-report'

/**
 * Статус: что проверено, когда и с каким исходом.
 *
 * ## Почему список строится из реестра, а не из результатов
 *
 * Доска, собранная из прогонов, покажет ровно то, что успели прогнать,
 * и умолчит об остальном. А главный вопрос здесь не «что зелено»,
 * а «что вообще проверялось». Поэтому строки берутся из реестра всех
 * проверок, а результаты на них накладываются: проверка без результата
 * честно говорит «не гонялась».
 *
 * ## Почему устаревшее не зелёное
 *
 * «Всё сошлось» трёхнедельной давности отвечает на вопрос «как было»,
 * притворяясь ответом на «как сейчас». Через {@link FRESH_HOURS} часов
 * исход становится «неизвестно» — серым, а не зелёным. Зелёное означает
 * «проверено недавно и сошлось», и ничего другого.
 *
 * Находки при этом важнее возраста: старый прогон с расхождением
 * остаётся красным. Расхождение не рассасывается само.
 *
 * ## Почему подробности видит не всякий
 *
 * Страница открыта, и это решено сознательно: зрелость системы — довод
 * в её пользу, а не тайна. Но исход и подробность — разные вещи.
 *
 * Ночные пробы номеров животных не печатают: находка формулируется как
 * «отчёт 12, список 11». А полный прогон зовёт полсотни проверок,
 * и ревизия родословной честно называет, у каких животных цикл. Открытая
 * страница со списком номеров — это выгрузка книги в обход всех правил
 * видимости, сделанная из лучших побуждений.
 *
 * Поэтому счёт находок виден всем, а сами строки — вошедшим. Постороннему
 * при этом не врут: сказано, что находки есть и сколько их.
 */

/**
 * Пропущенная проверка — не находка и не удача.
 *
 * Пустой список находок сюда не попадает намеренно: `every` по пустому
 * массиву отвечает «да», и без проверки длины неудача без единой
 * названной причины считалась бы пропуском и пряталась бы с глаз.
 */
const isSkipped = (p: { findings: string[] }): boolean =>
  p.findings.length > 0 && p.findings.every((f) => f.startsWith('пропущена'))

/**
 * Номер животного внутри находки — ссылкой на поиск по книге.
 *
 * Находка приходит строкой: «CHK-016 → CHK-015 → CHK-016», «отчёт 12,
 * список 11». Разобрать её нельзя, не найдя животное, а найти его
 * значило скопировать номер и вставить в поиск. Три движения там, где
 * хватает одного.
 *
 * Ссылка ведёт в общий поиск книги, а не в карточку: идентификатора
 * записи в строке нет, есть только номер. Поиск по номеру — то же самое
 * действие, что человек сделал бы руками, и он честно ответит «не
 * найдено», если животное уже удалено.
 *
 * Что считается номером: цифры (национальный), латиница с цифрами
 * (HOUSA, RUS) и приставки контрольных стад (CHK-, TEST-). Русские
 * слова под это не попадают, и обычный текст находки остаётся текстом.
 */
const IDENT = /\b((?:CHK|TEST)-[A-ZА-Я0-9-]+|[A-Z]{2,5}\d{6,14}|\d{6,15}(?:\.\d{2})?)\b/g

function withLinks(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0

  for (const m of text.matchAll(IDENT)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <Link
        key={`${at}-${m[0]}`}
        href={`/?id=${encodeURIComponent(m[0])}`}
        className="underline underline-offset-2 hover:text-forest-500"
        title={`Найти ${m[0]} в книге`}
      >
        {m[0]}
      </Link>,
    )
    last = at + m[0].length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

const TONE: Record<string, { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-forest-500', text: 'text-forest-600', label: 'сошлось' },
  failed: { dot: 'bg-[#c0392b]', text: 'text-[#c0392b]', label: 'есть находки' },
  stale: { dot: 'bg-ink-300', text: 'text-ink-500', label: 'устарело' },
  never: { dot: 'bg-ink-200', text: 'text-ink-400', label: 'не гонялась' },
}

/** Почему проверка не попала в прогон — одной фразой. */
const whyManual = (code: string): string => {
  const spec = checkSpec(code)
  if (!spec) return 'нет в реестре'
  if (spec.writes) return 'пишет в базу — гоняется только на копии'
  if (spec.needsServer) return 'нужен обход снаружи — место в ночном действии'
  return 'гоняется вручную'
}

/**
 * Команда прогона — целиком, в рабочем виде и без внешних условий.
 *
 * Две правки, и обе после того, как запуск не удался.
 *
 * **`-G --data-urlencode`**, а не строка с готовым адресом. Первая
 * редакция показывала `?token=…&label=Разработка` — и запуск ответил
 * четырёхсотым: кириллица в строке запроса уходит сырыми байтами,
 * а разбор HTTP такого не принимает и отвечает «плохой запрос» ещё
 * до того, как дело дойдёт до маршрута.
 *
 * **Ключ читается из `.env` первой строкой.** Вторая редакция ссылалась
 * на `$CHECKS_TOKEN`, будто он в оболочке есть, — а он в файле окружения,
 * который читает сервер, но не терминал. Curl отправил пустой ключ,
 * ручка ответила «не найдено», и выглядело это как неверный токен.
 *
 * Отсюда правило для любой команды, напечатанной в интерфейсе: она должна
 * работать от начала до конца в чужой оболочке, а не «работать, если
 * до этого сделать ещё кое-что». Иначе подсказка не помогает, а сбивает.
 */
const COMMAND_LOCAL = [
  "export CHECKS_TOKEN=$(grep -m1 '^CHECKS_TOKEN=' .env | cut -d= -f2-)",
  '',
  'curl -sS -G -w \'\\n%{http_code}\\n\' "http://localhost:3000/checks" \\',
  '  --data-urlencode "token=$CHECKS_TOKEN" \\',
  '  --data-urlencode "label=Разработка"',
].join('\n')

/**
 * На проде ключ берётся не из файла, а из панели — значит его вписывают
 * руками, и вот здесь особенно важно, чем обозначено место для него.
 *
 * `ВПИШИТЕ_КЛЮЧ` заглавными, а не многоточие. Многоточие — один знак
 * Unicode, оболочка отправляет его как ключ, и ручка отвечает «не
 * найдено»: в логе тогда стоит «прислано знаков: 1», и понять по такому
 * ответу, что подставили не то, невозможно. Так и вышло на первом
 * боевом прогоне.
 *
 * Одинарные кавычки тоже не для красоты: в ключе встречаются `+` и `$`,
 * и в двойных оболочка попробует их истолковать.
 */
const COMMAND_PROD = [
  "export CHECKS_TOKEN='ВПИШИТЕ_КЛЮЧ_ИЗ_ПАНЕЛИ'",
  '',
  'curl -sS -G -w \'\\n%{http_code}\\n\' "https://адрес-сервера/checks" \\',
  '  --data-urlencode "token=$CHECKS_TOKEN" \\',
  '  --data-urlencode "label=Прод"',
].join('\n')

export function EvolutionChecks({
  runs,
  error,
  detailed,
}: {
  runs: CheckRunView[]
  error: string | null
  /** Показывать сами находки, а не только их число. Только вошедшим. */
  detailed: boolean
}) {
  /* Пробы, прогнанные хоть где-то, по коду проверки → результат по средам. */
  const byCode = new Map<
    string,
    { label: string; ok: boolean; skipped: boolean; findings: string[] }[]
  >()
  for (const run of runs) {
    for (const r of run.results) {
      const list = byCode.get(r.code) ?? []
      /*
       * Пропуск — не находка и не удача. Проверка страниц при лежащем
       * сервере ничего не проверила: красить её красным значило бы
       * обвинить систему в том, чего никто не смотрел, зелёным —
       * притвориться, что смотрели.
       */
      const skipped = isSkipped(r)
      list.push({ label: run.label, ok: r.ok, skipped, findings: r.findings })
      byCode.set(r.code, list)
    }
  }

  return (
    <div className="space-y-10">
      {/* --------------------------- Прогоны --------------------------- */}
      <section>
        <h2 className="section-title mb-5">Последние прогоны</h2>

        {runs.length === 0 ? (
          <div className="card">
            {/*
               Недоступное хранилище и «ещё не запускали» — разные вещи,
               и подменять одно другим нельзя ровно здесь: страница
               заведена ради честного ответа о состоянии.
            */}
            {error ? (
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-[#8a2d22]">{error}</p>
            ) : (
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Прогонов ещё не было. Проверки запускаются на той машине, где развёрнута
                система.
              </p>
            )}

            <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Ключ задаётся переменной <code className="text-[13px]">CHECKS_TOKEN</code> —
              не короче шестнадцати знаков; пока её нет, маршрут отвечает несуществующей
              страницей. После правки окружения сервер нужно перезапустить.
            </p>

            {/*
               Кириллица в метке передаётся через --data-urlencode.
               Строкой в адресе она уходит сырыми байтами, и разбор HTTP
               отвечает «плохой запрос» до всякого маршрута.
            */}
            <p className="mt-5 text-[13px] font-medium text-ink-700">На своей машине</p>
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-canvas px-4 py-3 font-mono text-[13px] leading-relaxed">
              {COMMAND_LOCAL}
            </pre>

            <p className="mt-4 text-[13px] font-medium text-ink-700">
              На сервере — ключ из панели, файла окружения там нет
            </p>
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-canvas px-4 py-3 font-mono text-[13px] leading-relaxed">
              {COMMAND_PROD}
            </pre>
            <p className="mt-2 max-w-[80ch] text-[13px] leading-snug text-ink-500">
              Ключ вписывается целиком — многоточие вместо него оболочка отправит как
              один знак, и ручка ответит «не найдено». На своей машине первая строка
              достаёт его из <code className="text-[12px]">.env</code>: этот файл читает
              сервер, но не терминал. Метка передаётся через{' '}
              <code className="text-[12px]">--data-urlencode</code>: кириллица, вписанная прямо
              в адрес, уходит сырыми байтами, и сервер отвечает «плохой запрос» ещё до маршрута.
              Код ответа говорит об исходе прогона: 200 — сошлось, 409 — есть находки, 404 —
              ключ не подошёл, а причину пишет лог сервера.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {runs.map((run) => {
              const tone = TONE[run.outcome]
              return (
                <article key={run.label} className="card">
                  <div className="flex items-baseline gap-2">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                    <h3 className="panel-heading mb-0">{run.label}</h3>
                    <span className={`text-[14px] ${tone.text}`}>{tone.label}</span>
                  </div>

                  <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
                    Проверок прогнано {run.total}, с находками {run.failed}. Заняло{' '}
                    {(run.ms / 1000).toFixed(1)} с.
                  </p>

                  <p className="mt-2 text-[13px] text-ink-500">
                    <Moment iso={run.ranAt} />
                    {run.version && <> · версия {run.version}</>}
                  </p>

                  {/*
                     Возраст назван словами, а не только датой. «26 августа»
                     требует от читателя вычитания, а вычитать он не станет
                     — и примет старое за нынешнее.
                  */}
                  {run.outcome === 'stale' && (
                    <p className="mt-3 rounded-lg bg-canvas px-3.5 py-3 text-[13px] leading-snug text-ink-700">
                      Прошло больше {FRESH_HOURS} часов. Что показано — это состояние
                      на момент прогона, а не сейчас: считать его нынешним нельзя,
                      поэтому исход отмечен как неизвестный.
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* -------------------------- Все проверки -------------------------- */}
      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="section-title mb-0">Что система умеет проверять</h2>
          <InfoTip label="Почему не все проверки в ночном прогоне">
            <p className="mb-2 font-medium text-ink-900">Почему не все гоняются сами</p>
            <p className="mb-2">
              Около половины проверок <b>пишет в базу</b>: заводит организации, животных,
              приглашения и потом удаляет. Ночной прогон на боевой книге означал бы,
              что каждую ночь в ней появляются и исчезают записи, а обрыв посреди
              прогона оставлял бы мусор, неотличимый от настоящих данных.
            </p>
            <p>
              Ещё три ходят по страницам снаружи и требуют живого сервера. Внутри
              самого сервера им не место: проверяющий, живущий внутри проверяемого,
              не заметит, что проверяемый не отвечает. Им место в ночном действии
              рядом с прогоном, а не в нём.
            </p>
          </InfoTip>
        </div>
        <p className="mb-6 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
          Всего проверок {CHECKS.length}, из них {PROBE_COUNT} умеет прогнать само
          приложение — они и попадают в ночной прогон. Остальные запускаются командой
          и здесь перечислены, чтобы было видно не только что проверено, но и что нет.
        </p>

        <div className="space-y-8">
          {AREA_ORDER.map((area) => {
            const list = CHECKS.filter((c) => c.area === area)
            if (list.length === 0) return null

            return (
              <div key={area}>
                <h3 className="panel-heading">{AREA_LABEL[area]}</h3>
                <div className="card overflow-x-auto">
                  <table className="metric-table min-w-[720px]">
                    <thead>
                      <tr>
                        <th>Проверка</th>
                        <th>Что сверяет</th>
                        <th>Команда</th>
                        <th>Состояние</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((spec) => {
                        const seen = byCode.get(spec.code) ?? []
                        const bad = seen.filter((s) => !s.ok && !s.skipped)
                        const onlySkipped = seen.length > 0 && seen.every((s) => s.skipped)
                        const outcome =
                          seen.length === 0
                            ? 'never'
                            : onlySkipped
                              ? 'stale'
                              : bad.length > 0
                                ? 'failed'
                                : 'ok'
                        const tone = TONE[outcome]

                        return (
                          <tr key={spec.code}>
                            <td className="font-medium">{spec.title}</td>
                            <td className="text-ink-500">{spec.what}</td>
                            {/* Команда как есть: её копируют в терминал целиком */}
                            <td className="whitespace-nowrap font-mono text-[13px] text-ink-500">
                              npm run {spec.code}
                            </td>
                            <td className="whitespace-nowrap">
                              <span className="inline-flex items-baseline gap-2">
                                <span
                                  className={`inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${tone.dot}`}
                                />
                                <span className={tone.text}>
                                  {outcome === 'never'
                                    ? spec.probe
                                      ? 'ещё не гонялась'
                                      : whyManual(spec.code)
                                    : outcome === 'stale'
                                      ? 'пропущена'
                                      : outcome === 'failed'
                                        ? bad.map((b) => b.label).join(', ')
                                        : seen.map((s) => s.label).join(', ')}
                                </span>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* --------------------------- Находки --------------------------- */}
      {runs.some((r) => r.results.some((p) => !p.ok && !isSkipped(p))) && (
        <section>
          <h2 className="section-title mb-5">Находки</h2>
          <div className="space-y-5">
            {runs.map((run) =>
              run.results
                .filter((p) => !p.ok && !isSkipped(p))
                .map((p) => (
                  <article key={`${run.label}-${p.code}`} className="card">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <h3 className="panel-heading mb-0">
                        {checkSpec(p.code)?.title ?? p.code}
                        <span className="ml-2 text-[14px] font-normal text-ink-500">
                          {run.label}
                        </span>
                      </h3>
                      {/*
                         Ссылка «где разбирать» — только у тех проверок,
                         у которых такое место в системе есть. Придумывать
                         его нельзя: ссылка, ведущая примерно туда, хуже
                         её отсутствия.
                      */}
                      {checkSpec(p.code)?.where && (
                        <Link
                          href={checkSpec(p.code)!.where!.href}
                          className="text-[14px] underline underline-offset-4 hover:text-forest-500"
                        >
                          {checkSpec(p.code)!.where!.label} →
                        </Link>
                      )}
                    </div>
                    {/*
                       Постороннему — счёт, вошедшему — строки. Ревизия
                       родословной называет номера животных, и открытый
                       список таких номеров есть выгрузка книги в обход
                       правил видимости.
                    */}
                    {detailed ? (
                      <ul className="space-y-1.5 text-[15px] leading-relaxed text-ink-700">
                        {p.findings.map((f, i) => (
                          <li key={i} className="flex gap-2">
                            <span aria-hidden="true" className="text-[#c0392b]">
                              ·
                            </span>
                            <span>{withLinks(f)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[15px] leading-relaxed text-ink-700">
                        Находок: <b className="tabular-nums">{p.findings.length}</b>. Что именно
                        не сошлось, видно вошедшим: разбор называет номера животных, а это
                        уже данные книги, а не сведения о системе.
                      </p>
                    )}
                    {/*
                       Команда напечатана рядом с находкой: разбор почти
                       всегда начинается с повторного прогона той же
                       проверки — с подробностями и на свежих данных.
                    */}
                    <p className="mt-3 font-mono text-[13px] text-ink-500">
                      npm run {p.code}
                    </p>
                  </article>
                )),
            )}
          </div>
        </section>
      )}

      {/* ------------------------- Чего это не говорит ------------------- */}
      <section className="card">
        <h2 className="panel-heading">Чего этот раздел не говорит</h2>
        <ul className="max-w-[80ch] space-y-2.5 text-[15px] leading-relaxed text-ink-700">
          <li>
            <b>Зелёное — это «сошлось», а не «работает правильно».</b> Проверки сверяют
            то, что уже описано: числа с числами, схему с журналом, списки с отчётами.
            Ошибку, которой никто не придумал проверки, они не увидят.
          </li>
          <li>
            <b>Проверки данных смотрят одно хозяйство</b> — самое большое из заведённых.
            Расхождение, которое возникает только у другого, здесь не найдётся.
          </li>
          <li>
            <b>Битые внешние ссылки не проверяются вовсе.</b> Обход страниц знает только
            свои адреса; ссылка на чужой сайт, который закрылся, останется незамеченной.
          </li>
          <li>
            <b>Расхождение документации с кодом не ловит ничего.</b> Описание API
            сверяется с ручками, а рассказ о процессах в «Документации» — ни с чем.
          </li>
        </ul>
      </section>
    </div>
  )
}
