import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ColumnDecision } from '@/components/ColumnDecision'
import { Moment } from '@/components/Moment'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'

export const metadata: Metadata = { title: 'Новые колонки' }
export const dynamic = 'force-dynamic'

/**
 * Что хозяйства присылают сверх реестра.
 *
 * ## Зачем этот экран
 *
 * Раньше неопознанный заголовок называли в отчёте загрузки и на этом
 * теряли. Теперь он попадает в карантин — но карантин без экрана разбора
 * это та же потеря, только медленнее: список, в который никто не смотрит.
 *
 * Разбирать такое в админке Payload можно, и первые дни так и было.
 * Но админка показывает поля, а решение принимается по другому: важно
 * не «какие поля у записи», а «что это за колонка, часто ли приходит
 * и на что похожи её значения». Это разные расстановки одних и тех же
 * данных.
 *
 * ## Порядок списка
 *
 * Неразобранные сверху и по частоте: колонка, пришедшая от семи хозяйств,
 * — это про признак, которого книге не хватает; колонка, пришедшая один
 * раз, — скорее опечатка в заголовке. Разобранные ниже и не прячутся:
 * решение полезно видеть, когда та же колонка приезжает снова.
 */

const STATUS_LABEL: Record<string, string> = {
  new: 'Не разобрана',
  accepted: 'Решено завести признак',
  declined: 'Отклонена',
  duplicate: 'Известный признак под другим названием',
}

const STATUS_TONE: Record<string, string> = {
  new: 'bg-accent-500',
  accepted: 'bg-brand-500',
  declined: 'bg-ink-300',
  duplicate: 'bg-forest-400',
}

export default async function ColumnsPage() {
  await requireAssociation()
  const payload = await getClient()

  const { docs } = await payload.find({
    collection: 'pending-columns',
    limit: 200,
    depth: 1,
    /*
     * Порядок: сначала неразобранные, внутри — по частоте. Payload
     * сортирует по одному полю, поэтому частота здесь, а разделение
     * по статусу — ниже, разбивкой списка надвое. Так честнее, чем
     * составной ключ, которого база всё равно не даст.
     */
    sort: '-seenTimes',
    overrideAccess: true,
  })

  const fresh = docs.filter((d) => (d.status ?? 'new') === 'new')
  const decided = docs.filter((d) => (d.status ?? 'new') !== 'new')

  const card = (d: (typeof docs)[number]) => {
    const samples = ((d.samples as string[] | null | undefined) ?? []).filter(Boolean)
    const orgs = ((d.organizations ?? []) as ({ name?: string } | number)[])
      .map((o) => (typeof o === 'number' ? null : o.name))
      .filter(Boolean)

    return (
      <article key={d.id} className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="panel-heading mb-0 flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                STATUS_TONE[d.status ?? 'new'] ?? 'bg-ink-300'
              }`}
            />
            «{d.title}»
          </h2>
          <p className="text-[13px] text-ink-500">
            {STATUS_LABEL[d.status ?? 'new'] ?? d.status}
            {d.dataset ? ` · в наборе «${d.dataset}»` : ''}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Раз приходила', value: String(d.seenTimes ?? 0) },
            { label: 'Строк со значением', value: String(d.rowsWithValue ?? 0) },
            { label: 'Хозяйств', value: String(orgs.length || '—') },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-canvas px-4 py-3.5">
              <p className="text-[13px] leading-snug text-ink-500">{s.label}</p>
              <p className="mt-1 text-[24px] font-medium leading-none tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {/*
           Примеры значений — главное на этом экране, важнее имени колонки.
           По заголовку «БАЛ» не поймёт никто; по ряду «3, 5, 4, 6, 5» видно
           балльную шкалу, по «12.08.2024» — дату, по «да / нет» — признак
           наличия. Решение принимается по ним.
        */}
        {samples.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] text-ink-500">Примеры значений</p>
            <p className="mt-1 overflow-x-auto rounded-lg bg-canvas px-3 py-2 font-mono text-[13px] leading-relaxed">
              {samples.join(' · ')}
            </p>
          </div>
        )}

        {orgs.length > 0 && (
          <p className="mt-3 text-[13px] leading-snug text-ink-500">
            Присылали: {orgs.join(', ')}
          </p>
        )}

        <p className="mt-3 text-[13px] text-ink-500">
          {d.firstSeenAt && (
            <>
              Впервые <Moment iso={d.firstSeenAt} />
            </>
          )}
          {d.lastSeenAt && (
            <>
              {' · '}в последний раз <Moment iso={d.lastSeenAt} />
            </>
          )}
        </p>

        <ColumnDecision
          id={d.id as number}
          status={d.status ?? 'new'}
          comment={d.decision?.comment}
          mapsTo={d.mapsTo}
        />
      </article>
    )
  }

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <Breadcrumbs
          items={[
            { label: 'Кабинет Ассоциации', href: '/association' },
            { label: 'Новые колонки' },
          ]}
        />

        <h1 className="mb-2 mt-6 text-[30px] font-medium leading-tight">Новые колонки</h1>
        <p className="mb-6 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
          Заголовки, которых книга не знает, но которые хозяйства присылают. Раньше такие
          колонки просто не принимались; теперь они сохраняются вместе с примерами значений
          и ждут решения. Числа из них в карточках не показываются: признак — это не столбец,
          а шкала с границами, полюсами и наследуемостью, и до тех пор, пока всего этого нет,
          показывать значения значило бы выдавать их за оценку.
        </p>

        <AssociationNav active="columns" />

        {docs.length === 0 ? (
          <div className="card">
            <p className="text-[15px] leading-relaxed text-ink-700">
              Пока ничего: все заголовки в загруженных файлах книга узнала. Это не значит,
              что раздел не понадобится — первая же выгрузка из чужой программы обычно
              приносит два-три столбца сверх реестра.
            </p>
          </div>
        ) : (
          <>
            {fresh.length > 0 && (
              <section className="space-y-6">
                <h2 className="section-title">Ждут разбора — {fresh.length}</h2>
                {fresh.map(card)}
              </section>
            )}

            {decided.length > 0 && (
              <section className="mt-10 space-y-6">
                {/*
                   Разобранные не прячутся: когда та же колонка приезжает
                   снова, прежнее решение и его причина — первое, что нужно
                   увидеть. Спрятав их, мы заставили бы разбирать заново.
                */}
                <h2 className="section-title">Решения приняты — {decided.length}</h2>
                {decided.map(card)}
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </>
  )
}
