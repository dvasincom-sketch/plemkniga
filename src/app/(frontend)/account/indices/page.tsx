import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProfileWeights } from '@/components/ProfileWeights'
import { CreateProfile } from '@/components/CreateProfile'
import { getClient, getCurrentUser } from '@/lib/payload'
import { ASSOCIATION_PROFILE } from '@/lib/breeding-index'
import { ECONOMIC_ASSUMPTIONS } from '@/lib/economics'
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
 * Национальные индексы построены на средней экономике отрасли, а у конкретного
 * хозяйства она другая: где-то молоко идёт на сыр и белок дороже жира, где-то
 * узкое место — выбытие первотёлок, где-то переполненный роддом делает лёгкость
 * отёла критичной. Профиль позволяет назвать это узкое место числами и получить
 * рейтинг животных под него.
 *
 * Страница отвечает на три вопроса подряд: по какому профилю сейчас считается
 * индекс, какие профили есть готовыми, как сделать свой. Готовые профили
 * не только показаны — с них начинается свой: набирать одиннадцать весов
 * с чистого листа мало кто станет.
 */

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
          набор весов уровня хозяйства: его настраивает главный генетик, а зоотехники
          отделений работают с готовым.{' '}
          <Link href="/animals" className="underline underline-offset-4 hover:text-forest-500">
            Как считается индекс
          </Link>{' '}
          — в описании формулы.
        </p>

        {/* ------------------------- Основной профиль ------------------------ */}
        <section className="mt-8 rounded-card bg-forest-500 p-7 text-white sm:p-8">
          <p className="text-[13px] uppercase tracking-wide text-white/70">
            По этому профилю считается индекс
          </p>
          <h2 className="mt-2 text-[24px] font-medium leading-tight sm:text-[28px]">
            {active.name}
          </h2>
          {active.hint && (
            <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-white/90">
              {active.hint}
            </p>
          )}
          <p className="mt-4 text-[13px] text-white/70">
            База сравнения {base.version}
            {defaultDoc ? ` · изменён ${dateRu(defaultDoc.updatedAt)}` : ' · профиль Ассоциации'}
          </p>

          {defaultDoc && (
            <form action={setDefaultProfileAction} className="mt-6">
              <input type="hidden" name="key" value="association" />
              <button
                type="submit"
                className="text-[14px] text-white/80 underline underline-offset-4 hover:text-white"
              >
                Вернуться к стандартному профилю Ассоциации
              </button>
            </form>
          )}
        </section>

        {/* --------------------------- Свои профили -------------------------- */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h2 className="text-[22px] font-medium leading-tight">Профили хозяйства</h2>
              <p className="mt-1.5 text-[14px] text-ink-500">
                Видны только вашему хозяйству: набор весов выдаёт вашу экономику
              </p>
            </div>
          </div>

          {!org ? (
            <p className="mt-5 rounded-card bg-white p-6 text-[15px] leading-relaxed text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
              Профиль принадлежит хозяйству, а ваша учётная запись пока не привязана
              к организации. Заполните реквизиты в{' '}
              <Link href="/account/profile" className="underline underline-offset-4">
                профиле пользователя
              </Link>
              .
            </p>
          ) : docs.length === 0 ? (
            <p className="mt-5 rounded-card bg-white p-6 text-[15px] leading-relaxed text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
              Своих профилей пока нет — индекс считается по стандартному профилю Ассоциации.
              Проще всего начать не с чистого листа, а взять за основу готовый профиль ниже
              и поправить в нём два-три веса.
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((doc) => {
                const p = profileOfDoc(doc)
                const isActive = activeKey === ownKey(doc.id)
                return (
                  <li
                    key={doc.id}
                    className={`flex flex-col rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] ${
                      isActive ? 'ring-2 ring-forest-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[17px] font-medium leading-tight">{doc.name}</h3>
                      {isActive && (
                        <span className="flex-none rounded-md bg-brand-50 px-2 py-0.5 text-[12px] text-forest-600">
                          основной
                        </span>
                      )}
                    </div>
                    {doc.hint && (
                      <p className="mt-1.5 text-[13px] leading-snug text-ink-500">{doc.hint}</p>
                    )}

                    <div className="mt-4 flex-1">
                      <ProfileWeights profile={p} compare={ASSOCIATION_PROFILE} limit={5} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-4 text-[14px]">
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
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {org && (
            <div className="mt-5">
              <CreateProfile />
            </div>
          )}
        </section>

        {/* ------------------------- Готовые профили ------------------------- */}
        {PROFILE_GROUPS.map((group) => (
          <section key={group.key} className="mt-10">
            <h2 className="text-[22px] font-medium leading-tight">{group.title}</h2>
            <p className="mt-1.5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              {group.hint}
            </p>

            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.profiles.map((p) => (
                <li
                  key={p.key}
                  className="flex flex-col rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]"
                >
                  <h3 className="text-[17px] font-medium leading-tight">{p.name}</h3>
                  <p className="mt-1.5 text-[13px] leading-snug text-ink-500">{p.hint}</p>

                  <div className="mt-4 flex-1">
                    <ProfileWeights
                      profile={p}
                      compare={p.key === 'association' ? undefined : ASSOCIATION_PROFILE}
                      limit={5}
                    />
                  </div>

                  {org && (
                    <div className="mt-5 border-t border-ink-100 pt-4">
                      <CreateProfile from={p.key} label="Взять за основу" name={`${p.name} — наш вариант`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* --------------------- Экономика под рублями ------------------------ */}
        <details className="mt-10 rounded-card bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
          <summary className="cursor-pointer text-[17px] font-medium">
            Из каких цен считается профиль «Прибыль, ₽ за жизнь»
          </summary>
          <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            Экономический индекс верен ровно настолько, насколько верны цены под ним. Поэтому
            они здесь открыты. Это допущения по рынку 2026 года, а не истина: у хозяйства цифры
            свои, и под них заводят собственный профиль.
          </p>

          <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {ECONOMIC_ASSUMPTIONS.map((a) => (
              <div key={a.label} className="border-b border-ink-100 pb-2">
                <dt className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span>{a.label}</span>
                  <span className="whitespace-nowrap font-medium tabular-nums">{a.value}</span>
                </dt>
                <dd className="mt-0.5 text-[12px] leading-snug text-ink-500">{a.note}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-5 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
            Композитам вымени и ног цена намеренно не назначена: их экономика уже учтена через
            здоровье вымени и долголетие. Дать им ещё и собственную цену значило бы посчитать
            одно и то же дважды — ошибка, которой в экономических индексах избегают в первую
            очередь.
          </p>
        </details>

        <p className="mt-10 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
          Национальные индексы даны приближением: пересчитать NM$ и TPI один в один нельзя —
          в оригиналах есть признаки, которых в системе нет (остаточное потребление корма,
          стельность тёлок, живучесть коров). Сравнивать по ним животных между собой можно,
          сверять число с официальным — нет.
        </p>
      </main>

      <SiteFooter />
    </>
  )
}
