import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getClient, getCurrentUser } from '@/lib/payload'
import { buildPedigree, wrightInbreeding, type PedigreeNode } from '@/lib/pedigree'
import {
  CERTIFICATE_KINDS,
  certificateReadiness,
  type CertificateKind,
} from '@/lib/certification'
import { AGE_GROUPS, SEXES, labelOf } from '@/lib/dictionaries'
import { dateRu, nf, signed } from '@/lib/format'
import { PrintButton } from '@/components/PrintButton'
import type { Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

/**
 * Документ животного как веб-страница.
 *
 * Формируется в момент открытия из текущих данных — никакого заранее
 * подготовленного файла нет. Сохранить в PDF можно печатью браузера:
 * служебные элементы скрыты правилами `@media print`.
 *
 * Выпуск разрешён только при уровне достоверности 3 и выполнении остальных
 * требований бланка; иначе пользователя возвращает в карточку, где показан
 * разбор, чего именно не хватает.
 */

type Params = { id: string; kind: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { kind } = await params
  const meta = CERTIFICATE_KINDS[kind as CertificateKind]
  return { title: meta ? meta.title : 'Документ' }
}

const relName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = o.name ?? o.fullName ?? o.shortName
    if (typeof n === 'string' && n) return n
  }
  return '—'
}

const NOT_IN_MODEL = '—'

/* ------------------------------- разметка ------------------------------- */

function Row({ n, label, value }: { n?: string; label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-ink-100 py-2 last:border-b-0">
      {n && <span className="w-10 flex-none tabular-nums text-ink-500">{n}</span>}
      <span className="w-[46%] flex-none text-ink-700">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value ?? '—'}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="mb-2 border-b-2 border-ink-900 pb-1 text-[15px] font-medium uppercase tracking-[0.04em]">
        {title}
      </h2>
      <div className="text-[14px] leading-snug">{children}</div>
    </section>
  )
}

/** Один узел родословной в печатной форме. */
function Node({ node }: { node?: PedigreeNode }) {
  const ident = node?.animal?.identNumber ?? node?.text?.identNumber ?? null
  const name = node?.animal?.name ?? node?.text?.name ?? null

  return (
    <div className="flex min-h-[46px] flex-1 flex-col justify-center rounded border border-ink-100 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-ink-500">{node?.code ?? '—'}</span>
      <span className="text-[13px] font-medium leading-tight">{name ?? '—'}</span>
      <span className="text-[11px] tabular-nums text-ink-700">{ident ?? '—'}</span>
    </div>
  )
}

/** Плоский список узлов по коду — печатная родословная строится по сетке. */
const byCode = (roots: PedigreeNode[]): Record<string, PedigreeNode> => {
  const map: Record<string, PedigreeNode> = {}
  const walk = (nodes: PedigreeNode[]) => {
    for (const n of nodes) {
      map[n.code] = n
      walk(n.children)
    }
  }
  walk(roots)
  return map
}

/* --------------------------------- страница ------------------------------ */

