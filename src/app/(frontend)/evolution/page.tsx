import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { EvolutionVersions } from '@/components/EvolutionVersions'
import { EvolutionStages } from '@/components/EvolutionStages'
import { EvolutionDocs } from '@/components/EvolutionDocs'
import { EvolutionRoadmap } from '@/components/EvolutionRoadmap'
import { CURRENT_VERSION } from '@/lib/product-versions'

export const metadata: Metadata = {
  title: 'Эволюция продукта',
  description:
    'Версии платформы племенной книги, этапы зрелости, дорожная карта до 2028 года и техническая документация: модель данных, процессы, архитектура и контракты обмена.',
}

/**
 * Эволюция продукта — публичная страница о состоянии платформы.
 *
 * Четыре вкладки отвечают четырём разным читателям, и объединять их в одну
 * простыню было бы ошибкой. «Версии» — что появлялось и в каком порядке;
 * это читают все. «Этапы зрелости» — насколько на это можно опереться;
 * это читает тот, кто решает, ввязываться ли. «Дорожная карта» — чего ждать
 * дальше; это читает тот, кто прикидывает собственные планы. «Документация» —
 * как это устроено внутри; это читает инженер, которому строить интеграцию.
 *
 * Почему вкладка живёт в адресной строке, а не в состоянии компонента.
 * На эти разделы ссылаются: в переписке, в презентации, из других страниц
 * системы. Вкладка, которую нельзя переслать ссылкой, вынуждает объяснять
 * словами, куда нажать, — а объяснять приходится каждому.
 */

const TABS = [
  { key: 'versions', label: 'Версии' },
  { key: 'stages', label: 'Этапы зрелости' },
  { key: 'roadmap', label: 'Дорожная карта' },
  { key: 'docs', label: 'Документация' },
] as const

type TabKey = (typeof TABS)[number]['key']

const LEAD: Record<TabKey, string> = {
  versions:
    'Что появлялось в платформе и в каком порядке. Текущая версия — ' +
    CURRENT_VERSION +
    ': ключевые возможности есть, обещания совместимости пока нет.',
  stages:
    '«Работающий прототип» и «готовый продукт» — разные обещания, и путаница между ними ' +
    'дорого стоит обеим сторонам. Здесь этапы названы своими именами, и отмечено, ' +
    'на каком из них платформа находится сегодня.',
  roadmap:
    'Что предстоит сделать до 2028 года: ближайшие работы, интеграции, геномная оценка ' +
    'и выход в промышленную эксплуатацию. Сроки — намерения, а не обязательства.',
  docs:
    'Техническое описание системы для тех, кому предстоит с ней работать: модель данных, ' +
    'процессы, архитектура, контракты обмена, развёртывание и — отдельно — ограничения.',
}

export default async function EvolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; change?: string }>
}) {
  const { tab: tabParam, change } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'versions'

  return (
    <>
      <SiteHeader />

      <main className="container-page pb-8">
        <h1 className="max-w-[24ch] text-[38px] font-medium leading-tight sm:text-[46px]">
          Эволюция продукта
        </h1>

        {/*
           Вкладки стоят сразу под заголовком, а описание раздела — под ними.
           Раньше порядок был обратный, и вкладки ездили по вертикали:
           у одного раздела описание в две строки, у другого в три, и строка
           вкладок оказывалась то выше, то ниже. При переключении это читается
           как дёрганье интерфейса, а попасть по вкладке дважды подряд
           становится делом удачи. Заголовок высоту не меняет — значит
           и вкладки стоят на месте всегда.
        */}
        <nav
          aria-label="Разделы страницы"
          className="mt-8 flex flex-wrap gap-2 text-[14px]"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/evolution?tab=${t.key}`}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 transition-colors ${
                tab === t.key
                  ? 'bg-forest-500 text-white'
                  : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <p className="mt-8 max-w-[80ch] text-[17px] leading-relaxed text-ink-700">{LEAD[tab]}</p>

        <div className="mt-10">
          {tab === 'versions' && <EvolutionVersions openVersion={change} />}
          {tab === 'stages' && <EvolutionStages />}
          {tab === 'roadmap' && <EvolutionRoadmap />}
          {tab === 'docs' && <EvolutionDocs />}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
