import type { Metadata } from 'next'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import {
  ICAR_GAP_COUNT,
  ICAR_SECTIONS,
  ICAR_STATE_CLASS,
  ICAR_STATE_LABEL,
  ICAR_WIKI,
  ICAR_WITH_GAPS,
} from '@/lib/icar-map'
import { plural } from '@/lib/format'
import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'

export const metadata: Metadata = { title: 'Руководства ICAR' }

/**
 * Соответствие руководствам ICAR — карта, а не перевод.
 *
 * ## Почему здесь нет русского текста руководств
 *
 * Соблазн был прямой: перевести нужные разделы и выложить, показав тем самым
 * приверженность мировому опыту. Так делать нельзя, и причина не в лени.
 * Руководства принадлежат ICAR, публикация перевода целиком — нарушение
 * авторских прав, а к нарушению нельзя апеллировать как к доказательству
 * добросовестности: страница, ради которой пришлось нарушить чужое право,
 * доказывает обратное тому, что собиралась доказать.
 *
 * Разрешение у ICAR запрошено отдельно (текст письма — в `docs/icar.md`),
 * и практика у них есть: атлас здоровья копыт переведён на несколько языков
 * с их ведома.
 *
 * ## Почему таблица короткая, а разбор отдельно
 *
 * Первая редакция держала всё на одной странице, и «частично» стояло без
 * объяснений — то есть означало ровно ничего. Дописать объяснение в ту же
 * ячейку не вышло: у одного раздела пробелов три, и каждый требует абзаца
 * про то, чем он опасен и что для него нужно. Таблица от этого перестала
 * бы читаться как таблица.
 *
 * Теперь здесь ответ «где мы», а на `/icar/gaps` — «чего не хватает».
 * Список у обеих страниц один (`lib/icar-map.ts`): разойтись им негде,
 * а расхождение стоило бы дороже всего — читатель поверил бы той странице,
 * которую открыл первой.
 *
 * ## Почему знака ICAR здесь нет
 *
 * Марка выдаётся Советом организации по статусу члена или по пройденной
 * проверке, а не за соответствие руководствам. Соответствие — это то, что
 * нужно доказать, чтобы подать заявку, а не то, что даёт право на знак.
 */
export default function IcarPage() {
  return (
    <>
      <ProductHeader />

      <main className="container-page pb-8">
        <h1 className="text-[38px] font-medium sm:text-[46px]">Руководства ICAR</h1>

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            Международный комитет по учёту животных (International Committee for Animal Recording,
            ICAR) пишет руководства, по которым в мире ведут учёт продуктивности, подтверждают
            происхождение и оценивают племенную ценность. Около ста тридцати организаций
            из шестидесяти стран работают по ним; племенные книги Чехии, Нидерландов, Ирландии,
            Великобритании построены на этих правилах.
          </p>
          <p>
            Племенная книга строится по тем же руководствам. Ниже — карта: что требует каждый
            раздел и как это сделано у нас. Полностью учтённых разделов пока нет ни одного,
            и это состояние на сегодня, а не осторожность формулировок.
          </p>
        </div>

        {/*
           Оговорка стоит до таблицы, а не после неё. После — её прочтут
           те немногие, кто дочитал; а знать, что это пересказ, а не перевод,
           нужно до того, как первая строка будет принята за цитату.
        */}
        <div className="card mt-8 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          <p>
            Руководства принадлежат ICAR. Ниже — краткий пересказ своими словами и ссылка
            на английский оригинал, а не перевод: публиковать перевод целиком мы не вправе.
            Разрешение на русский перевод отдельных разделов у ICAR запрошено. Знак ICAR
            на этой странице не используется — он выдаётся Советом организации по статусу
            члена, а не за соответствие руководствам.
          </p>
        </div>

        <div className="card mt-6">
          <div className="overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Раздел</th>
                  <th>О чём</th>
                  <th>Как в книге</th>
                  <th className="whitespace-nowrap">Состояние</th>
                </tr>
              </thead>
              <tbody>
                {ICAR_SECTIONS.map((r) => (
                  <tr key={r.section}>
                    <td className="min-w-[13rem] align-top">
                      <a
                        href={`${ICAR_WIKI}${r.wiki}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        {r.title}
                      </a>
                      <span className="block text-[12px] tabular-nums text-ink-500">
                        Section {r.section}
                      </span>
                    </td>
                    <td className="max-w-[34ch] align-top text-[14px] leading-relaxed text-ink-700">
                      {r.about}
                    </td>
                    <td className="max-w-[38ch] align-top text-[14px] leading-relaxed text-ink-700">
                      {r.ours}
                    </td>
                    <td className="align-top">
                      <span
                        className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] ${ICAR_STATE_CLASS[r.state]}`}
                      >
                        {ICAR_STATE_LABEL[r.state]}
                      </span>
                      {/*
                         Ссылка ведёт к разбору именно этого раздела, а не
                         к началу страницы пробелов. Состояние «частично»
                         без объяснения — то же самое, что его отсутствие,
                         и один клик между ними лишний.
                      */}
                      {r.gaps.length > 0 && (
                        <Link
                          href={`/icar/gaps#${r.slug}`}
                          className="mt-1.5 block whitespace-nowrap text-[12px] underline underline-offset-4 hover:text-forest-500"
                        >
                          чего не хватает: {r.gaps.length}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-[90ch] text-[13px] leading-relaxed text-ink-500">
            «Вне области» — раздел не о нас: сертификация приборов и аккредитация лабораторий
            не задача учётной системы.{' '}
            <Link href="/icar/gaps" className="underline underline-offset-4 hover:text-forest-500">
              Разбор всех {ICAR_GAP_COUNT} пробелов
            </Link>{' '}
            по {plural(ICAR_WITH_GAPS.length, 'разделу', 'разделам', 'разделам')} — отдельной
            страницей.
          </p>
        </div>

        <div className="mt-8 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <h2 className="text-[22px] font-medium leading-tight">Что ещё открыто всем</h2>
          <p>
            Руководства целиком лежат на{' '}
            <a
              href="https://wiki.icar.org/index.php/Guidelines"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              wiki.icar.org
            </a>{' '}
            и читаются без регистрации. Стандарт обмена данными ADE выложен{' '}
            <a
              href="https://github.com/adewg/ICAR"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              на GitHub
            </a>{' '}
            под лицензией Apache 2.0 — его можно внедрять и дорабатывать свободно; книга отдаёт
            по нему {ADE_COLLECTIONS.length}{' '}
            {plural(ADE_COLLECTIONS.length, 'коллекцию', 'коллекции', 'коллекций')} и принимает{' '}
            {ADE_WRITABLE.length} из них на запись. Двадцать девять выпусков{' '}
            <a
              href="https://www.icar.org/publications/technical-series-and-proceedings/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              ICAR Technical Series
            </a>{' '}
            — тоже открыты.
          </p>
        </div>
      </main>

      <ProductFooter />
    </>
  )
}
