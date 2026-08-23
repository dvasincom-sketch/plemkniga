import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ImportCard } from '@/components/ImportCard'
import { ExportCard } from '@/components/ExportCard'
import { IntegrationChannels } from '@/components/IntegrationChannels'
import { getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { DATASETS } from '@/lib/import-format'

export const metadata: Metadata = { title: 'Загрузка данных' }
export const dynamic = 'force-dynamic'

/**
 * Загрузка и выгрузка данных стада.
 *
 * ## Что здесь было не так
 *
 * Страница предлагала загрузить файл и не говорила, какой. Единственным
 * описанием формата была строка мелким шрифтом внутри свёрнутой карточки —
 * восемь колонок из двадцати с лишним, без указания, какая обязательна,
 * без единого примера значения и без файла, который можно скачать
 * и заполнить.
 *
 * Второе: принимались только животные. Отёлы, осеменения и дойки файлом
 * не грузились никогда — при том что именно их и приходит тысячами строк.
 *
 * ## Как устроено теперь
 *
 * Наборов четыре, вид данных выбирается в самой карточке загрузки, и там же
 * лежит шаблон — свой для каждого набора. Отдельной карточки «начните
 * с шаблона» наверху нет намеренно: она предлагала бы то же действие
 * второй раз, причём без выбора набора, то есть всегда для животных.
 *
 * Ниже — таблицы колонок по наборам. Собираются из того же реестра,
 * по которому идёт разбор (`src/lib/import-format.ts`), поэтому разойтись
 * с действительностью не могут.
 */
export default async function ImportPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="animals" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Мои животные', href: '/account?tab=animals' },
              { label: 'Загрузка данных' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Загрузка и выгрузка данных
          </h1>

          {/*
             Текст описывает то, что система делает на самом деле.
             Прежняя редакция обещала, что данные появятся только после
             проверки, — животные при этом заводились сразу, и человек
             видел в стаде записи, которых по инструкции быть не должно.
             Проверка меняет не наличие данных, а доверие к ним.
          */}
          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Файлом загружаются животные, отёлы, осеменения и контрольные дойки — по одному
            набору за раз. Записи попадают в стадо сразу, с уровнем достоверности «Черновик»,
            и одновременно заводится пакет данных: он уходит на проверку к сотрудникам
            Ассоциации, и его состояние видно в разделе{' '}
            <Link href="/account?tab=events" className="underline underline-offset-4">
              «События»
            </Link>
            . Когда проверка завершится и вы согласитесь с результатом, записи этого пакета
            получат уровень «Верифицировано ассоциацией». Остального стада проверка не касается.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ImportCard
              datasets={DATASETS.map((d) => ({ value: d.key, label: d.label, hint: d.hint }))}
            />
            <ExportCard />
          </div>

          {/* --------------------- Что понимает система --------------------- */}

          <section className="mt-14">
            <h2 className="section-title mb-2">Какие колонки принимаются</h2>
            <p className="mb-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              Порядок колонок любой, лишние не мешают — система назовёт их после загрузки,
              чтобы вы знали, что они не записались. Регистр заголовка не важен. Пустая
              ячейка означает «не менять», а не «стереть».
            </p>
            <p className="max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              Загрузка отёлов, осеменений и доек карточек животных не заводит: животное
              должно уже быть в стаде. Строка с чужим или неизвестным номером отклоняется —
              так событие не попадёт не на ту корову.
            </p>

            {/*
               Промежуток задан и внешним отступом, и внутренним `pt`.
               Второе кажется лишним, но margin заголовка схлопывается
               с margin секции, а padding — нет: без него величина зазора
               зависит от того, что задано в `.section-title`, а не от того,
               что написано здесь.
            */}
            <div className="mt-10 space-y-16">
              {DATASETS.map((ds) => (
                <div key={ds.key} className="pt-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <h3 className="text-[22px] font-medium">{ds.label}</h3>
                    <a
                      href={`/account/import/template?kind=${ds.key}`}
                      download
                      className="text-[14px] underline underline-offset-4"
                    >
                      Скачать шаблон
                    </a>
                  </div>
                  <p className="mt-1 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                    {ds.hint}
                  </p>

                  <div className="mt-6 space-y-10">
                    {ds.groups.map((group) => (
                      <div key={group.key} className="pt-1">
                        {ds.groups.length > 1 && (
                          <h4 className="text-[18px] font-medium">{group.label}</h4>
                        )}
                        <p
                          className={`max-w-[80ch] text-[14px] leading-relaxed text-ink-500 ${
                            ds.groups.length > 1 ? 'mt-1 mb-4' : 'mb-4'
                          }`}
                        >
                          {group.intro}
                        </p>

                        <div className="card overflow-x-auto">
                          <table className="metric-table min-w-[720px]">
                            <thead>
                              <tr>
                                <th className="w-[180px]">Заголовок</th>
                                <th>Что записывается</th>
                                <th className="w-[150px]">Пример</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.columns.map((c) => (
                                <tr key={c.key}>
                                  <td className="align-top">
                                    <code className="text-[13px]">{c.title}</code>
                                    {c.required && (
                                      <span className="ml-2 rounded bg-[#fdecea] px-1.5 py-0.5 text-[11px] text-[#8c2f27]">
                                        обязательна
                                      </span>
                                    )}
                                    {c.aliases.length > 0 && (
                                      <span className="mt-1 block text-[12px] leading-snug text-ink-500">
                                        также: {c.aliases.join(', ')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="align-top">
                                    <span className="text-[14px] leading-relaxed">{c.what}</span>
                                    {c.note && (
                                      <span className="mt-1 block text-[13px] leading-relaxed text-ink-500">
                                        {c.note}
                                      </span>
                                    )}
                                  </td>
                                  <td className="align-top">
                                    {c.example ? (
                                      <code className="text-[13px]">{c.example}</code>
                                    ) : (
                                      <span className="text-ink-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* --------------------------- Когда по одному -------------------- */}

          <section className="mt-14">
            <div className="card">
              <h2 className="panel-heading">Когда файла не нужно</h2>
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Ради пяти отёлов файл собирать незачем. Отдельные события вводятся по одному
                на странице{' '}
                <Link href="/account/events/new" className="underline underline-offset-4">
                  «Записать событие»
                </Link>
                : номера отёла и лактации там проставляются сами, а после записи форма
                остаётся открытой — пять подряд вводятся подряд. Одиночное животное так же
                заводится{' '}
                <Link href="/account/animals/new" className="underline underline-offset-4">
                  вручную
                </Link>
                , и у телёнка своей коровы родители там выбираются из стада, а не
                переписываются номерами.
              </p>
            </div>
          </section>

          <IntegrationChannels />
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