export default async function CertificatePage({ params }: { params: Promise<Params> }) {
  const { id, kind } = await params
  const meta = CERTIFICATE_KINDS[kind as CertificateKind]
  if (!meta) notFound()

  const user = await getCurrentUser()
  const payload = await getClient()

  let animal: Animal | null = null
  try {
    animal = (await payload.findByID({
      collection: 'animals',
      id,
      depth: 2,
      overrideAccess: false,
      user,
    })) as Animal
  } catch {
    notFound()
  }
  if (!animal) notFound()
  if (!user && !animal.publicDetails) redirect('/login')

  const readiness = await certificateReadiness(payload, animal)
  const state = readiness[kind as CertificateKind]

  // Документ не выпускается — возвращаем в карточку, там показан разбор причин
  if (!state.ready) redirect(`/animals/${id}?tab=documents`)

  const roots = await buildPedigree(payload, animal, 3)
  const nodes = byCode(roots)
  const coi = await wrightInbreeding(payload, animal)

  const owner = relName(animal.owner)
  const ownerAddress =
    typeof animal.owner === 'object' && animal.owner ? (animal.owner.address ?? '') : ''

  const lactations = animal.lactations ?? []

  return (
    <main className="mx-auto max-w-[900px] px-5 py-8 print:max-w-none print:px-0 print:py-0">
      {/* ----------------------------- Панель ----------------------------- */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/animals/${id}?tab=documents`}
          className="text-[14px] text-ink-700 underline underline-offset-4 hover:text-ink-900"
        >
          ← Вернуться в карточку животного
        </Link>
        <PrintButton />
      </div>

      <article className="doc-page rounded-card bg-white p-10 shadow-[0_2px_14px_rgb(23_24_26_/_0.08)] print:rounded-none print:p-0 print:shadow-none">
        {/* --------------------------- Шапка бланка -------------------------- */}
        <header className="border-b-2 border-ink-900 pb-4">
          <p className="text-[13px] leading-snug text-ink-700">
            Ассоциация производителей КРС голштинской породы
            <br />
            443109, Самарская обл., г. Самара, ул. Металлургическая, 92 · +7 846 931-25-95 ·
            info@holstein-russia.ru
          </p>
          <h1 className="mt-4 text-[24px] font-medium leading-tight">{meta.title}</h1>
          <p className="mt-1 text-[13px] text-ink-700">{meta.subtitle}</p>
          <p className="mt-3 text-[12px] text-ink-500">
            Сформирован {dateRu(new Date().toISOString())} из данных информационной системы.
            Уровень достоверности записи — {animal.trustLevel ?? 0}.
          </p>
        </header>

        {/* --------------------------- Идентификация ------------------------- */}
        <Block title="Идентификация животного">
          <Row n="1" label="Кличка" value={animal.name ?? '—'} />
          <Row n="2" label="Индивидуальный номер" value={animal.identNumber} />
          <Row n="3" label="Порода" value={relName(animal.breed)} />
          <Row n="4" label="Пол" value={SEXES.find((s) => s.value === animal.sex)?.full ?? '—'} />
          <Row n="5" label="Возрастная группа" value={labelOf(AGE_GROUPS, animal.ageGroup)} />
          <Row n="6" label="Дата рождения" value={dateRu(animal.birthDate)} />
          <Row n="7" label="Страна рождения" value={NOT_IN_MODEL} />
          <Row n="8" label="Номер и раздел племенной книги" value={NOT_IN_MODEL} />
          <Row n="9" label="Бирка / чип" value={animal.altIds?.earTag || animal.altIds?.chipNumber || '—'} />
        </Block>

        {/* ---------------------------- Владелец ----------------------------- */}
        <Block title="Владелец и селекционер">
          <Row n="10" label="Владелец" value={[owner, ownerAddress].filter(Boolean).join(', ')} />
          <Row n="11" label="Селекционер" value={NOT_IN_MODEL} />
        </Block>

        {/* --------------------------- Происхождение ------------------------- */}
        <Block title="Происхождение">
          {/*
             Ряды растут слева направо: родители → деды → прадеды.
             Каждая колонка — flex-столбец, узлы делят высоту поровну,
             поэтому ряды выравниваются между собой без ручных отступов.
          */}
          <div
            className={`grid gap-2 ${
              kind === 'pedigree' ? 'grid-cols-[1fr_1fr_1.15fr]' : 'grid-cols-2'
            }`}
          >
            <div className="flex flex-col gap-2">
              {['О', 'М'].map((code) => (
                <Node key={code} node={nodes[code]} />
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {['ОО', 'МО', 'ОМ', 'ММ'].map((code) => (
                <Node key={code} node={nodes[code]} />
              ))}
            </div>

            {kind === 'pedigree' && (
              <div className="flex flex-col gap-2">
                {['ООО', 'МОО', 'ОМО', 'ММО', 'ООМ', 'МОМ', 'ОММ', 'МММ'].map((code) => (
                  <Node key={code} node={nodes[code]} />
                ))}
              </div>
            )}
          </div>

          <p className="mt-3 text-[12px] text-ink-500">
            Код читается справа налево: ОМ — отец матери, МОО — мать отца отца.
          </p>

          <div className="mt-4">
            <Row
              label="Коэффициент инбридинга (по Райту)"
              value={coi === null || coi === undefined ? '—' : `${coi.toLocaleString('ru-RU')} %`}
            />
            <Row label="Линия" value={relName(animal.line)} />
          </div>
        </Block>

        {/* ------------------------ Достоверность и генетика ----------------- */}
        <Block title="Тест на достоверность происхождения">
          {(animal.dnaTests ?? []).length === 0 && <Row label="Данные" value="—" />}
          {(animal.dnaTests ?? []).map((t, i) => (
            <Row
              key={t.id ?? i}
              label={`${t.type ?? 'ДНК-тест'} · ${dateRu(t.date)}`}
              value={`${t.result ?? '—'}${t.laboratory ? ` · ${relName(t.laboratory)}` : ''}`}
            />
          ))}
          <Row
            label="Генетические маркеры"
            value={[
              animal.genetics?.cvm ? `CVM: ${animal.genetics.cvm}` : null,
              animal.genetics?.blad ? `BLAD: ${animal.genetics.blad}` : null,
              animal.genetics?.dumps ? `DUMPS: ${animal.genetics.dumps}` : null,
              animal.genetics?.kappaCasein ? `κ-казеин: ${animal.genetics.kappaCasein}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          />
        </Block>

        {/* ------------------------------ Оценка ----------------------------- */}
        <Block title="Племенная ценность">
          <Row label="ИПЦ" value={signed(animal.ipc)} />
          <Row label="Дата генетической оценки" value={dateRu(animal.evaluationDate)} />
          <Row label="Достоверность оценки, R %" value={nf(animal.ipcDetails?.r, 1)} />
          <Row label="Процентиль" value={nf(animal.ipcDetails?.percentile, 0)} />
        </Block>

        {/* ------------------------ Продуктивность (для №3) ------------------ */}
        {kind === 'pedigree' && (
          <Block title="Продуктивность по лактациям">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-ink-900 text-left">
                  <th className="py-1.5">№</th>
                  <th>Отёл</th>
                  <th className="text-right">Дней</th>
                  <th className="text-right">Удой, кг</th>
                  <th className="text-right">Жир, %</th>
                  <th className="text-right">Белок, %</th>
                  <th className="text-right">Жир, кг</th>
                  <th className="text-right">Белок, кг</th>
                </tr>
              </thead>
              <tbody>
                {lactations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-ink-500">
                      Данных о лактациях нет
                    </td>
                  </tr>
                )}
                {lactations.map((l, i) => (
                  <tr key={l.id ?? i} className="border-b border-ink-100">
                    <td className="py-1.5 tabular-nums">{l.number ?? i + 1}</td>
                    <td>{dateRu(l.calvingDate)}</td>
                    <td className="text-right tabular-nums">{l.dd ?? '—'}</td>
                    <td className="text-right tabular-nums">{nf(l.milk305 ?? l.milkYield, 0)}</td>
                    <td className="text-right tabular-nums">{nf(l.fat305, 2)}</td>
                    <td className="text-right tabular-nums">{nf(l.protein305, 2)}</td>
                    <td className="text-right tabular-nums">{nf(l.fatKg, 1)}</td>
                    <td className="text-right tabular-nums">{nf(l.proteinKg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        {/* ---------------------------- Верификация -------------------------- */}
        <Block title="Верификация">
          <Row label="Выдано" value="г. Самара" />
          <Row label="Дата выдачи" value={dateRu(new Date().toISOString())} />
          <Row label="Руководитель" value={NOT_IN_MODEL} />
          <div className="mt-8 flex gap-16 text-[13px] text-ink-500">
            <span className="w-52 border-t border-ink-900 pt-1">подпись</span>
            <span className="w-52 border-t border-ink-900 pt-1">печать</span>
          </div>
        </Block>

        <footer className="mt-10 border-t border-ink-100 pt-4 text-[11px] leading-relaxed text-ink-500">
          Прочерк в поле означает, что показатель ещё не ведётся в системе — перечень таких полей
          и план их появления описаны в документе «Готовность системы к выпуску сертификатов».
          Документ сформирован автоматически и действителен на дату формирования.
        </footer>
      </article>
    </main>
  )
}
