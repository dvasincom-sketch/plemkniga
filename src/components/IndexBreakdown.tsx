import Link from 'next/link'
import type { ReactNode } from 'react'
import { InfoTip } from './InfoTip'
import { Computed } from './Computed'
import { nf, plural, signed } from '@/lib/format'
import type { IndexResult } from '@/lib/breeding-index'
import type { CowEvidence } from '@/lib/cow-evidence'

/**
 * Индекс племенной ценности в карточке — с разбором, откуда взялось число.
 *
 * Одно число без разбора не работает: зоотехник видит «+1240» и не может
 * ни проверить его, ни поспорить с ним, ни понять, что именно у животного
 * хорошо. Поэтому рядом со значением стоит таблица вкладов: сколько очков
 * дал каждый признак и почему — отклонение от базы, помноженное на вес.
 *
 * Читается она сверху вниз как объяснение: первым идёт признак, который
 * решил больше всех. Отрицательные вклады не прячутся — у профиля Ассоциации
 * композит тела весит со знаком минус, и животное может терять на нём очки,
 * оставаясь хорошим в целом.
 *
 * ## Когда считать нечего, панель схлопывается
 *
 * У коровы без геномной оценки ни одного признака профиля нет — и это
 * не исключение, а обычное состояние. Панель при этом рисовала шесть
 * значений, чтобы сказать «нет данных»: крупный ноль очков, достоверность
 * 0 %, процентиль, «учтено 0 из 11», базу сравнения и строку-пояснение.
 *
 * Одно из них было неправдой. **Процентиль 50** — это середина
 * по умолчанию, а выглядит как измерение: читатель видит «средняя корова»,
 * хотя её не мерили. Тот же случай, что с прочерком вместо нуля в сводке
 * стада: ноль — утверждение, которого система не проверяла.
 *
 * Поэтому при `used === 0` остаётся заголовок, одна строка и основание.
 * Место, занимаемое блоком, должно быть соразмерно тому, сколько в нём
 * сведений.
 *
 * ## Почему основание живёт здесь, а не отдельной карточкой
 *
 * «На чём стоит оценка» стояло соседней карточкой со своим заголовком,
 * своей рамкой и тремя плашками под три однозначных числа. Предмет
 * у них один: сколько стоит индекс и на чём он держится. Два заголовка
 * об одном читаются как два разных разговора, а плашка в треть ширины
 * ради цифры «1» — это место, потраченное не на сведения.
 *
 * Плашки оправданы, когда числа сравнивают взглядом между карточками;
 * эти читают один раз, сверху вниз. Поэтому строка, а не сетка.
 */

