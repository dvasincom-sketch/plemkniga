import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { demoUrl, PRODUCT_MAIL } from '@/lib/hosts'
import { breedCatalog } from '@/lib/breeds-catalog-server'
import {
  ICAR_BREEDS,
  ICAR_FETCHED_AT,
  ICAR_NOTE,
  ICAR_SOURCE,
  STATE_CLASS,
  STATE_HINT,
  STATE_LABEL,
  countByState,
  type BreedRow,
  type BreedState,
} from '@/lib/breeds-catalog'
import { plural } from '@/lib/format'
import { unbounded } from '@/lib/fonts'

export const metadata: Metadata = { title: 'Породы' }
export const dynamic = 'force-dynamic'

/**
 * Какие породы книга умеет вести.
 *
 * ## Почему страница, а не строчка на главной
 *
 * «Система не привязана к породе» — заявление, которое нечем
 * подтвердить: его говорит любой, у кого в базе есть поле «порода».
 * Список из пятидесяти пяти пород реестра с честно названным
 * состоянием каждой подтверждает то же самое и проверяется читателем
 * за минуту.
 *
 * ## Почему домен только у действующей книги
 *
 * У голштинской книги свой адрес, и соблазн выдать такой каждой породе
 * велик — вышло бы полсотни поддоменов, за которыми нет ни одного
 * животного. Пустая книга под своим доменом хуже её отсутствия: она
 * выглядит заброшенной, а не готовой. Поэтому адрес заводится вместе
 * с объединением, а до тех пор порода ведёт на показательную книгу,
 * где видно устройство на демонстрационных данных.
 *
 * ## Откуда числа
 *
 * Строки — выписка из реестра ФГИАС ПР (`sync:fgias-breeds`), коды —
 * копия списка Interbull в дереве. Состояние вычисляется на каждом
 * показе из того, что есть в базе, а не проставлено руками: заведённая
 * книга появляется здесь сама, без правки страницы.
 */
