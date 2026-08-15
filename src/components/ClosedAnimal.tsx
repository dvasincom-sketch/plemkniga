import Link from 'next/link'
import type { Animal, AccessRequest } from '@/payload-types'
import { AGE_GROUPS, SEXES, STATES, labelOf } from '@/lib/dictionaries'
import { dateRu, nf, signed } from '@/lib/format'
import { AccessRequestForm } from './AccessRequestForm'
import { ACCESS_REQUEST_PURPOSES } from '@/collections/AccessRequests'

/**
 * Страница животного, карточку которого владелец закрыл.
 *
 * Раньше здесь был редирект на форму входа. Он вводил в заблуждение дважды:
 * обещал, что после входа данные откроются (а они не открывались), и скрывал,
 * что решение принимает не система, а конкретное хозяйство.
 *
 * Страница отвечает на три вопроса подряд: что всё-таки видно, кто и почему
 * закрыл остальное, что с этим можно сделать. Последнее — не тупик:
 * авторизованный отправляет запрос владельцу, гость видит, ради чего
 * регистрироваться, и любой может уйти к похожим открытым животным.
 */

const REQUEST_STATE: Record<string, { title: string; tone: string; text: string }> = {
  new: {
    title: 'Запрос отправлен, ждём решения',
    tone: 'bg-[#fff6e5] text-ink-900',
    text: 'Хозяйство получило запрос. Ответ придёт в уведомления — повторно отправлять не нужно.',
  },
  approved: {
    title: 'Хозяйство открыло доступ',
    tone: 'bg-brand-50 text-ink-900',
    text: 'Обновите страницу — карточка должна открыться полностью.',
  },
  declined: {
    title: 'Хозяйство отказало в доступе',
    tone: 'bg-[#fdecea] text-ink-900',
    text: 'Причина, если она указана, приведена ниже. Можно связаться с хозяйством напрямую.',
  },
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p className="mt-0.5 break-words text-[15px] leading-snug">{value || '—'}</p>
    </div>
  )
}

