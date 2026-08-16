import Link from 'next/link'
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { DataSubmission } from '@/payload-types'

/**
 * Лента «История» — по одной строке на каждую смену статуса пакета данных.
 *
 * Пользователю важно понимать, на каком шаге ручной проверки находятся его
 * документы, поэтому лента строится не по пакетам, а по событиям: один пакет
 * появляется в ней столько раз, сколько статусов он прошёл.
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

type Entry = {
  key: string
  submissionId: number | string
  number?: string | null
  kind?: string | null
  status: string
  at?: string | null
  order: number
  isCurrent: boolean
}

export function SubmissionHistory({ submissions }: { submissions: DataSubmission[] }) {
  const entries: Entry[] = submissions.flatMap((sub) => {
    const history = sub.history ?? []

    // Если истории нет — показываем хотя бы текущий статус
    const rows =
      history.length > 0
        ? history
        : [{ at: sub.submittedAt, status: sub.status, id: 'current' }]

    return rows.map((h, i) => ({
      key: `${sub.id}-${h.id ?? i}`,
      submissionId: sub.id,
      number: sub.number,
      kind: sub.kind,
      status: String(h.status ?? sub.status),
      at: h.at,
      order: i,
      isCurrent: i === rows.length - 1,
    }))
  })

  entries.sort((a, b) => {
    const diff = new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()
    // При совпадении отметок времени новее тот, кто позже в истории пакета
    return diff !== 0 ? diff : b.order - a.order
  })

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
        const view = STATUS_VIEW[e.status] ?? {
          tone: 'pending' as Tone,
          text: labelOf(SUBMISSION_STATUSES, e.status),
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
            className={`flex flex-col gap-3 rounded-2xl p-4 transition-shadow sm:flex-row sm:items-center sm:gap-6 sm:py-0 sm:pl-2 sm:pr-2 ${
              e.isCurrent
                ? 'bg-white shadow-[0_2px_10px_rgb(23_24_26_/_0.06)]'
                : 'bg-white/55 hover:bg-white'
            }`}
          >
            <div className="flex min-w-0 items-center gap-4 sm:contents">
              <StatusIcon tone={view.tone} />

              <div className="min-w-0 sm:w-[130px] sm:flex-none sm:py-4">
                <p className="text-[15px] font-medium">№ {e.number}</p>
                <p className="mt-1 text-sm text-ink-500">{dateRu(e.at)}</p>
              </div>
            </div>

            <div className="min-w-0 sm:flex-1 sm:py-4">
              <p className="text-[15px]">{labelOf(SUBMISSION_KINDS, e.kind)}</p>
              <p className="mt-1 text-sm text-ink-500">{view.text}</p>
            </div>

            {e.isCurrent && (
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
            )}
          </li>
        )
      })}
    </ul>
  )
}