export function IndexBreakdown({
  result,
  percentile,
  computedAt,
  href,
  evidence,
  facts,
}: {
  result: IndexResult
  /** Место в группе сравнения; считается по хранимым значениям. */
  percentile: { percentile: number; group: number; sameYear: boolean } | null
  computedAt?: string | null
  /** Ссылка на настройку профилей — только своим. */
  href?: string
  /** На чём стоит надёжность: собственные наблюдения и родители в книге. */
  evidence?: CowEvidence | null
  /**
   * Числа того же разговора, которые считает не эта панель: инбридинг,
   * возраст первого отёла. Панель отдаёт им место в подвале, а что
   * именно там стоит, решает страница — величины эти к индексу
   * не относятся, но читаются вместе с ним.
   */
  facts?: ReactNode
}) {
  const { profile, contributions, value, reliability, used, total, baseVersion } = result
  const economic = profile.kind === 'economic'
  const max = Math.max(...contributions.map((c) => Math.abs(c.points)), 1)

  /*
   * Ни одного измеренного признака — считать нечего, и показывать нечего.
   * Разбор в шапке файла.
   */
  const nothingToCount = used === 0

  /**
   * Подвал: подпись — значение, тем же ритмом, что плитки выше.
   *
   * Основание надёжности стояло длинным серым предложением во всю
   * ширину: сто тридцать знаков, которые надо прочесть, чтобы достать
   * из них три числа. Само объяснение переехало подсказкой к слову
   * «Надёжность» — оно объясняет именно её, — а в подвале осталось
   * то, ради чего его читали.
   *
   * Ритм тот же, что у плиток, но без подложки: наверху измеренное,
   * внизу основание и соседние величины. Разница в весе и есть
   * иерархия, которой блоку не хватало.
   */
  const fact = (label: string, value: ReactNode) => (
    <div key={label}>
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p className="mt-1 text-[15px] leading-snug">{value}</p>
    </div>
  )

  const basis =
    evidence &&
    fact(
      'Основание надёжности',
      <>
        {nf(evidence.lactations, 0)}{' '}
        {plural(evidence.lactations, 'отёл', 'отёла', 'отёлов')} ·{' '}
        {nf(evidence.milkTests, 0)}{' '}
        {plural(evidence.milkTests, 'дойка', 'дойки', 'доек')} ·{' '}
        {evidence.hasSire && evidence.hasDam
          ? 'оба родителя'
          : evidence.hasSire
            ? 'только отец'
            : evidence.hasDam
              ? 'только мать'
              : 'родителей нет'}
      </>,
    )

  /*
   * Предупреждение об одной лактации — по той же причине, по какой
   * у быка предупреждение об одном хозяйстве: среднее по одному
   * наблюдению не среднее, а само наблюдение, и знать об этом надо
   * до килограммов. Стоит отдельной строкой под подвалом: это не факт
   * о животном, а оговорка о том, как читать остальные.
   */
  const caveat = evidence && (evidence.lactations <= 1 || (!evidence.hasSire && !evidence.hasDam)) && (
    <p className="mt-3 max-w-[80ch] text-[13px] leading-relaxed text-ink-700">
      {evidence.lactations === 0
        ? 'Отёлов в книге нет: оценка опирается только на происхождение, собственных наблюдений за животным нет ни одного.'
        : evidence.lactations === 1
          ? 'Учтён один отёл. Оценка по одной лактации сдвинется с каждой следующей — она пока говорит об этом годе, а не о животном.'
          : 'Ни один из родителей не найден в книге связью. Четверть надёжности, которую даёт происхождение, здесь не работает.'}
    </p>
  )

  return (
    /*
       Зелёная рамка — не украшение. Всё остальное на вкладке привезено извне,
       а это число система посчитала сама и умеет разложить на слагаемые.
       Разница в происхождении данных важнее разницы в их содержании,
       и она должна быть видна до чтения заголовков.
    */
    <div className="card ring-2 ring-forest-500">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <p className="mb-1 text-[12px] uppercase tracking-wide text-forest-600">
            Расчёт системы
          </p>
          <h2 className="panel-heading !mb-1">Индекс племенной ценности</h2>
          <p className="text-[13px] text-ink-500">
            Профиль «{profile.name}»
            {href && (
              <>
                {' · '}
                <Link href={href} className="underline underline-offset-4 hover:text-forest-500">
                  сменить
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Нуля очков у неизмеренного животного не бывает: это не «плохо»,
            а «неизвестно», и крупная цифра сказала бы первое */}
        {!nothingToCount && (
          <div className="text-right">
            {/* Само число индекса — первое, что читают, и первое, что нужно
                уметь проверить: под пунктиром формула целиком */}
            <p className={`stat-value text-[30px] leading-none ${value < 0 ? 'text-[#c0392b]' : 'text-forest-600'}`}>
              <Computed formula="index">{signed(Math.round(value))}</Computed>
            </p>
            <p className="mt-1 text-[12px] text-ink-500">{economic ? '₽ за жизнь' : 'очков индекса'}</p>
          </div>
        )}
      </div>

      {nothingToCount && (
        <>
          <p className="mb-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Индекс не посчитан: ни один из {total} признаков профиля у животного
            не оценён. Он появится, когда приедут оценки признаков — из расчётного
            центра или по геномному тесту.
          </p>
        </>
      )}

      {/*
         Плитки, а не тонкий ряд подписей.
         
         Ряд `dl` с шестнадцатым кеглем читался как продолжение текста:
         четыре величины расползались по всей ширине и не отличались
         от объяснений вокруг. Плитка на подложке — язык, которым
         на сайте уже говорят «Стадо в числах» и блок надёжности быка,
         и величина в ней читается как величина, а не как строка абзаца.
      */}
      {!nothingToCount && (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            {
              label: 'Надёжность',
              tip: 'Считается из числа собственных наблюдений животного и из того, что известно о родителях. Основание целиком — в подвале блока. Это не уровень достоверности данных в шапке карточки: тот говорит, кем проверены сами записи',
              value: <Computed formula="combinedReliability">{nf(reliability, 0)} %</Computed>,
              note: null,
            },
            {
              label: 'Процентиль',
              tip: null,
              value: percentile ? (
                <Computed formula="percentile">{percentile.percentile}</Computed>
              ) : (
                '—'
              ),
              note: percentile
                ? `из ${percentile.group}${percentile.sameYear ? ' ровесников' : ' животных книги'}`
                : 'сравнивать не с кем',
            },
            {
              label: 'Учтено признаков',
              tip: null,
              value: `${used} из ${total}`,
              note: used < total ? 'по остальным нет оценок' : null,
            },
            {
              label: 'База сравнения',
              tip: null,
              value: <span className="text-[17px]">{baseVersion}</span>,
              note: computedAt
                ? `рассчитано ${new Date(computedAt).toLocaleDateString('ru-RU')}`
                : null,
            },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-canvas px-4 py-3.5">
              <p className="flex items-center gap-1.5 text-[13px] leading-snug text-ink-500">
                {m.label}
                {m.tip && <InfoTip>{m.tip}</InfoTip>}
              </p>
              <p className="mt-1.5 stat-value text-[24px] leading-none">{m.value}</p>
              {m.note && <p className="mt-1.5 text-[12px] leading-tight text-ink-500">{m.note}</p>}
            </div>
          ))}
        </div>
      )}

      {!nothingToCount && (
        /*
           Разбор свёрнут по умолчанию. За индексом приходят чаще, чем
           за его устройством: обычный вопрос — «сколько», а не «из чего».
           Одиннадцать строк таблицы — половина экрана между значением
           и всем, что ниже, и платить её каждый раз ради редкого вопроса
           неправильно. Кому нужно объяснение — он в одном щелчке,
           и заголовок прямо обещает, что оно есть.
        */
        <details className="group">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-[14px] text-ink-700">
            <span className="underline underline-offset-4">Разбор по признакам</span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-ink-500 transition-transform group-open:rotate-180"
            >
              <polyline
                points="6 9 12 15 18 9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>

          <div className="overflow-x-auto">
            <table className="metric-table w-full">
              <thead>
                <tr>
                  <th>Признак</th>
                  <th className="text-right">Оценка</th>
                  <th className="text-right">
                    <span className="inline-flex items-center gap-1">
                      Отклонение
                      <InfoTip>Отклонение от базы в долях стандартного отклонения признака. Именно оно делает килограммы молока и баллы вымени сопоставимыми</InfoTip>
                    </span>
                  </th>
                  <th className="text-right">Вес</th>
                  <th className="text-right">Вклад</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.key}>
                    <td>
                      <span className="text-[14px]">{c.label}</span>
                      <span className="ml-1.5 text-[12px] text-ink-500">{c.unit}</span>
                      {/* Полоска вклада прямо в строке: она отвечает на вопрос
                          «что решило» быстрее, чем колонка чисел */}
                      <div className="mt-1 h-[4px] w-full max-w-[160px] rounded-full bg-ink-100">
                        <div
                          style={{ width: `${(Math.abs(c.points) / max) * 100}%` }}
                          className={`h-full rounded-full ${c.points < 0 ? 'bg-[#c0392b]' : 'bg-forest-500'}`}
                        />
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{signed(c.forecast, 1)}</td>
                    <td className="text-right tabular-nums text-ink-700">
                      {c.standardized > 0 ? '+' : ''}
                      {c.standardized.toFixed(2)} σ
                    </td>
                    <td className="text-right tabular-nums text-ink-700">
                      {c.weight > 0 ? '+' : ''}
                      {c.weight.toFixed(0)}
                      {economic ? ' ₽' : ' %'}
                    </td>
                    <td
                      className={`text-right font-medium tabular-nums ${
                        c.points < 0 ? 'text-[#c0392b]' : ''
                      }`}
                    >
                      {c.points > 0 ? '+' : ''}
                      {Math.round(c.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
            Вклад признака — его отклонение от базы, умноженное на вес профиля.
            {economic
              ? ' Веса заданы в рублях на единицу признака, поэтому сумма получается в деньгах.'
              : ' Веса — проценты влияния, они приводятся к сумме 100 перед расчётом.'}{' '}
            Сумма вкладов и есть индекс.
          </p>
        </details>
      )}

      {/*
         Инбридинг и возраст первого отёла стояли двумя плашками под
         панелью — между ней и следующим блоком, ничьи. Читаются они
         вместе с индексом: высокий индекс при F = 12 % означает не то же,
         что при нуле, и решение о подборе принимают по обоим числам
         сразу. Место им — в подвале той же рамки, а не в промежутке
         между рамками.
      */}
      {(basis || facts) && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <div className="flex flex-wrap gap-x-12 gap-y-3">
            {basis}
            {facts}
          </div>
          {caveat}
        </div>
      )}
    </div>
  )
}