export default async function BreedsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.breeds
  const notice = PAGE_MESSAGES[locale].notice

  const rows = breedCatalog()

  /*
   * Показательная книга показывается только тогда, когда она есть.
   * Пока её нет, породе без своей книги честнее предложить разговор,
   * чем ссылку в пустоту (`lib/hosts.ts`).
   */
  const demo = demoUrl()

  const count = countByState(rows)
  const withIcar = rows.filter((r) => r.icar).length
  const own = rows.length - withIcar

  const STATES: BreedState[] = ['book', 'ready', 'listed']

  /*
   * Чего породе не хватает до следующего состояния.
   *
   * Считается из тех же двух ключей, из которых складывается само
   * состояние (`buildCatalog`), — иначе столбец разошёлся бы
   * с плашкой рядом, и читатель поверил бы тому из двух, что удобнее.
   */
  const missingOf = (r: BreedRow): string => {
    if (r.state === 'book') return '—'
    const gaps: string[] = []
    if (!r.fgiasUuid) gaps.push('ключа реестра')
    if (!r.icar) gaps.push('кода ICAR')
    if (gaps.length === 0) return 'объединения, которое возьмётся вести'
    return `нет ${gaps.join(' и ')}`
  }

  return (
    <>
      <ProductHeader locale={locale} path="/breeds" />

      <main className="container-page pb-16">
        <section className="max-w-[75ch] pt-6">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{frame.eyebrow}</p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
            {frame.title}
          </h1>

          {notice && (
            <p className="mt-5 rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">
            Книга не привязана к одной породе. Порода берётся из справочника государственного
            реестра, кровность считается по улучшающей, а профиль индекса настраивается под то,
            за что платит объединение. Ниже — все {rows.length} пород молочного направления
            из реестра и состояние каждой у нас.
          </p>
        </section>

        {/* ------------------------------- Числа ------------------------------ */}
        <section className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink-100 py-8 lg:grid-cols-4">
          {[
            { value: String(rows.length), label: 'пород молочного направления в реестре' },
            { value: String(count.book), label: 'книга ведётся сегодня' },
            { value: String(withIcar), label: 'сопоставлено с кодом ICAR' },
            { value: String(own), label: 'без международного кода — отечественные и редкие' },
          ].map((n) => (
            <div key={n.label}>
              {/*
                 Числа набраны той же гарнитурой, что и на первом экране
                 витрины. Разные шрифты у одинаковых по смыслу чисел
                 читаются как разные по весу утверждения, а они равные.
              */}
              <div
                className={`${unbounded.className} text-[28px] font-medium leading-none tabular-nums text-forest-600 sm:text-[32px]`}
              >
                {n.value}
              </div>
              <p className="mt-2 max-w-[24ch] text-[13px] leading-snug text-ink-500">{n.label}</p>
            </div>
          ))}
        </section>

        {/* --------------------------- Что значит ----------------------------- */}
        <section className="mt-12">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Что значит «поддерживаем»
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STATES.map((st) => (
              <div key={st} className="rounded-2xl border border-ink-100 bg-white p-6">
                <span
                  className={`inline-block rounded-md px-2.5 py-1 text-[13px] ${STATE_CLASS[st]}`}
                >
                  {STATE_LABEL[st]}
                </span>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-500">{STATE_HINT[st]}</p>
                <p className="mt-3 text-[13px] tabular-nums text-ink-400">
                  {count[st]} {plural(count[st], 'порода', 'породы', 'пород')}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------- Отечественные породы ----------------------- */}
        <section className="mt-12 rounded-2xl border border-brand-100 bg-brand-50 p-8 sm:p-10">
          <p className="text-[13px] uppercase tracking-[0.09em] text-forest-600">
            Зачем это делается
          </p>

          <h2 className="mt-3 max-w-[60ch] text-[24px] font-medium leading-tight sm:text-[28px]">
            Породу нельзя сохранить, пока о ней нет записей
          </h2>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            У {own} пород из {rows.length} нет даже международного кода. Ярославская,
            холмогорская, истобенская, красная горбатовская есть в реестре, но не в списке
            Interbull: в мировой торговле семенем они не участвуют. Своей племенной книги
            у них тоже нет — а без неё не видно ни численности, ни родства, ни того,
            кто от кого получен, и слова о сохранении генофонда остаются словами.
          </p>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            Наша часть работы — сделать так, чтобы книгу можно было завести за неделю,
            а не за пять лет: справочники сшиты, поля готовы, кровность и родство считаются,
            выгрузки в реестр работают. Дальше нужны данные хозяйств и объединение, которое
            возьмётся вести книгу. Это же верно и за пределами России: в Казахстане книги
            ведутся по цветовым группам, а не по породам, в Армении девять из десяти
            животных — местная кавказская бурая, у которой книги нет вовсе.
          </p>
        </section>

        {/* ------------------------------ Таблица ----------------------------- */}
        <section className="mt-12">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Список</h2>
          <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-500">
            Порядок алфавитный. «Код ICAR» — трёхбуквенный код Interbull, тот же, что уезжает
            в обмен и входит в международный номер животного; прочерк означает, что в списке
            Interbull породы нет.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="data-table w-full min-w-[720px]">
              <thead>
                <tr>
                  {/*
                     Столбцов стало больше, и все они — из того, что
                     о породе действительно известно.

                     Поголовье и год утверждения просились сами, но их
                     у нас нет: национальной численности по породам
                     в наших данных не лежит, а взять её неоткуда без
                     источника, который придётся назвать. Выдуманное
                     число в таблице, обещающей проверяемость, стоило бы
                     дороже пустого столбца.

                     Зато есть то, чего нет больше нигде: почему порода
                     стоит в том состоянии, в каком стоит. «Чего
                     не хватает» и превращает список в разбор — видно,
                     что до готовности не хватает ключа реестра,
                     а не нашего желания.
                  */}
                  <th className="text-left">Порода</th>
                  <th className="w-[110px] text-left">Код ICAR</th>
                  <th className="w-[110px] text-left">В реестре</th>
                  <th className="w-[130px] text-left">Улучшающая</th>
                  <th className="w-[190px] text-left">Состояние</th>
                  <th className="w-[210px] text-left">Чего не хватает</th>
                  <th className="text-left">Где посмотреть</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: BreedRow) => (
                  <tr key={String(r.id)}>
                    <td>{r.name}</td>
                    <td className="tabular-nums text-ink-500">{r.icar ?? '—'}</td>
                    <td className="text-ink-500">{r.fgiasUuid ? 'есть' : '—'}</td>
                    <td className="text-ink-500">{r.improver ? 'да' : '—'}</td>
                    <td>
                      <span
                        className={`row-chip inline-block rounded-md px-2 py-0.5 text-[13px] ${STATE_CLASS[r.state]}`}
                      >
                        {STATE_LABEL[r.state]}
                      </span>
                    </td>
                    <td className="text-[13px] leading-snug text-ink-500">{missingOf(r)}</td>
                    <td>
                      {r.bookUrl ? (
                        <a
                          href={r.bookUrl}
                          className="underline underline-offset-4 hover:text-forest-500"
                        >
                          действующая книга
                        </a>
                      ) : demo ? (
                        <a
                          href={demo}
                          className="text-ink-500 underline underline-offset-4 hover:text-forest-500"
                        >
                          показательная книга
                        </a>
                      ) : (
                        <a
                          href={`mailto:${PRODUCT_MAIL}`}
                          className="text-ink-500 underline underline-offset-4 hover:text-forest-500"
                        >
                          обсудить книгу
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------ Источники --------------------------- */}
        <section className="mt-12 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Откуда список</h2>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Строки — выписка из справочника пород государственного реестра ФГИАС ПР: {' '}
            {rows.length} пород молочного направления, у каждой свой идентификатор, по которому
            принимаются выгрузки.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Коды — список Interbull из {ICAR_BREEDS.length} строк, копия снята {ICAR_FETCHED_AT}
            . {ICAR_NOTE}
          </p>

          <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
            Источник кодов:{' '}
            <a
              href={ICAR_SOURCE}
              className="underline underline-offset-4 hover:text-forest-500"
              rel="noreferrer"
              target="_blank"
            >
              interbull.org
            </a>
          </p>
        </section>

        {/* -------------------------------- Как ------------------------------- */}
        <section className="mt-12 max-w-[75ch] rounded-2xl bg-forest-500 p-8 text-white sm:p-10">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Завести книгу под свою породу
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-white/85">
            Напишите, какая порода, сколько голов и чем ведёте учёт сейчас. Книга открывается
            по своему адресу, с проверками, правами доступа и выгрузками в реестр.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              Написать нам
            </a>
            {demo && (
              <a
                href={demo}
                className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
              >
                Показательная книга
              </a>
            )}
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
