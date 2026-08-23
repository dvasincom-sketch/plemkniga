import Link from 'next/link'
import { CERTIFICATE_KINDS, type Readiness } from '@/lib/certification'

/**
 * Блок «Документы животного»: два бланка, каждый со своим состоянием.
 *
 * Если документ выпустить нельзя, показывается не запрет, а разбор: какие
 * требования уже выполнены, какие нет и что именно сделать. Зоотехник видит
 * причину до нажатия кнопки, а не после.
 */

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
    <path
      d="m5.8 10.3 2.8 2.8 5.6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const Cross = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
    <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

function ReadinessCard({ animalId, readiness }: { animalId: number | string; readiness: Readiness }) {
  const meta = CERTIFICATE_KINDS[readiness.kind]
  const blockers = readiness.requirements.filter((r) => !r.ok)

  return (
    <div className="card flex flex-col">
      {/*
         Состояние документа стоит в правом верхнем углу — всегда, у обеих
         карточек.

         Здесь стоял `flex-wrap`, и он давал ровно то, чего не должно быть:
         у зоотехнического сертификата подзаголовок длиннее, чем у племенного
         свидетельства, и плашка съезжала под него, а у соседней карточки
         оставалась в шапке. Две карточки рядом сообщали одно и то же
         в двух разных местах.

         Причина не в длине текста, а в порядке действий флексбокса: строки
         он разбивает по **исходному** размеру элементов, то есть по длине
         подзаголовка в одну строку, и только потом ужимает то, что осталось
         в строке. Поэтому `min-w-0` на левом блоке перенос не отменял —
         к моменту переноса до сжатия дело ещё не доходило.

         Без `flex-wrap` перенос невозможен вовсе: левый блок ужимается
         и переносит текст внутри себя, плашка сохраняет размер (`flex-none`).
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[19px] font-medium leading-snug">{meta.title}</h3>
          <p className="mt-1 text-[13px] leading-snug text-ink-500">{meta.subtitle}</p>
        </div>

        <span
          className={`flex-none rounded-md px-2.5 py-1 text-[13px] font-medium ${
            readiness.ready ? 'bg-brand-50 text-forest-600' : 'bg-[#f0f0f0] text-ink-700'
          }`}
        >
          {readiness.ready ? 'Можно выпускать' : `${readiness.done} из ${readiness.total}`}
        </span>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink-700">{meta.short}</p>

      {readiness.ready ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/animals/${animalId}/certificate/${meta.slug}`} className="btn btn-brand">
            Открыть документ
          </Link>
          <span className="self-center text-[13px] text-ink-500">
            Откроется веб-страница — сохраните её в PDF печатью браузера
          </span>
        </div>
      ) : (
        <>
          <p className="mt-6 text-[14px] font-medium">
            Чего не хватает для выпуска — {blockers.length}:
          </p>

          <ul className="mt-3 space-y-3">
            {readiness.requirements.map((r) => (
              <li key={r.key} className="flex gap-2.5">
                <span className={`mt-0.5 flex-none ${r.ok ? 'text-forest-500' : 'text-[#c0392b]'}`}>
                  {r.ok ? <Check /> : <Cross />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[14px] leading-snug ${r.ok ? 'text-ink-500' : ''}`}>
                    {r.label}
                  </span>
                  {!r.ok && r.fix && (
                    <span className="mt-1 block text-[13px] leading-snug text-ink-500">{r.fix}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function CertificateSection({
  animalId,
  zootechnical,
  pedigree,
}: {
  animalId: number | string
  zootechnical: Readiness
  pedigree: Readiness
}) {
  return (
    <section className="mt-8">
      <h2 className="section-title mb-2">Документы животного</h2>
      <p className="mb-7 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
        Документы формируются из карточки в момент открытия — это всегда актуальные данные,
        а не заранее подготовленный файл. Выпускаются только для записей, верифицированных
        Ассоциацией: до этого данные не проверены, и печатать их нельзя.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReadinessCard animalId={animalId} readiness={zootechnical} />
        <ReadinessCard animalId={animalId} readiness={pedigree} />
      </div>
    </section>
  )
}
