import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { FarmNav } from '@/components/FarmNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProfileEditor } from '@/components/ProfileEditor'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { ASSOCIATION_PROFILE, computeIndex } from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import { CorrelatedResponse } from '@/components/CorrelatedResponse'
import { profileOfDoc, sharesOf } from '@/lib/index-profiles'
import type { Animal, IndexProfile as IndexProfileDoc, Organization } from '@/payload-types'
import type { TraitKey } from '@/lib/breeding-index'
import { plural } from '@/lib/format'

export const metadata: Metadata = { title: 'Настройка профиля индекса' }
export const dynamic = 'force-dynamic'

/** Сколько животных берём на пересчёт для сравнения порядка. */
const SAMPLE = 300

export default async function EditIndexProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect(`/login?next=/account/indices/${id}`)

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null

  const payload = await getClient()
  let doc: IndexProfileDoc
  try {
    doc = (await payload.findByID({
      collection: 'index-profiles',
      id,
      overrideAccess: true,
    })) as IndexProfileDoc
  } catch {
    notFound()
  }

  const owner =
    typeof doc.organization === 'object' && doc.organization ? doc.organization.id : doc.organization
  if (!org || String(owner) !== String(org.id)) notFound()

  const profile = profileOfDoc(doc)
  const base = await loadActiveBase(payload)

  /*
   * Порядок животных по этому профилю против стандартного.
   *
   * Без него настройка весов остаётся упражнением в арифметике: видно сумму,
   * не видно последствий. Здесь сразу читается, кого профиль поднял и кого
   * опустил — а это и есть вопрос, ради которого профиль заводят.
   */
  const herd = await payload.find({
    collection: 'animals',
    where: { owner: { equals: org.id } },
    depth: 0,
    limit: SAMPLE,
    overrideAccess: true,
  })
  const animals = herd.docs as Animal[]

  const scored = animals.map((a) => ({
    animal: a,
    own: computeIndex(a, profile, base).value,
    std: computeIndex(a, ASSOCIATION_PROFILE, base).value,
  }))

  const rankOf = (list: typeof scored, pick: (s: (typeof scored)[number]) => number) => {
    const order = [...list].sort((a, b) => pick(b) - pick(a))
    return new Map(order.map((s, i) => [s.animal.id, i + 1]))
  }
  const ownRank = rankOf(scored, (s) => s.own)
  const stdRank = rankOf(scored, (s) => s.std)

  const top = [...scored].sort((a, b) => b.own - a.own).slice(0, 10)

  const official = Object.fromEntries(sharesOf(ASSOCIATION_PROFILE).map((s) => [s.key, s.share])) as Partial<
    Record<TraitKey, number>
  >

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="farm" />
        <FarmNav active="indices" />

        <Breadcrumbs
          items={[
            { label: 'Личный кабинет', href: '/account' },
            { label: 'Хозяйство', href: '/account?tab=farm' },
            { label: 'Профили ИПЦ', href: '/account/indices' },
            { label: doc.name },
          ]}
        />

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">{doc.name}</h1>
            <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
              Веса отвечают на вопрос, за что хозяйство готово платить. Меняются они редко:
              каждое изменение переставляет животных в списке, и решение о нём принимают
              на уровне холдинга. База сравнения — {base.version}.
            </p>
          </div>
          {doc.isDefault && (
            <span className="rounded-md bg-brand-50 px-3 py-1.5 text-[13px] text-forest-600">
              основной профиль хозяйства
            </span>
          )}
        </div>

        <ProfileEditor
          profile={{
            id: doc.id,
            name: doc.name,
            hint: doc.hint ?? '',
            kind: (doc.kind ?? 'selection') as 'selection' | 'economic',
            weights: profile.weights,
            isDefault: Boolean(doc.isDefault),
          }}
          official={official}
        />

        <CorrelatedResponse profile={profile} base={base} />

        {/* --------------------- Что профиль делает со стадом ----------------- */}
        <section className="mt-10">
          <h2 className="text-[22px] font-medium leading-tight">Кого профиль поднимает</h2>
          <p className="mt-1.5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            Десятка лучших по сохранённой версии профиля и её же места по стандартному
            индексу Ассоциации. Сравнение считается по {animals.length}{' '}
            {plural(animals.length, 'животному', 'животным', 'животным')} хозяйства и обновляется
            после сохранения.
          </p>

          {scored.length === 0 ? (
            <p className="mt-5 rounded-card bg-white p-6 text-[15px] text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
              В стаде пока нет записей — сравнивать нечего.{' '}
              <Link href="/account/import" className="underline underline-offset-4">
                Импорт данных
              </Link>
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="data-table w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className="w-[64px] text-right">Место</th>
                    <th className="text-left">Животное</th>
                    <th className="w-[120px] text-right">По профилю</th>
                    <th className="w-[130px] text-right">По ИПЦ Ассоциации</th>
                    <th className="w-[110px] text-right">Сдвиг</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((s, i) => {
                    const shift = (stdRank.get(s.animal.id) ?? 0) - (ownRank.get(s.animal.id) ?? 0)
                    return (
                      <tr key={s.animal.id}>
                        <td className="text-right tabular-nums text-ink-500">{i + 1}</td>
                        <td>
                          <Link
                            href={`/animals/${s.animal.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {s.animal.name ?? `№ ${s.animal.identNumber}`}
                          </Link>
                          <span className="ml-2 text-[13px] tabular-nums text-ink-500">
                            {s.animal.identNumber}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">
                          {s.own > 0 ? '+' : ''}
                          {Math.round(s.own)}
                        </td>
                        <td className="text-right tabular-nums text-ink-500">
                          {s.std > 0 ? '+' : ''}
                          {Math.round(s.std)} · {stdRank.get(s.animal.id)} место
                        </td>
                        <td
                          className={`text-right tabular-nums ${
                            shift > 0 ? 'text-forest-600' : shift < 0 ? 'text-[#c0392b]' : 'text-ink-500'
                          }`}
                        >
                          {shift > 0 ? `+${shift}` : shift === 0 ? '—' : shift}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  )
}

