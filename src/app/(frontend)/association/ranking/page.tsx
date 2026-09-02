import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { FilterChips } from '@/components/FilterChips'
import { RankingTable } from '@/components/RankingTable'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { ASSOCIATION_PROFILE, NATIONAL_PROFILES } from '@/lib/breeding-index'
import { indexValuesLag } from '@/lib/index-values'
import {
  RANKING_CATEGORIES,
  RANKING_LIMIT,
  isRankingCategory,
  loadRanking,
  type RankingCategory,
} from '@/lib/ranking'
import { nf, plural } from '@/lib/format'

export const metadata: Metadata = { title: 'Рейтинг' }
export const dynamic = 'force-dynamic'

/**
 * Рейтинг животных книги — поимённо, по разрядам, по выбранному профилю.
 *
 * ## Зачем Ассоциации именно этот раздел
 *
 * Всё, что Ассоциация видела о члене до сих пор, было про недостатки:
 * очередь на проверку, качество книги, состояние стад. Разделы нужные,
 * но объединение, которое умеет говорить с хозяйством только о беде,
 * рано или поздно перестают слушать.
 *
 * Рейтинг — первый раздел про достижение. И первый, у которого есть прямая
 * денежная польза для члена: животное на видном месте продаётся дороже,
 * а увидеть это место можно только здесь, потому что для него нужны все
 * стада разом.
 *
 * ## Почему профиль выбирается, а не задан
 *
 * Порядок в этом списке целиком зависит от весов, и разные школы дают
 * разный порядок. У NM$ экстерьер практически обнулён, у чешского SIH это
 * четверть индекса — и «лучшая тёлка книги» по одному профилю и по другому
 * будет разной тёлкой. Спрятать этот выбор за одним «правильным» числом
 * значило бы выдать решение за факт.
 *
 * Поэтому профили переключаются прямо здесь, и первым стоит профиль
 * Ассоциации: он основной, но не единственный.
 *
 * ## Почему тёлки разделены по году, а быки нет
 *
 * У чехов так же, и причина не в возрасте как таковом. Тёлка до года
 * оценена только по родителям, тёлка после года — тоже, но её уже видел
 * бонитёр. Смешивать их в одном списке значит сравнивать оценки разной
 * природы. У быка такого перелома нет: разница между молодым и проверенным
 * выражается достоверностью, и она стоит в таблице колонкой.
 */

/** Профили, по которым имеет смысл строить рейтинг: свой и национальные. */
const PROFILES = [ASSOCIATION_PROFILE, ...NATIONAL_PROFILES]

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; profile?: string }>
}) {
  await requireAssociation()
  const { tab, profile: profileParam } = await searchParams

  const category: RankingCategory = isRankingCategory(tab) ? tab : 'heifers-old'
  const profile = PROFILES.find((p) => p.key === profileParam) ?? ASSOCIATION_PROFILE

  const payload = await getClient()

  const [ranking, lag] = await Promise.all([
    loadRanking(payload, profile.key, category),
    indexValuesLag(payload, profile.key),
  ])

  const href = (next: { tab?: RankingCategory; profile?: string }) => {
    const params = new URLSearchParams()
    const t = next.tab ?? category
    const p = next.profile ?? profile.key
    if (t !== 'heifers-old') params.set('tab', t)
    if (p !== ASSOCIATION_PROFILE.key) params.set('profile', p)
    const q = params.toString()
    return q ? `/association/ranking?${q}` : '/association/ranking'
  }

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="ranking" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Рейтинг</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Лучшие животные книги по индексу племенной ценности — поимённо, с хозяйством-владельцем.
            Это единственное число, которое хозяйство не может посчитать само: место среди своих
            видно в кабинете, место среди всех — только здесь.
          </p>

          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Порядок зависит от весов профиля, и это не техническая подробность. Профиль Ассоциации
            и чешский SIH расходятся в отношении к экстерьеру втрое — списки по ним будут разными.
            Переключите профиль и сравните: расхождение и есть содержание выбора.
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

          <p className="mt-3 text-[14px] text-ink-500">
            {plural(ranking.total, 'животное', 'животных', 'животных')} в разряде:{' '}
            {nf(ranking.total, 0)}
            {ranking.capped && `, показаны первые ${nf(RANKING_LIMIT, 0)}`}
          </p>

          {/*
             Отставание пересчёта — сообщение, а не тихий пропуск.
             Без него список выглядит полным при любом числе пропущенных
             животных: порядок построится, просто части записей в нём
             не окажется, и узнать об этом читателю неоткуда.
          */}
          {(lag.missing > 0 || lag.stale > 0) && (
            <p className="mt-3 max-w-[80ch] rounded-lg bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
              Порядок может быть неполным: {lag.missing > 0 && `без значения индекса — ${nf(lag.missing, 0)}`}
              {lag.missing > 0 && lag.stale > 0 && ', '}
              {lag.stale > 0 && `посчитано до последней правки — ${nf(lag.stale, 0)}`}. Приводит
              в порядок <code className="font-mono text-[12px]">npm run backfill:index</code>.
            </p>
          )}

          <RankingTable
            ranking={ranking}
            emptyText="В этом разряде нет животных с посчитанным индексом"
          />

          <p className="mt-6 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
            Индекс — собственный расчёт книги по собственной базе сравнения, а не общероссийская
            величина. Сравнивать его с числами из других систем нельзя: у них другие признаки
            и другая база. Что именно входит в каждый профиль, показывает раздел «Профили индекса»
            в кабинете хозяйства.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
