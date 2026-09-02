import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { FilterChips } from '@/components/FilterChips'
import { RankingTable } from '@/components/RankingTable'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { ASSOCIATION_PROFILE, NATIONAL_PROFILES } from '@/lib/breeding-index'
import {
  RANKING_CATEGORIES,
  isRankingCategory,
  loadRanking,
  type RankingCategory,
} from '@/lib/ranking'
import { nf, pct, plural } from '@/lib/format'
import type { Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Рейтинг' }
export const dynamic = 'force-dynamic'

/**
 * Места животных хозяйства среди всей книги.
 *
 * ## Чем это отличается от «Профилей индекса»
 *
 * Тем же, чем «сколько у меня» отличается от «сколько у меня по сравнению
 * с другими». Своих животных хозяйство упорядочивает у себя в списке
 * и без Ассоциации; чего оно не может — узнать, что его лучшая тёлка
 * сорок седьмая по книге, а не первая в мире.
 *
 * Это и есть то, за что имеет смысл состоять в объединении: число,
 * которое невозможно посчитать в одиночку.
 *
 * ## Почему место считается по всему разряду, а фильтр применяется после
 *
 * Иначе получилась бы ложь ровно того сорта, ради борьбы с которым
 * рейтинг и заводится: первое место в собственном стаде выданное
 * за первое место в стране. Разбор — в `lib/ranking.ts`, там же и запрос.
 *
 * ## Почему список не обрезан пятьюстами
 *
 * У Ассоциации это TOP-500 по всей книге, и потолок там осмыслен: ниже
 * пятисотого места список перестаёт быть новостью. Здесь показываются
 * все животные хозяйства, включая те, что стоят в шеститысячных местах, —
 * потому что зоотехнику как раз они и нужны: это кандидаты на выбраковку,
 * и прятать их значило бы оставить полезной только половину страницы.
 */

const PROFILES = [ASSOCIATION_PROFILE, ...NATIONAL_PROFILES]

export default async function FarmRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; profile?: string }>
}) {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой рейтинг
  denyAssociation(user)
  if (!user) redirect('/login?next=/account/ranking')

  const { tab, profile: profileParam } = await searchParams
  const category: RankingCategory = isRankingCategory(tab) ? tab : 'heifers-old'
  const profile = PROFILES.find((p) => p.key === profileParam) ?? ASSOCIATION_PROFILE

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null

  const payload = await getClient()

  /*
   * Два запроса, а не один с группировкой: знаменатель («сколько всего
   * в разряде») приходит из общего рейтинга, а строки — из суженного
   * по владельцу. Слить их в один запрос можно, но тогда полный рейтинг
   * пришлось бы вычитать целиком ради одного числа в его первой строке.
   */
  const ranking = org
    ? await loadRanking(payload, profile.key, category, {
        ownerId: org.id as number,
        limit: 5000,
      })
    : { rows: [], total: 0, capped: false }

  const href = (next: { tab?: RankingCategory; profile?: string }) => {
    const params = new URLSearchParams()
    const t = next.tab ?? category
    const p = next.profile ?? profile.key
    if (t !== 'heifers-old') params.set('tab', t)
    if (p !== ASSOCIATION_PROFILE.key) params.set('profile', p)
    const q = params.toString()
    return q ? `/account/ranking?${q}` : '/account/ranking'
  }

  /*
   * Лучшее место хозяйства — единственное число, которое читают первым.
   * Строки уже отсортированы по месту, поэтому это просто первая из них.
   */
  const best = ranking.rows[0]

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="herd" />
        <HerdNav active="ranking" />

        <Breadcrumbs
          items={[
            { label: 'Личный кабинет', href: '/account' },
            { label: 'Стадо', href: '/account?tab=herd' },
            { label: 'Рейтинг' },
          ]}
        />

        <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Рейтинг</h1>

        <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
          Места ваших животных среди всей книги — то, что нельзя посчитать в своём стаде.
          Место считается внутри разряда по всем хозяйствам сразу, а показаны здесь только ваши
          записи. Число рядом с местом — сколько всего животных в разряде.
        </p>

        <FilterChips
          label="Профиль индекса"
          active={profile.key}
          items={PROFILES.map((p) => ({
            key: p.key,
            label: p.name,
            href: href({ profile: p.key }),
            hint: p.hint,
          }))}
        />

        <FilterChips
          label="Разряд"
          active={category}
          items={RANKING_CATEGORIES.map((c) => ({
            key: c.key,
            label: c.label,
            href: href({ tab: c.key }),
            hint: c.hint,
          }))}
        />

        {best && (
          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Лучшее место хозяйства в этом разряде —{' '}
            <span className="font-medium tabular-nums">{best.position}</span> из{' '}
            <span className="tabular-nums">{nf(ranking.total, 0)}</span>
            {ranking.total > 0 && (
              <span className="text-ink-500">
                {' '}
                (выше {pct(1 - best.position / ranking.total)} книги)
              </span>
            )}
            :{' '}
            <Link
              href={`/animals/${best.animalId}`}
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {best.name || best.identNumber || `№${best.animalId}`}
            </Link>
            .
          </p>
        )}

        <p className="mt-3 text-[14px] text-ink-500">
          {plural(ranking.rows.length, 'ваше животное', 'ваших животных', 'ваших животных')}{' '}
          в разряде: {nf(ranking.rows.length, 0)} из {nf(ranking.total, 0)} по книге
        </p>

        <RankingTable
          ranking={ranking}
          emptyText={
            org
              ? 'В этом разряде у вас нет животных с посчитанным индексом'
              : 'Хозяйство не указано в вашей учётной записи'
          }
        />

        <p className="mt-6 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
          Место зависит от профиля, и это не техническая подробность: профиль Ассоциации
          и чешский SIH расходятся в отношении к экстерьеру втрое, поэтому и порядок по ним
          разный. Что именно входит в каждый профиль и как завести свой, показывает раздел{' '}
          <Link
            href="/account/indices"
            className="underline underline-offset-4 hover:text-forest-500"
          >
            «Профили индекса»
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  )
}
