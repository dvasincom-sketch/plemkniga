import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { CabinetPage } from '@/components/CabinetPage'
import { ColumnDecision } from '@/components/ColumnDecision'
import { ColumnReopen } from '@/components/ColumnReopen'
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

/**
 * Цвет плашки закрытого решения — по исходу, а не по «разобрано».
 *
 * «Завели признак» и «отклонили» это противоположные ответы, и красить их
 * одинаково значило бы прятать главное за фактом разбора. Зелёное —
 * книга приняла; серое — отказала; тёмно-зелёное — узнала своё под чужим
 * именем.
 */
const DECISION_CHIP: Record<string, string> = {
  accepted: 'bg-brand-100 text-forest-700',
  declined: 'bg-ink-100 text-ink-700',
  duplicate: 'bg-[#e3f0ea] text-forest-700',
}

/** Имя решившего — фамилия и имя, иначе почта. Так же в журнале операций. */
const personName = (u: unknown): string | null => {
  if (!u || typeof u !== 'object') return null
  const user = u as { lastName?: string; firstName?: string; email?: string; position?: string }
  const fio = [user.lastName, user.firstName].filter(Boolean).join(' ')
  return fio || user.email || null
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

  /**
   * Закрытое решение — другая сущность, и выглядит иначе.
   *
   * ## Что здесь главное
   *
   * У неразобранной колонки главное — примеры значений: по ним принимают
   * решение. У разобранной решение уже принято, и главными становятся три
   * других вещи: **какое** решение, **кто** его принял и **когда**. Раньше
   * первого не было видно за общим видом карточки, а второго и третьего
   * не было вовсе — поля «кто решил» и «когда» заполнялись и нигде
   * не показывались.
   *
   * Спросят об этом рано или поздно обязательно: колонка приезжает снова
   * через полгода, и первый вопрос будет не «что решили», а «кто решил
   * и не пора ли пересмотреть».
   *
   * ## Почему не карточка
   *
   * Белая карточка на сером фоне означает «здесь работают». Закрытое
   * решение — запись, а не работа: рамка на фоне страницы, без заливки
   * и без тени. Отличие видно раньше, чем прочитан заголовок, — а именно
   * это и требовалось: два раздела списка перестали выглядеть одинаково.
   *
   * ## Почему числа ужаты в строку
   *
   * Три крупные плитки нужны, когда по ним решают. Здесь они справка:
   * «приходила трижды, 240 строк, два хозяйства» — одна строка мелким.
   */
  const closedCard = (d: (typeof docs)[number]) => {
    const status = d.status ?? 'new'
    const samples = ((d.samples as string[] | null | undefined) ?? []).filter(Boolean)
    const orgs = ((d.organizations ?? []) as ({ name?: string } | number)[])
      .map((o) => (typeof o === 'number' ? null : o.name))
      .filter(Boolean)
    const who = personName(d.decision?.decidedBy)

    return (
      <article key={d.id} className="rounded-card border border-ink-100 px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h3 className="text-[19px] font-medium leading-snug">«{d.title}»</h3>
          <span
            className={`inline-block whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] leading-snug ${
              DECISION_CHIP[status] ?? 'bg-ink-100 text-ink-700'
            }`}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>

        {/*
           Кто и когда — строкой сразу под решением, а не в подвале.
           Это подпись под выводом; подпись стоит рядом с выводом.
        */}
        <p className="mt-2 text-[14px] leading-snug text-ink-700">
          {who ? <>Решил {who}</> : <span className="cell-flag">Кто решил — не записано</span>}
          {d.decision?.decidedAt && (
            <>
              {' · '}
              <Moment iso={d.decision.decidedAt} />
            </>
          )}
        </p>

        {d.decision?.comment && (
          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            {d.decision.comment}
          </p>
        )}

        {d.mapsTo && (
          <p className="mt-2 text-[14px] text-ink-500">
            Ключ известного признака: <span className="font-mono text-[13px]">{d.mapsTo}</span>
          </p>
        )}

        <p className="mt-3 text-[13px] leading-snug text-ink-500">
          Приходила {d.seenTimes ?? 0} раз · строк со значением {d.rowsWithValue ?? 0}
          {orgs.length > 0 && <> · {orgs.join(', ')}</>}
          {d.lastSeenAt && (
            <>
              {' · '}в последний раз <Moment iso={d.lastSeenAt} />
            </>
          )}
        </p>

        {samples.length > 0 && (
          <p className="mt-3 overflow-x-auto font-mono text-[13px] leading-relaxed text-ink-500">
            {samples.join(' · ')}
          </p>
        )}

        <ColumnReopen id={d.id as number} />
      </article>
    )
  }

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
              <p className="mt-1 stat-value text-[24px] leading-none">{s.value}</p>
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

      <CabinetPage
        nav={<AssociationNav active="columns" />}
        title="Новые колонки"
        intro={
          <>
            Заголовки, которых книга не знает, но которые хозяйства присылают. Раньше такие
            колонки просто не принимались; теперь они сохраняются вместе с примерами значений
            и ждут решения. Числа из них в карточках не показываются: признак — это не столбец,
            а шкала с границами, полюсами и наследуемостью, и до тех пор, пока всего этого нет,
            показывать значения значило бы выдавать их за оценку.
          </>
        }
      >
        <div className="mt-8">
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
                <p className="-mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                  Записи, а не работа. Каждая закрыта для правки и подписана тем, кто её
                  принял: когда та же колонка приедет снова, спросят не только «что решили»,
                  но и «кто решил и не пора ли пересмотреть». Чтобы изменить решение,
                  его нужно сперва вернуть в разбор.
                </p>
                {decided.map(closedCard)}
              </section>
            )}
          </>
        )}
        </div>
      </CabinetPage>

      <SiteFooter />
    </>
  )
}