export function ClosedAnimal({
  animal,
  ownerName,
  signedIn,
  request,
  similar,
  similarHref,
}: {
  animal: Animal
  ownerName: string
  signedIn: boolean
  /** Запрос этого пользователя по этому животному, если он уже был. */
  request: AccessRequest | null
  similar: Animal[]
  similarHref: string
}) {
  const s = animal.summary
  const backToOwner = `/?owner=${encodeURIComponent(ownerName)}#results`
  const state = request ? REQUEST_STATE[request.status] : null
  const purposeLabel = request
    ? (ACCESS_REQUEST_PURPOSES.find((p) => p.value === request.purpose)?.label ?? '—')
    : null

  return (
    <>
      {/* --------------------------- Шапка записи --------------------------- */}
      <section className="rounded-card bg-forest-500 p-7 text-white sm:p-8">
        <p className="inline-flex items-center gap-2 rounded-md bg-white/15 px-2.5 py-1 text-[13px]">
          <svg width="11" height="13" viewBox="0 0 12 14" fill="none" aria-hidden="true">
            <rect x="1" y="6" width="10" height="7" rx="1.6" fill="currentColor" />
            <path
              d="M3.2 6V4.2a2.8 2.8 0 1 1 5.6 0V6"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          Доступ закрыт владельцем
        </p>

        <h1 className="mt-4 text-[30px] font-medium leading-[1.08] sm:text-[36px]">
          {animal.name ?? `Животное № ${animal.identNumber}`}
        </h1>

        <p className="mt-3 text-[17px] leading-none">
          <span className="text-white/70">Инд. №</span>{' '}
          <span className="font-medium tabular-nums">{animal.identNumber}</span>
        </p>

        <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-white/90">
          Хозяйство{' '}
          <Link href={backToOwner} className="underline underline-offset-4 hover:text-white">
            {ownerName}
          </Link>{' '}
          оставило запись в книге, но закрыло подробности: оценку племенной ценности,
          экстерьер, происхождение и документы. Это решение владельца данных, и снять его
          может только он.
        </p>
      </section>

      {/* --------------------- Что всё-таки видно в книге -------------------- */}
      <section className="card mt-6">
        <h2 className="panel-heading">Что открыто в книге</h2>
        <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
          Эти сведения хозяйство показывает всем — они же стоят в строке списка. Ничего
          сверх этого страница не скрывает.
        </p>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <Fact label="Владелец" value={<Link href={backToOwner} className="underline underline-offset-4 hover:text-forest-500">{ownerName}</Link>} />
          <Fact label="Пол" value={SEXES.find((o) => o.value === animal.sex)?.full ?? '—'} />
          <Fact label="Половозрастная группа" value={labelOf(AGE_GROUPS, animal.ageGroup)} />
          <Fact label="Состояние" value={STATES.find((o) => o.value === animal.state)?.full ?? '—'} />

          <Fact label="Удой, л" value={nf(s?.milkYield)} />
          <Fact label="Жир, %" value={nf(s?.fatPercent, 2)} />
          <Fact label="Белок, %" value={nf(s?.proteinPercent, 2)} />
          <Fact label="ИПЦ" value={signed(animal.ipc ?? null)} />
        </div>

        <p className="mt-5 text-[13px] text-ink-500">Обновлено {dateRu(animal.updatedAt)}</p>
      </section>

      {/* ------------------------- Что с этим делать ------------------------ */}
      {state && request ? (
        <section className={`mt-6 rounded-card p-7 sm:p-8 ${state.tone}`}>
          <h2 className="text-[20px] font-medium leading-tight">{state.title}</h2>
          <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed">{state.text}</p>

          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <Fact label="Цель запроса" value={purposeLabel} />
            <Fact label="Отправлен" value={dateRu(request.createdAt)} />
            <Fact label="Решение принято" value={dateRu(request.decidedAt)} />
          </dl>

          {request.response && (
            <p className="mt-5 rounded-xl bg-white/70 px-4 py-3 text-[14px] leading-relaxed">
              <span className="block text-ink-500">Ответ хозяйства</span>
              {request.response}
            </p>
          )}
        </section>
      ) : signedIn ? (
        <div className="mt-6">
          <AccessRequestForm animalId={animal.id} ownerName={ownerName} />
        </div>
      ) : (
        <section className="card mt-6">
          <h2 className="panel-heading">Запросить доступ у хозяйства</h2>
          <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
            Запрос отправляется от лица организации: хозяйству важно знать, кто и зачем
            смотрит его данные. Поэтому нужен вход — анонимный запрос ему не о чем
            рассмотреть. Регистрация бесплатная и занимает пару минут.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/register?next=/animals/${animal.id}`} className="btn btn-accent">
              Зарегистрироваться
            </Link>
            <Link href={`/login?next=/animals/${animal.id}`} className="btn btn-brand">
              Войти
            </Link>
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-ink-500">
            Вход сам по себе не открывает закрытые карточки — он даёт возможность
            обратиться к владельцу.
          </p>
        </section>
      )}

      {/* --------------------------- Похожие записи -------------------------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="text-[22px] font-medium leading-tight">Похожие животные с открытыми данными</h2>
            <p className="mt-1.5 text-[14px] text-ink-500">
              Тот же пол и половозрастная группа — карточки открыты полностью
            </p>
          </div>
          <Link href={similarHref} className="text-[15px] underline underline-offset-4 hover:text-forest-500">
            Все похожие в книге →
          </Link>
        </div>

        {similar.length === 0 ? (
          <p className="mt-5 rounded-card bg-white p-6 text-[15px] text-ink-500 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
            Открытых записей с такими же признаками сейчас нет.{' '}
            <Link href="/#results" className="underline underline-offset-4">
              Вернуться ко всей книге
            </Link>
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((a) => {
              const owner =
                typeof a.owner === 'object' && a.owner ? a.owner.shortName || a.owner.name : '—'
              const ipc = a.ipc ?? null
              return (
                <li
                  key={a.id}
                  className="relative rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-shadow hover:shadow-[0_6px_18px_rgb(23_24_26_/_0.12)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/animals/${a.id}`} className="row-link text-[17px] font-medium leading-tight">
                        {a.name ?? `№ ${a.identNumber}`}
                      </Link>
                      <p className="mt-0.5 text-[13px] tabular-nums text-ink-500">
                        № {a.identNumber}
                      </p>
                    </div>
                    <div className="flex-none text-right">
                      <p className="text-[12px] text-ink-500">ИПЦ</p>
                      <p
                        className={`text-[17px] font-medium tabular-nums ${
                          ipc !== null && ipc < 0 ? 'text-[#c0392b]' : 'text-forest-600'
                        }`}
                      >
                        {signed(ipc)}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3">
                    <div>
                      <dt className="text-[11px] leading-tight text-ink-500">Удой, л</dt>
                      <dd className="mt-0.5 text-[14px] tabular-nums">{nf(a.summary?.milkYield)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] leading-tight text-ink-500">Жир, %</dt>
                      <dd className="mt-0.5 text-[14px] tabular-nums">{nf(a.summary?.fatPercent, 2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] leading-tight text-ink-500">Белок, %</dt>
                      <dd className="mt-0.5 text-[14px] tabular-nums">
                        {nf(a.summary?.proteinPercent, 2)}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 truncate text-[13px] text-ink-500" title={owner}>
                    {owner}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
