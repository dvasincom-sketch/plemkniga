import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAnimalLocked, viewerOf } from '@/lib/visibility'
import {
  CERTIFICATE_KINDS,
  DOCUMENT_TYPE_OF,
  certificateReadiness,
  type CertificateKind,
} from '@/lib/certification'
import {
  buildCertificateView,
  readSnapshot,
  type CertificateNode,
  type CertificateView,
} from '@/lib/certificate-view'
import { verifyUrl } from '@/lib/certificate-check'
import { dateRu, nf, signed } from '@/lib/format'
import { PrintButton } from '@/components/PrintButton'
import type { Animal, Document } from '@/payload-types'

export const dynamic = 'force-dynamic'

/**
 * Документ животного как веб-страница.
 *
 * У страницы два состояния, и их нельзя путать.
 *
 * **Предпросмотр.** Документа ещё нет, бланк собирается из живой записи
 * в момент открытия. Он всегда актуален и ничего не удостоверяет — это
 * заготовка, по которой смотрят, что получится.
 *
 * **Выданный документ.** Есть запись в `documents` со снимком данных
 * на дату выпуска, и бланк рисуется **из снимка**. Пересчитали ИПЦ,
 * поправили кличку, сменили владельца — выданная бумага не меняется.
 * Иначе номер `ПС-2026-0001`, на который сослались в договоре, обозначал бы
 * каждый день новое.
 *
 * Отличить одно от другого можно глазами: у выданного стоит номер и дата
 * выдачи, у предпросмотра — предупреждение вместо них.
 *
 * Сохранить в PDF можно печатью браузера: служебные элементы скрыты
 * правилами `@media print`.
 */

type Params = { id: string; kind: string }
type Query = { document?: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { kind } = await params
  const meta = CERTIFICATE_KINDS[kind as CertificateKind]
  return { title: meta ? meta.title : 'Документ' }
}

const NOT_IN_MODEL = '—'

