import Link from 'next/link'
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { DataSubmission } from '@/payload-types'

/**
 * История загрузок — по строке на пакет, а не на каждую смену статуса.
 *
 * ## Что было
 *
 * Лента строилась по событиям: пакет появлялся в ней столько раз, сколько
 * статусов прошёл. Замысел понятен — показать, на каком шаге проверки
 * документы. На экране получалось другое: «№ 123441» тремя строками подряд
 * с почти одинаковыми датами, «№ 123456» двумя. Читается это как «одно
 * и то же загрузилось трижды», и первое, что хозяйство идёт проверять, —
 * не завелись ли дубли.
 *
 * ## Как теперь
 *
 * Строка на пакет, в ней — нынешнее состояние. Путь, который пакет прошёл,
 * стоит тут же мелким шрифтом одной строкой: «получен 03.03 → проверен
 * 04.03 → согласован 04.03». Замысел сохранён целиком, а списка из десяти
 * строк на три пакета больше нет.
 *
 * Порядок — по последнему движению пакета, а не по дате подачи: человек
 * приходит сюда узнать, что изменилось.
 */

type Tone = 'pending' | 'done' | 'accepted' | 'rejected'

const STATUS_VIEW: Record<string, { tone: Tone; text: string }> = {
  uploaded: { tone: 'pending', text: 'Документ получен сотрудниками Ассоциации' },
  checking: { tone: 'pending', text: 'Документы на проверке у сотрудников Ассоциации' },
  checked: { tone: 'done', text: 'Документы проверены, ознакомьтесь с результатом' },
  accepted: { tone: 'accepted', text: 'Вы согласовали проверенные данные' },
  rejected: { tone: 'rejected', text: 'Возможная причина отказа в рассмотрении данных' },
}

const TONE_BG: Record<Tone, string> = {
  pending: 'bg-accent-500',
  done: 'bg-forest-500',
  accepted: 'bg-brand-500',
  rejected: 'bg-[#c0392b]',
}

function StatusIcon({ tone }: { tone: Tone }) {
  return (
    <span
      className={`flex h-[62px] w-[62px] flex-none items-center justify-center rounded-xl text-white ${TONE_BG[tone]}`}
      aria-hidden="true"
    >
      {tone === 'pending' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v5.2l3.2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {tone === 'done' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path
            d="m5 12.5 4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {tone === 'accepted' && (
        <svg width="24" height="26" viewBox="0 0 24 26" fill="none">
          <path d="M5 24V3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M5 4h13l-2.5 4.5L18 13H5V4Z" fill="currentColor" />
        </svg>
      )}
      {tone === 'rejected' && (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  )
}

type Step = { status: string; at?: string | null }

type Entry = {
  key: string
  submissionId: number | string
  number?: string | null
  kind?: string | null
  /** Нынешнее состояние — то, ради чего строка и открывается. */
  current: Step
  /** Пройденный путь, включая нынешнее состояние. */
  trail: Step[]
}

export function SubmissionHistory({ submissions }: { submissions: DataSubmission[] }) {
  const entries: Entry[] = submissions.map((sub) => {
    const history = sub.history ?? []

    /*
     * Истории может не быть вовсе — у пакетов, заведённых до появления
     * журнала. Тогда путь состоит из одного шага: нынешнего состояния.
     */
    const trail: Step[] =
      history.length > 0
        ? history.map((h) => ({ status: String(h.status ?? sub.status), at: h.at }))
        : [{ status: String(sub.status), at: sub.submittedAt }]

    return {
      key: String(sub.id),
      submissionId: sub.id,
      number: sub.number,
      kind: sub.kind,
      current: trail[trail.length - 1]!,
      trail,
    }
  })

  /* По последнему движению: человек приходит узнать, что изменилось. */
  entries.sort(
    (a, b) => new Date(b.current.at ?? 0).getTime() - new Date(a.current.at ?? 0).getTime(),
  )

  if (entries.length === 0) {
    return (
      <div className="card text-center text-ink-500">
        Загрузок пока не было. Отправьте файл через «Мои животные → Импорт данных» — здесь появится
        история его проверки.
      </div>
    )
  }

  return (
    <ul className="space-y-4">
      {entries.map((e) => {
        const view = STATUS_VIEW[e.current.status] ?? {
          tone: 'pending' as Tone,
          text: labelOf(SUBMISSION_STATUSES, e.current.status),
        }

        return (
          /*
             На телефоне строка перестраивается в столбик.
             
             Раньше здесь была одна горизонтальная раскладка на все ширины:
             значок, номер фиксированными 130 пикселями, описание и кнопка
             в ряд. На узком экране описанию оставалось сантиметра полтора,
             и оно рассыпалось по одному слову в строку, а кнопка не влезала
             и вылезала за карточку. Ширина у телефона одна — вертикаль,
             её и используем.
          */
          <li
            key={e.key}
            className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgb(23_24_26_/_0.06)] transition-shadow sm:flex-row sm:items-center sm:gap-6 sm:py-3 sm:pl-2 sm:pr-2"
          >
            <div className="flex min-w-0 items-center gap-4 sm:contents">
              <StatusIcon tone={view.tone} />

              <div className="min-w-0 sm:w-[130px] sm:flex-none sm:py-4">
                <p className="text-[15px] font-medium">№ {e.number}</p>
                <p className="mt-1 text-sm text-ink-500">{dateRu(e.current.at)}</p>
              </div>
            </div>

            <div className="min-w-0 sm:flex-1 sm:py-4">
              <p className="text-[15px]">{labelOf(SUBMISSION_KINDS, e.kind)}</p>
              <p className="mt-1 text-sm text-ink-500">{view.text}</p>

              {/*
                 Путь пакета одной строкой. Раньше каждый его шаг был
                 отдельной строкой списка, и три шага читались как три
                 загрузки. Показывается только когда шагов больше одного:
                 «получен 03.03» само по себе повторяет дату слева.
              */}
              {e.trail.length > 1 && (
                <p className="mt-1.5 text-[13px] leading-snug text-ink-500">
                  {e.trail
                    .map(
                      (t) =>
                        `${labelOf(SUBMISSION_STATUSES, t.status).toLowerCase()} ${dateRu(t.at)}`,
                    )
                    .join(' → ')}
                </p>
              )}
            </div>

            <Link
                href={`/account/submissions/${e.submissionId}`}
                className="btn btn-accent w-full justify-center sm:w-auto sm:flex-none"
              >
                Подробнее
                <svg width="16" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
                  <path
                    d="M1 7h17m0 0-5.5-5.5M18 7l-5.5 5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
