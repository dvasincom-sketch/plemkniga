import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProfileWeights } from '@/components/ProfileWeights'
import { ProfileComparison } from '@/components/ProfileComparison'
import { EconomicAssumptions } from '@/components/EconomicAssumptions'
import { CreateProfile } from '@/components/CreateProfile'
import { getClient, getCurrentUser } from '@/lib/payload'
import { ASSOCIATION_PROFILE, type IndexProfile } from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import { PROFILE_GROUPS, loadOwnProfiles, ownKey, profileOfDoc } from '@/lib/index-profiles'
import { setDefaultProfileAction } from '@/actions/index-profiles'
import { dateRu } from '@/lib/format'
import type { Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Профили индекса' }
export const dynamic = 'force-dynamic'

/**
 * Профили весов индекса племенной ценности.
 *
 * Страница отвечает на четыре вопроса, и порядок разделов — это они:
 * по какому профилю считается индекс сейчас, какие профили есть у хозяйства,
 * какие есть готовыми, чем они отличаются друг от друга.
 *
 * Форма у всех разделов одна: слева заголовок с пояснением, справа карточки.
 * Разделы разной величины — в одном профиль единственный, в другом три, —
 * и без общей сетки они выглядели бы разнородными кусками, а раздел
 * с одной карточкой оставлял бы пустую строку во всю ширину.
 *
 * Пояснения живут рядом с тем, что объясняют: цены — внутри экономического
 * профиля, оговорка про приближения — внутри национальных. Вынесенные вниз
 * страницы, они относились ко всему сразу и ни к чему конкретно.
 */

/** Раздел: заголовок слева, содержимое справа. */
function Band({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-10 grid gap-5 lg:grid-cols-[240px_1fr] lg:gap-8">
      <div>
        <h2 className="text-[20px] font-medium leading-tight">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{hint}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function ProfileCard({
  profile,
  name,
  hint,
  badge,
  footer,
  extra,
}: {
  profile: IndexProfile
  name: string
  hint?: string | null
  badge?: string
  footer?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] ${
        badge ? 'ring-2 ring-forest-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-medium leading-tight">{name}</h3>
        {badge && (
          <span className="flex-none rounded-md bg-brand-50 px-2 py-0.5 text-[12px] text-forest-600">
            {badge}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[13px] leading-snug text-ink-500">{hint}</p>}

      <div className="mt-4 flex-1">
        <ProfileWeights profile={profile} limit={5} />
      </div>

      {extra}

      {footer && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-4 text-[14px]">
          {footer}
        </div>
      )}
    </div>
  )
}

const CARD_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'

export default async function IndexProfilesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/account/indices')

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null

  const payload = await getClient()
  const [{ docs, defaultDoc }, base] = await Promise.all([
    loadOwnProfiles(org?.id),
    loadActiveBase(payload),
  ])
  const active = defaultDoc ? profileOfDoc(defaultDoc) : ASSOCIATION_PROFILE
  const activeKey = defaultDoc ? ownKey(defaultDoc.id) : 'association'

  const ownProfiles = docs.map(profileOfDoc)
  const builtinProfiles = PROFILE_GROUPS.flatMap((g) => [...g.profiles])

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="settings" />

        <Breadcrumbs
          items={[
            { label: 'Личный кабинет', href: '/account' },
            { label: 'Настройки', href: '/account?tab=settings' },
            { label: 'Профили индекса' },
          ]}
        />

        <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Профили индекса</h1>
        <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
          Индекс племенной ценности — взвешенная сумма оценок по признакам. Веса отвечают
          на вопрос, за что хозяйство готово платить: стандартный профиль Ассоциации
          сбалансирован по средней экономике отрасли, но у вас она своя. Профиль — именованный
          набор весов уровня хозяйства: его настраивает главный генетик, а зоотехники отделений
          работают с готовым.
        </p>

        {/*
           Полоса состояния, а не витрина. Раньше здесь стоял блок в треть
           экрана, повторявший карточку профиля ниже; смысла в нём было
           на одну строку — по какому профилю считается индекс.
        */}
        <section className="mt-7 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-card bg-forest-500 px-6 py-5 text-white">
          <div className="min-w-0">
            <p className="text-[13px] text-white/70">
              По этому профилю считается индекс в книге и в «Моих животных»
            </p>
            <p className="mt-1 text-[22px] font-medium leading-tight">{active.name}</p>
          </div>

          <div className="text-[13px] text-white/70">
            <p>
              База сравнения {base.version}
              {defaultDoc ? ` · изменён ${dateRu(defaultDoc.updatedAt)}` : ' · профиль Ассоциации'}
            </p>
            {defaultDoc && (
              <form action={setDefaultProfileAction} className="mt-1">
                <input type="hidden" name="key" value="association" />
                <button
                  type="submit"
                  className="text-white/80 underline underline-offset-4 hover:text-white"
                >
                  Вернуться к стандартному профилю Ассоциации
                </button>
              </form>
            )}
          </div>
        </section>

        {/* --------------------------- Свои профили -------------------------- */}
        <Band
          title="Профили хозяйства"
          hint="Видны только вашему хозяйству: набор весов выдаёт вашу экономику. Настраивает главный генетик, работают с готовым все"
          action={org ? <CreateProfile /> : undefined}
        >
          {!org ? (
            <p className="rounded-2xl bg-white p-5 text-[15px] leading-relaxed text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
              Профиль принадлежит хозяйству, а ваша учётная запись пока не привязана
              к организации. Заполните реквизиты в{' '}
              <Link href="/account/profile" className="underline underline-offset-4">
                профиле пользователя
              </Link>
              .
            </p>
          ) : docs.length === 0 ? (
            <p className="rounded-2xl bg-white p-5 text-[15px] leading-relaxed text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
              Своих профилей пока нет — индекс считается по стандартному профилю Ассоциации.
              Проще начать не с чистого листа, а взять за основу готовый профиль ниже
              и поправить в нём два-три веса.
            </p>
          ) : (
            <ul className={CARD_GRID}>
              {docs.map((doc) => {
                const p = profileOfDoc(doc)
                const isActive = activeKey === ownKey(doc.id)
                return (
                  <li key={doc.id}>
                    <ProfileCard
                      profile={p}
                      name={doc.name}
                      hint={doc.hint}
                      badge={isActive ? 'основной' : undefined}
                      extra={p.kind === 'economic' ? <EconomicAssumptions /> : undefined}
                      footer={
                        <>
                          <Link
                            href={`/account/indices/${doc.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            Изменить веса
                          </Link>
                          {!isActive && (
                            <form action={setDefaultProfileAction}>
                              <input type="hidden" name="key" value={ownKey(doc.id)} />
                              <button
                                type="submit"
                                className="underline underline-offset-4 hover:text-forest-500"
                              >
                                Сделать основным
                              </button>
                            </form>
                          )}
                        </>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </Band>

        {/* ------------------------- Готовые профили ------------------------- */}
        {PROFILE_GROUPS.map((group) => (
          <Band key={group.key} title={group.title} hint={group.hint}>
            <ul className={CARD_GRID}>
              {group.profiles.map((p) => (
                <li key={p.key}>
                  <ProfileCard
                    profile={p}
                    name={p.name}
                    hint={p.hint}
                    badge={activeKey === p.key ? 'основной' : undefined}
                    extra={p.kind === 'economic' ? <EconomicAssumptions /> : undefined}
                    footer={
                      org ? (
                        <CreateProfile
                          from={p.key}
                          label="Взять за основу"
                          name={`${p.name} — наш вариант`}
                        />
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ul>

            {/*
               Оговорка живёт внутри своего раздела. Вынесенная в конец
               страницы, она читалась как примечание ко всему списку профилей,
               хотя относится только к двум карточкам над ней.
            */}
            {group.key === 'national' && (
              <p className="mt-4 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
                Пересчитать NM$ и TPI один в один нельзя: в оригиналах есть признаки, которых
                в системе нет — остаточное потребление корма, стельность тёлок, живучесть коров.
                Сравнивать по ним животных между собой можно, сверять число с официальным — нет.
              </p>
            )}
          </Band>
        ))}

        {/* --------------------------- Сравнение ----------------------------- */}
        <ProfileComparison
          profiles={[...builtinProfiles, ...ownProfiles]}
          base={base}
          activeKey={activeKey}
        />
      </main>

      <SiteFooter />
    </>
  )
}