function Row({ n, label, value }: { n?: string; label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-ink-100 py-1.5 text-[13px] last:border-b-0">
      {n && <span className="w-6 flex-none tabular-nums text-ink-500">{n}</span>}
      <span className="w-64 flex-none text-ink-700">{label}</span>
      <span className="min-w-0 flex-1">{value ?? '—'}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 border-b border-ink-900 pb-1 text-[14px] font-medium uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Node({ node }: { node?: CertificateNode }) {
  return (
    <div className="flex min-h-[46px] flex-1 flex-col justify-center rounded border border-ink-100 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-ink-500">{node?.code ?? '—'}</span>
      <span className="text-[13px] font-medium leading-tight">{node?.name ?? '—'}</span>
      <span className="text-[11px] tabular-nums text-ink-700">{node?.identNumber ?? '—'}</span>
    </div>
  )
}

const byCode = (nodes: CertificateNode[]): Record<string, CertificateNode> => {
  const map: Record<string, CertificateNode> = {}
  for (const n of nodes) map[n.code] = n
  return map
}

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Query>
}) {
  const { id, kind } = await params
  const { document: documentParam } = await searchParams
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
  // Закрытая запись объясняет себя на своей странице, а не редиректом на вход
  if (isAnimalLocked(animal, viewerOf(user))) redirect(`/animals/${id}`)

  /*
   * Выданный документ ищется по адресу, а если его не назвали — по животному
   * и виду среди действующих.
   *
   * Второе нужно, чтобы ссылка из карточки не требовала знать номер записи,
   * а первое — чтобы отозванный документ всё-таки можно было открыть
   * по прямой ссылке: на него могли сослаться, и «страница не найдена»
   * на такой ссылке хуже, чем бланк с отметкой об отзыве.
   */
  let issued: Document | null = null
  if (documentParam) {
    issued = (await payload
      .findByID({ collection: 'documents', id: documentParam, depth: 0, overrideAccess: true })
      .catch(() => null)) as Document | null
    if (issued && String(issued.animal) !== String(animal.id) && typeof issued.animal === 'object') {
      if (issued.animal?.id !== animal.id) issued = null
    }
  } else {
    const found = await payload
      .find({
        collection: 'documents',
        where: {
          and: [
            { animal: { equals: animal.id } },
            { type: { equals: DOCUMENT_TYPE_OF[kind as CertificateKind] } },
            { issuedBy: { exists: true } },
            { 'revoked.at': { exists: false } },
          ],
        },
        sort: '-issuedAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    issued = ((found?.docs[0] as Document | undefined) ?? null) as Document | null
  }

  const snapshot = issued ? readSnapshot(issued.snapshot) : null

  /*
   * Предпросмотр проверяет готовность, выданный документ — нет.
   *
   * Требования проверяют **перед выпуском**. Проверять их у выданной бумаги
   * значит прятать её ровно тогда, когда данные животного изменились, —
   * то есть в единственном случае, ради которого снимок и заведён.
   */
  if (!issued) {
    const readiness = await certificateReadiness(payload, animal)
    if (!readiness[kind as CertificateKind].ready) redirect(`/animals/${id}?tab=documents`)
  }

  const view: CertificateView =
    snapshot ?? (await buildCertificateView(payload, animal, kind as CertificateKind))

  const nodes = byCode(view.nodes)
  const revokedAt = issued?.revoked?.at ?? null
  /** Документ выдан, но снимка у него нет — выпущен до появления снимков. */
  const staleIssued = Boolean(issued && !snapshot)

  /*
   * Квадрат рисуется на сервере в SVG, а не скриптом в браузере.
   *
   * Бланк печатают. Печать из браузера снимает то, что уже нарисовано,
   * и картинка, которую дорисовывает скрипт, на бумаге оказывается
   * то целой, то пустым местом — в зависимости от того, успел он
   * до печати или нет. SVG в разметке напечатается всегда и не потеряет
   * чёткости на любом размере бумаги.
   *
   * Ошибка проглатывается: бланк без квадрата хуже бланка с квадратом,
   * но неизмеримо лучше страницы, которая не открылась.
   */
  const publicCode = (issued as { publicCode?: string } | null)?.publicCode ?? null
  let qr: { svg: string; code: string } | null = null
  if (issued?.number && publicCode) {
    try {
      const QRCode = (await import('qrcode')).default
      const base = process.env.NEXT_PUBLIC_SERVER_URL || ''
      const svg = await QRCode.toString(verifyUrl(issued.number, publicCode, base), {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 108,
      })
      qr = { svg, code: publicCode }
    } catch {
      qr = null
    }
  }

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

      {revokedAt && (
        <p className="no-print mb-4 rounded-xl bg-[#fdecea] px-5 py-3.5 text-[15px]">
          <span className="font-medium">Документ отозван {dateRu(revokedAt)}.</span>{' '}
          {issued?.revoked?.reason
            ? `Причина: ${issued.revoked.reason}`
            : 'Причина не указана.'}{' '}
          Он показан таким, каким был выдан, — ссылаться на него нельзя.
        </p>
      )}

      <article className="doc-page rounded-card bg-white p-10 shadow-[0_2px_14px_rgb(23_24_26_/_0.08)] print:rounded-none print:p-0 print:shadow-none">
        {/* --------------------------- Шапка бланка -------------------------- */}
        <header className="border-b-2 border-ink-900 pb-4">
          <p className="text-[13px] leading-snug text-ink-700">
            Ассоциация производителей КРС голштинской породы
            <br />
            443109, Самарская обл., г. Самара, ул. Металлургическая, 92 · +7 846 931-25-95 ·
            info@holstein-russia.ru
          </p>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-[24px] font-medium leading-tight">{meta.title}</h1>
              {issued?.number && (
                <p className="mt-1 text-[16px] font-medium tabular-nums">№ {issued.number}</p>
              )}
            </div>

            {/*
               Квадрат проверки — на самом бланке, а не рядом со страницей.
               Уйдёт бумага — уйдёт и способ её проверить; распечатанное
               «откройте наш сайт» этого не заменяет.

               Только у выданного документа с кодом: предпросмотру проверять
               нечего, он не документ. У бумаг, выпущенных до появления
               проверки, кода нет — квадрата тоже, и это честнее, чем
               напечатать ведущий в никуда.
            */}
            {qr && issued?.number && (
              <div className="flex-none text-center">
                <div
                  className="inline-block"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: qr.svg }}
                />
                <p className="mt-1.5 text-[11px] leading-tight text-ink-700">
                  Проверка подлинности
                  <br />
                  <span className="font-mono text-[12px] tracking-[0.14em]">{qr.code}</span>
                </p>
              </div>
            )}
          </div>

          <p className="mt-1 text-[13px] text-ink-700">{meta.subtitle}</p>

          {issued ? (
            <p className="mt-3 text-[12px] text-ink-500">
              Выдан {dateRu(issued.issuedAt)}. Данные приведены на дату выдачи. Уровень
              достоверности записи на тот момент — {view.trustLevel}.
              {revokedAt && ` Документ отозван ${dateRu(revokedAt)}.`}
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-ink-500">
              <span className="font-medium">Предпросмотр, не выданный документ.</span> Собран{' '}
              {dateRu(view.builtAt)} из текущих данных и меняется вместе с ними. Уровень
              достоверности записи — {view.trustLevel}.
            </p>
          )}

          {staleIssued && (
            <p className="no-print mt-2 text-[12px] leading-snug text-[#c0392b]">
              У этого документа нет снимка данных — он выпущен до того, как снимки стали
              сохраняться. Бланк собран из текущих данных и мог разойтись с тем, что было
              напечатано при выдаче.
            </p>
          )}
        </header>

        {/* --------------------------- Идентификация ------------------------- */}
        <Block title="Идентификация животного">
          <Row n="1" label="Кличка" value={view.name} />
          <Row n="2" label="Индивидуальный номер" value={view.identNumber} />
          <Row n="3" label="Порода" value={view.breed} />
          <Row n="4" label="Пол" value={view.sex} />
          <Row n="5" label="Возрастная группа" value={view.ageGroup} />
          <Row n="6" label="Дата рождения" value={dateRu(view.birthDate)} />
          <Row n="7" label="Страна рождения" value={NOT_IN_MODEL} />
          <Row n="8" label="Номер и раздел племенной книги" value={NOT_IN_MODEL} />
          <Row n="9" label="Бирка / чип" value={view.tag} />
        </Block>

        {/* ---------------------------- Владелец ----------------------------- */}
        <Block title="Владелец и селекционер">
          <Row
            n="10"
            label="Владелец"
            value={[view.owner, view.ownerAddress].filter(Boolean).join(', ')}
          />
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
              value={view.coi === null ? '—' : `${view.coi.toLocaleString('ru-RU')} %`}
            />
            <Row label="Линия" value={view.line} />
          </div>
        </Block>

        {/* ------------------------ Достоверность и генетика ----------------- */}
        <Block title="Тест на достоверность происхождения">
          {view.dnaTests.length === 0 && <Row label="Данные" value="—" />}
          {view.dnaTests.map((t, i) => (
            <Row key={i} label={t.label} value={t.value} />
          ))}
          <Row label="Генетические маркеры" value={view.markers} />
        </Block>

        {/* ------------------------------ Оценка ----------------------------- */}
        <Block title="Племенная ценность">
          <Row label="ИПЦ" value={signed(view.ipc)} />
          <Row label="Дата генетической оценки" value={dateRu(view.evaluationDate)} />
          <Row label="Достоверность оценки, R %" value={nf(view.reliability, 1)} />
          <Row label="Процентиль" value={nf(view.percentile, 0)} />
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
                {view.lactations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-ink-500">
                      Данных о лактациях нет
                    </td>
                  </tr>
                )}
                {view.lactations.map((l, i) => (
                  <tr key={i} className="border-b border-ink-100">
                    <td className="py-1.5 tabular-nums">{l.number ?? i + 1}</td>
                    <td>{dateRu(l.calvingDate)}</td>
                    <td className="text-right tabular-nums">{l.dd ?? '—'}</td>
                    <td className="text-right tabular-nums">{nf(l.milk, 0)}</td>
                    <td className="text-right tabular-nums">{nf(l.fat, 2)}</td>
                    <td className="text-right tabular-nums">{nf(l.protein, 2)}</td>
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
          <Row
            label="Дата выдачи"
            value={issued ? dateRu(issued.issuedAt) : 'документ не выдан'}
          />
          <Row label="Руководитель" value={NOT_IN_MODEL} />
          <div className="mt-8 flex gap-16 text-[13px] text-ink-500">
            <span className="w-52 border-t border-ink-900 pt-1">подпись</span>
            <span className="w-52 border-t border-ink-900 pt-1">печать</span>
          </div>
        </Block>

        <footer className="mt-10 border-t border-ink-100 pt-4 text-[11px] leading-relaxed text-ink-500">
          Прочерк в поле означает, что показатель ещё не ведётся в системе — перечень таких полей
          и план их появления описаны в документе «Готовность системы к выпуску сертификатов».
          {issued
            ? ' Документ выдан Ассоциацией; данные приведены на дату выдачи и позже не менялись.'
            : ' Это предпросмотр: он собран из текущих данных и документом не является.'}
        </footer>
      </article>
    </main>
  )
}
