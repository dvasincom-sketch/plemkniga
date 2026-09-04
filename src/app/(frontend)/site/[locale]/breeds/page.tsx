import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { noticeFor, pick } from '@/lib/i18n/translated'
import { demoUrl, PRODUCT_MAIL } from '@/lib/hosts'
import { breedCatalog } from '@/lib/breeds-catalog-server'
import { BREED_PAGES } from '@/lib/breed-pages'
import {
  ICAR_BREEDS,
  ICAR_FETCHED_AT,
  ICAR_SOURCE,
  STATE_CLASS,
  countByState,
  type BreedRow,
  type BreedState,
} from '@/lib/breeds-catalog'
import { BREEDS_PAGE_TEXT } from '@/lib/breeds-page-text'
import { breedName as breedNameIn } from '@/lib/i18n/data/breeds'

/*
 * Заголовок, описание и указание основной страницы — из одного места
 * (`lib/seo.ts`). Описание берётся из подводки самой страницы: она уже
 * написана и переведена, а второе описание для робота никто не читает
 * и потому никто не правит.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return siteMetadata(locale, 'breeds', '/breeds')
}
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
 *
 * ## Почему весь текст страницы лежит в наборе строк
 *
 * Набранный прямо в разметке абзац перевода не видит: заголовок
 * и подводка приходили переведёнными, а тело оставалось русским,
 * и английская страница читалась как брошенная на полпути. Слова
 * страницы теперь в `lib/breeds-page-text.ts`, имена пород — словарями
 * по языкам в `lib/i18n/data/breeds.<язык>.ts`.
 *
 * ## Почему имена пород — отдельный словарь, а не перевод на месте
 *
 * Имя породы — не слово, а идентификатор: «Чёрно-пёстрая» это Russian
 * Black Pied, а не Black-motley и не Holstein, хотя переводчик уверенно
 * поставил бы и то и другое. Разбор — в самих словарях, там же названы
 * имена, которые ещё требуют проверки носителем языка.
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

  const picked = pick(BREEDS_PAGE_TEXT, locale)
  const text = picked.value

  /*
   * Оговорка «текст ниже по-русски» стоит только там, где он и правда
   * русский. Раньше она показывалась на всех нерусских языках без
   * разбора — в том числе на английском, где переведено уже всё, — и
   * извинялась за то, чего нет. Строка, извиняющаяся напрасно,
   * обесценивает ту же строку там, где она сказана по делу.
   */
  const notice = noticeFor(locale, picked.fallback)

  /*
   * Имена пород идут за языком, на котором показан текст, а не
   * за языком в адресе: если перевода страницы нет и показан русский
   * текст, русские имена рядом с ним на месте, а казахские выглядели бы
   * вторым языком на одной странице.
   */
  const nameIn = breedNameIn(picked.shown)

  const rows = breedCatalog()

  /** Имя породы на языке текста; чего нет в словаре, остаётся русским. */
  const breedName = (r: BreedRow) => nameIn(r.name)

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
   * У каких пород есть свой разбор. Восьми из пятидесяти пяти —
   * и ссылка ставится только им: ссылка на несуществующую страницу
   * хуже её отсутствия, а «скоро будет» на витрине означает «никогда».
   */
  const pageOf = new Map(BREED_PAGES.map((b) => [b.registryName, b.slug]))

  /*
   * Порядок в таблице — по тому имени, которое читатель видит, и с тегом
   * того языка, на котором он его видит.
   *
   * Каталог отсортирован по русскому алфавиту, и на любой другой странице
   * этот порядок выглядит случайным: подпись обещает алфавит, а столбец
   * его не показывает. Раньше пересортировка делалась только для
   * английского — то есть ровно там, где о ней вспомнили; армянская
   * таблица оставалась в русском порядке под той же подписью.
   *
   * Тег языка нужен и сам по себе: «Ё» и «Е» в русском, армянский
   * и казахский алфавиты сортируются каждый по-своему, и порядок
   * по чужим правилам читается как отсутствие порядка.
   */
  const listed = [...rows].sort((a, b) => breedName(a).localeCompare(breedName(b), picked.shown))

  /*
   * Чего породе не хватает до следующего состояния.
   *
   * Считается из тех же двух ключей, из которых складывается само
   * состояние (`buildCatalog`), — иначе столбец разошёлся бы
   * с плашкой рядом, и читатель поверил бы тому из двух, что удобнее.
   */
  const missingOf = (r: BreedRow): string => {
    const m = text.list.missing
    if (r.state === 'book') return m.none
    if (!r.fgiasUuid && !r.icar) return m.both
    if (!r.fgiasUuid) return m.registryKey
    if (!r.icar) return m.icar
    return m.association
  }

  return (
    <>
      <ProductHeader locale={locale} path="/breeds" />

      <main className="container-page pb-16">
        <section className="max-w-[75ch]">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{frame.eyebrow}</p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
            {frame.title}
          </h1>

          {notice && (
            <p className="mt-5 rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{text.lead(rows.length)}</p>
        </section>

        {/* ------------------------------- Числа ------------------------------ */}
        <section className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink-100 py-8 lg:grid-cols-4">
          {[
            { value: String(rows.length), label: text.stats.total },
            { value: String(count.book), label: text.stats.book },
            { value: String(withIcar), label: text.stats.icar },
            { value: String(own), label: text.stats.own },
          ].map((n) => (
            <div key={n.label}>
              {/*
                 Числа набраны той же гарнитурой, что и на первом экране
                 витрины. Разные шрифты у одинаковых по смыслу чисел
                 читаются как разные по весу утверждения, а они равные.
              */}
              <div
                className={`stat-value text-[28px] leading-none text-forest-600 sm:text-[32px]`}
              >
                {n.value}
              </div>
              <p className="mt-2 max-w-[24ch] text-[13px] leading-snug text-ink-500">{n.label}</p>
            </div>
          ))}
        </section>

        {/* ------------------------- Кто ведёт книги -------------------------- */}
        {/*
           Раздел появился после прямого вопроса: «судя по таблице,
           в России нет ни одной ассоциации, которая занималась бы
           племенным разведением».

           Вывод неверен, и виновата таблица: она про породы и про то,
           ведётся ли книга **на этой платформе**, а читается как перепись
           отрасли. Ассоциации есть, и одна из них — та, чья книга открыта
           по ссылке в этой же таблице.

           Но за неверным выводом стоит верное наблюдение, и оно
           заслуживает абзаца: устройство у нас и правда другое, чем
           в Европе, и именно оно объясняет, почему у большинства пород
           «своей» книги нет.
        */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.keepers.title}
          </h2>

          {text.keepers.para.map((paragraph, i) => (
            <p
              key={paragraph.slice(0, 40)}
              className={`${i === 0 ? 'mt-5' : 'mt-4'} text-[16px] leading-relaxed text-ink-700`}
            >
              {paragraph}
            </p>
          ))}
        </section>

        {/* --------------------------- Что значит ----------------------------- */}
        <section className="mt-12">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.meansTitle}
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STATES.map((st) => (
              <div key={st} className="rounded-2xl border border-ink-100 bg-white p-6">
                <span
                  className={`inline-block rounded-md px-2.5 py-1 text-[13px] ${STATE_CLASS[st]}`}
                >
                  {text.states[st].label}
                </span>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-500">
                  {text.states[st].hint}
                </p>
                <p className="mt-3 text-[13px] tabular-nums text-ink-400">
                  {text.breedCount(count[st])}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------- Отечественные породы ----------------------- */}
        <section className="mt-12 rounded-2xl border border-brand-100 bg-brand-50 p-8 sm:p-10">
          <p className="text-[13px] uppercase tracking-[0.09em] text-forest-600">
            {text.why.eyebrow}
          </p>

          <h2 className="mt-3 max-w-[60ch] text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.why.title}
          </h2>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            {text.why.noCode(own, rows.length)}
          </p>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            {text.why.work}
          </p>
        </section>

        {/* ------------------------------ Таблица ----------------------------- */}
        <section className="mt-12">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.list.title}
          </h2>
          <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-500">
            {text.list.lead}
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
                  <th className="text-left">{text.list.columns.name}</th>
                  <th className="w-[110px] text-left">{text.list.columns.icar}</th>
                  {/*
                     Столбца «Улучшающая» здесь больше нет.

                     Признак есть в справочнике пород книги, но каталог
                     витрины собирается без базы — и у всех пятидесяти
                     пяти строк колонка стояла пустой. Пустой столбец
                     не нейтрален: он говорит «улучшающих пород нет»,
                     что неверно, и делает это шестьдесят раз подряд.
                  */}
                  <th className="w-[190px] text-left">{text.list.columns.state}</th>
                  <th className="w-[210px] text-left">{text.list.columns.missing}</th>
                  <th className="text-left">{text.list.columns.where}</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r: BreedRow) => {
                  const slug = pageOf.get(r.name)
                  const label = text.list.breedPage

                  return (
                    <tr key={String(r.id)}>
                      <td>
                        {/*
                           Разбор породы написан по-русски, и переводить
                           пятьдесят пять таких страниц мы не взялись
                           (`breeds/[slug]/page.tsx`). Поэтому на языке,
                           на котором разбора нет, ссылкой служит не имя,
                           а подпись под ним, и подпись называет язык:
                           узнать об этом до щелчка дешевле, чем после.
                        */}
                        {slug && !label ? (
                          <Link
                            href={`/${locale}/breeds/${slug}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {breedName(r)}
                          </Link>
                        ) : (
                          breedName(r)
                        )}
                        {slug && label && (
                          <div className="mt-0.5">
                            <Link
                              href={`/ru/breeds/${slug}`}
                              className="text-[12px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
                            >
                              {label}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="tabular-nums text-ink-500">{r.icar ?? '—'}</td>
                      <td>
                        <span
                          className={`row-chip inline-block rounded-md px-2 py-0.5 text-[13px] ${STATE_CLASS[r.state]}`}
                        >
                          {text.states[r.state].label}
                        </span>
                      </td>
                      <td className="text-[13px] leading-snug text-ink-500">{missingOf(r)}</td>
                      <td>
                        {r.bookUrl ? (
                          <a
                            href={r.bookUrl}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {text.list.bookLink}
                          </a>
                        ) : demo ? (
                          <a
                            href={demo}
                            className="text-ink-500 underline underline-offset-4 hover:text-forest-500"
                          >
                            {text.list.demoLink}
                          </a>
                        ) : (
                          <a
                            href={`mailto:${PRODUCT_MAIL}`}
                            className="text-ink-500 underline underline-offset-4 hover:text-forest-500"
                          >
                            {text.list.talkLink}
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------ Источники --------------------------- */}
        <section className="mt-12 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.sources.title}
          </h2>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            {text.sources.registry(rows.length)}
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            {text.sources.codes(ICAR_BREEDS.length, ICAR_FETCHED_AT)}
          </p>

          <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
            {text.sources.sourceLead}{' '}
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
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">{text.cta.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-white/85">{text.cta.body}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              {text.cta.mail}
            </a>
            {demo && (
              <a
                href={demo}
                className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
              >
                {text.cta.demo}
              </a>
            )}
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
