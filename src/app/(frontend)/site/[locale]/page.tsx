import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PlemLogo } from '@/components/PlemLogo'
import { unbounded } from '@/lib/fonts'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import {
  AssociationArt,
  BreedBookArt,
  FarmArt,
  HeroArt,
  FEATURE_ICONS,
  FlowArt,
  LayersArt,
  StandardArt,
} from '@/components/site/SiteArt'
import { RankScale } from '@/components/site/RankScale'
import { DemoVideo } from '@/components/site/DemoVideo'
import { AnimalScreen } from '@/components/site/ScreenArt'
import { ScreenSlider } from '@/components/site/ScreenSlider'
import { WindowFrame } from '@/components/site/WindowFrame'
import { IndexScreen, PedigreeScreen } from '@/components/site/BookScreens'
import { ADE_MAP } from '@/lib/ade-schema-map'
import { PRODUCT_MESSAGES } from '@/lib/i18n/product-messages'
import { SITE_MESSAGES } from '@/lib/i18n/site-messages'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { LOCALE_CODES, isLocale, localeInfo, type Locale } from '@/lib/i18n/locales'
import { BOOK_URL, PRODUCT_MAIL, SITE_PREFIX, demoUrl, isSiteHost } from '@/lib/hosts'
import { breedCatalog } from '@/lib/breeds-catalog-server'
import { countByState, type BreedRow } from '@/lib/breeds-catalog'
import { BOOK_FEATURES } from '@/lib/book-features'

/**
 * Витрина продукта — то, что видно на `plem.online`.
 *
 * ## Единственное место, где живёт это предложение
 *
 * Прежде такая же страница стояла внутри книги, по адресу `/eaeu/ru`.
 * С появлением своего домена она стала второй копией одного текста —
 * и копией на домене голштинской ассоциации: хозяйство из Казахстана,
 * пришедшее по ссылке, читало предложение продукта с чужим знаком,
 * чужим подвалом и чужими реквизитами. Страница удалена, адрес
 * перенаправлен сюда постоянным перенаправлением.
 *
 * Поэтому здесь **нет подвала Ассоциации вовсе**: на витрине он назвал бы
 * не то лицо — читатель обращается к разработчику системы, а не в Самару.
 *
 * ## Порядок разделов — это порядок сомнений
 *
 * Не «что умеем», а «что вас беспокоит». Сначала четыре числа: они
 * отвечают на «зачем мне это сейчас». У русского набора четвёртое —
 * срок, с которого регистрация в государственном реестре обязательна;
 * у остальных языков там международный довод, потому что чужой срок
 * либо принимают на свой счёт, либо перестают верить и остальным трём
 * числам. Потом три контура учёта — на «а разве у меня этого нет».
 * Потом возможности, путь данных и рейтинг — на «а как это работает».
 * И только в конце «система работает, вот адрес», потому что до этого
 * места читателю нечего было открывать.
 *
 * Список возможностей нарочно стоит не первым. Он убедителен для того,
 * кто уже понял задачу, и бессмыслен для того, кто ещё не понял.
 *
 * ## Почему схемы, а не фотографии
 *
 * Разбор в `components/site/SiteArt.tsx`. Коротко: подписи на схемах —
 * настоящий текст, он переводится вместе со страницей; картинку пришлось
 * бы рисовать шесть раз, по разу на язык.
 *
 * ## Почему адреса собираются от приставки
 *
 * На витринном домене обработчик превращает `/ru` в `/site/ru`, и человек
 * видит короткий адрес; на книжном та же страница живёт по настоящему
 * `/site/ru`. Ссылка обязана вести туда, откуда пришёл читатель, — иначе
 * переключение языка на одном из доменов роняет в «страница не найдена».
 *
 * Ссылки на книгу — абсолютные: `holstein.plem.online` другой домен.
 * А «Соответствие» и описание интерфейса теперь свои: они переехали
 * на витринный домен, потому что отвечают на вопросы о продукте,
 * а не о книге Ассоциации, — и адрес у них собирается от той же
 * приставки, что и переключатель языка.
 */

export function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}

  const m = PRODUCT_MESSAGES[locale]

  return {
    title: m.meta.title,
    description: m.meta.description,
    /*
     * Каноничный адрес всегда витринный, даже когда страницу открыли
     * на книжном домене по служебному пути. Иначе поисковик сочтёт две
     * копии дублями и выберет ту, которую людям показывать не надо.
     */
    alternates: {
      canonical: `https://plem.online/${locale}`,
      languages: {
        ...Object.fromEntries(LOCALE_CODES.map((c) => [c, `https://plem.online/${c}`])),
        'x-default': 'https://plem.online/',
      },
    },
  }
}

/**
 * Куда ведёт каждое число первого экрана.
 *
 * Число без разбора — обещание: его нельзя проверить, а спорить с ним
 * нечем. Ссылка превращает его в утверждение, за которым стоит
 * страница. Порядок здесь тот же, что у чисел в наборе строк, и это
 * единственное место, где они связаны, — потому и стоит рядом.
 */
/*
 * Куда ведёт каждое из четырёх чисел.
 *
 * Прежде два числа из четырёх вели на одну и ту же страницу
 * соответствия: и «20 из 20 шаблонов реестра», и «50+ правил проверки».
 * Обещание при этом давалось разное, а страница открывалась одна,
 * и разбора ни того ни другого на ней не было — только строка в общей
 * таблице. Нажавший второй раз убеждался, что ссылки декоративные.
 *
 * Теперь у каждого числа своя страница с разбором.
 */
const PROOF_LINKS: (string | null)[] = ['/fgias', '/ade', '/rules', '/breeds']

export default async function SitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const m = PRODUCT_MESSAGES[locale]
  const s = SITE_MESSAGES[locale]
  /* Рамки внутренних страниц — для подписей ссылок «кому это». */
  const pages = PAGE_MESSAGES[locale].pages
  const info = localeInfo(locale)

  /*
   * Числа пород берутся из того же места, что и каталог: посчитанные
   * порознь, они разойдутся, и читатель, сверивший главную со страницей
   * пород, перестанет верить обеим.
   */
  const breeds = breedCatalog()
  const breedCount = countByState(breeds)
  const breedNumbers = {
    all: String(breeds.length),
    ready: String(breedCount.ready),
    own: String(breeds.filter((b: BreedRow) => !b.icar).length),
  }

  /*
   * Первая кнопка ведёт туда, где посетителю можно всё.
   *
   * Действующая книга принадлежит Ассоциации: там настоящие животные,
   * и незнакомому человеку она открыта только на просмотр. Показательная
   * книга для того и заводится, чтобы в ней можно было ходить свободно.
   * Пока её нет, кнопка ведёт в действующую — это честнее, чем ссылка
   * в пустоту, но как только стенд поднимется, порядок меняется сам.
   */
  const demo = demoUrl()

  const host = (await headers()).get('host')
  const base = isSiteHost(host) ? '' : SITE_PREFIX

  return (
    <div lang={locale}>
      <header className="container-page flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-8">
        <PlemLogo />

        <LocaleSwitcher
          active={locale}
          label={m.nav.language}
          hrefs={
            Object.fromEntries(LOCALE_CODES.map((l) => [l, `${base}/${l}`])) as Record<
              Locale,
              string
            >
          }
        />
      </header>

      <main className="container-page pb-8">
        {/* ---------------------------- Первый экран --------------------------- */}
        {/*
           Рисунок справа, и только на широком экране.

           На узком он встал бы между заголовком и кнопкой и отодвинул
           действие за нижний край. Первый экран существует ради кнопки,
           а не ради рисунка, и уступать ей место он должен первым.

           Ширина колонки задана числом, а не долей: текст первого экрана
           держит меру строки в 70 знаков, и доля растянула бы его на
           широком мониторе до нечитаемой длины ровно тогда, когда места
           стало больше.
        */}
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_420px]">
        <section className="max-w-[70ch] pt-6">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{s.eyebrow}</p>

          <h1 className="mt-3 text-[38px] font-medium leading-tight sm:text-[54px]">
            {m.hero.title}
          </h1>

          <p className="mt-6 text-[18px] leading-relaxed text-ink-700">{m.hero.lead}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={demo ?? BOOK_URL}
              className="rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
            >
              {demo ? s.book.demoCta : s.book.cta}
            </a>
            {demo && (
              <a
                href={BOOK_URL}
                className="text-[15px] underline underline-offset-4 hover:text-forest-500"
              >
                {s.book.cta}
              </a>
            )}
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="rounded-xl border border-ink-200 px-6 py-3 text-[15px] transition-colors hover:border-forest-500 hover:text-forest-500"
            >
              {m.contact.action}
            </a>
          </div>
        </section>

          {/*
             Подписи под рисунком нет намеренно.

             Она была и пересказывала словами то, что рисунок уже показал:
             серое — все, светлое — свои, зелёное — одно. Пересказ картинки
             её не объясняет, а заставляет читать дважды и сомневаться,
             верно ли понял с первого раза.
          */}
          <div className="hidden lg:block">
            <HeroArt title={m.hero.title} />
          </div>
        </div>

        {/* --------------------- Международный стандарт --------------------- */}
        {/*
           Полоса стоит между первым экраном и четырьмя числами, и место
           это не случайное.

           Довод здесь не про качество данных, а про **происхождение
           форматов**, и он отвечает на возражение, которое читатель
           формулирует про себя первым: «очередной стартап со своим
           форматом». Стартап, придумавший формат, — это риск: завтра
           он передумает или исчезнет, и данные останутся в том, чего
           никто больше не читает.

           Поэтому полоса идёт до чисел о продукте: сперва «форматы
           не наши», потом «и вот сколько мы уже умеем». Обратный порядок
           читался бы как хвастовство перед незнакомым.

           Число схем подставляется, а не пишется: оно меняется вместе
           с копией стандарта.
        */}
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5 rounded-2xl border border-brand-100 bg-brand-50 px-5 py-5 sm:px-6">
          <StandardArt title={s.standard.title} />
          <p className="max-w-[70ch] flex-1 text-[15px] leading-relaxed text-ink-700">
            <strong className="font-medium text-ink-900">{s.standard.title}.</strong>{' '}
            {s.standard.body.replace('{n}', String(ADE_MAP.used))}{' '}
            <a
              href={`${base}/${locale}/ade`}
              className="whitespace-nowrap font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              {s.standard.link} →
            </a>
          </p>
        </div>

        {/*
           Четыре числа сразу под первым экраном. Числа читают те, кто
           не станет читать абзацы, — а таких большинство. Каждое
           проверяемо прогоном; круглое непроверяемое число здесь было бы
           хуже отсутствия числа.
        */}
        <section className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {s.proof.map((p, i) => {
            const href = PROOF_LINKS[i]
            const inner = (
              <>
                <div
                  className={`${unbounded.className} text-[34px] font-medium leading-none tabular-nums text-forest-600 sm:text-[40px]`}
                >
                  {p.value}
                </div>
                <p className="mt-2 max-w-[22ch] text-[13px] leading-snug text-ink-500">{p.label}</p>
              </>
            )

            /*
               Признак нажимаемости виден в покое, а не только при наведении.

               Прежняя редакция прятала «Разобрать →» до наведения, и число
               выглядело просто числом: указатель на него никто не наводил,
               потому что не за чем. С пальца этого признака не было вовсе —
               наведения там не существует, и подсказка не появлялась
               никогда.

               Поэтому плашка обведена, надпись видна всегда и приглушена,
               а наведение меняет цвет рамки и надписи. Заливку при
               наведении пробовали и убрали: плашка вспыхивала ярче всего
               остального на странице, а отклик обязан быть тише
               содержимого — он подтверждает, что попал, а не зовёт нажать.
            */
            return href ? (
              <Link
                key={p.label}
                href={`${base}/${locale}${href}`}
                className="group block rounded-2xl border border-ink-100 bg-white p-5 transition-colors hover:border-forest-500"
              >
                {inner}
                <span className="mt-3 inline-block text-[12px] text-ink-400 transition-colors group-hover:text-forest-600">
                  Разобрать →
                </span>
              </Link>
            ) : (
              <div key={p.label} className="p-5">
                {inner}
              </div>
            )
          })}
        </section>

        {/* --------------------------- Три контура ----------------------------- */}
        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{s.layers.title}</h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-ink-700">
            {s.layers.lead}
          </p>

          <div className="mt-8 grid grid-cols-1 items-stretch gap-10 lg:grid-cols-[320px_1fr]">
            <LayersArt
              title={s.layers.title}
              labels={s.layers.items.map((i) => i.title)}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {s.layers.items.map((item, i) => {
                /*
                   Третий слой выделен: он и есть предмет разговора.
                   Остальные два у хозяйства обычно уже есть, и делать
                   вид, что мы их изобрели, значило бы соврать первому же
                   зоотехнику.

                   Он же единственный ведёт на разбор. Названный вершиной
                   и оставленный без продолжения, он был обещанием
                   в две строки: «экономика коровы» — и всё. Теперь
                   за словами стоит страница с весами в рублях и ценами,
                   из которых они собраны, а два нижних слоя ссылок
                   не получают: у хозяйства они и так есть, вести
                   их некуда.
                */
                const inner = (
                  <>
                    <h3 className="text-[16px] font-medium leading-snug">{item.title}</h3>
                    <p
                      className={`mt-2 text-[14px] leading-relaxed ${
                        i === 2 ? 'text-white/80' : 'text-ink-700/75'
                      }`}
                    >
                      {item.body}
                    </p>
                  </>
                )

                if (i !== 2) {
                  /*
                     Карточка красится тем же цветом, что её полоса
                     в пирамиде слева.
                     
                     Белые карточки рядом с цветной пирамидой читались
                     как отдельный список: связь «эта полоса — вот эта
                     карточка» приходилось искать по названию, читая
                     дважды. Цвет связывает их с одного взгляда, и порядок
                     тот же — нижняя полоса и первая карточка про одно.
                     
                     Оттенки взяты из пирамиды дословно, а не подобраны
                     на глаз: подобранный похожий оттенок читается как
                     ошибка вёрстки, а не как соответствие.
                  */
                  return (
                    <div
                      key={item.title}
                      className={`rounded-2xl p-6 text-ink-700 ${
                        i === 0 ? 'bg-ink-100' : 'bg-brand-100'
                      }`}
                    >
                      {inner}
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.title}
                    href={`${base}/${locale}/economics`}
                    className="group block rounded-2xl bg-forest-500 p-6 text-white transition-colors hover:bg-forest-600"
                  >
                    {inner}
                    <span className="mt-4 inline-block text-[13px] text-white/70 transition-colors group-hover:text-white">
                      {s.economics.link} →
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------ Проблема ----------------------------- */}
        <section className="mt-16 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{m.problem.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.problem.body}</p>
        </section>

        <DemoVideo title={s.video.title} lead={s.video.lead} note={s.video.note} />

        {/* ------------------------------ Рейтинг ------------------------------ */}
        <section className="mt-20">
          <div className="grid grid-cols-1 items-center gap-10 rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] lg:grid-cols-[1fr_320px]">
            <div className="max-w-[60ch]">
              <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
                {s.ranking.title}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{s.ranking.body}</p>
            </div>

            <RankScale title={s.ranking.title} />
          </div>
        </section>

        {/* ---------------------------- Возможности ---------------------------- */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            {m.features.title}
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {m.features.items.map((item, i) => {
              const Glyph = FEATURE_ICONS[i]
              return (
                <div
                  key={item.title}
                  className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]"
                >
                  {/*
                     Значок слева от заголовка, а не над ним.

                     Сверху он съедал строку высоты у всех шести карточек
                     разом и отодвигал заголовок от верхнего края: взгляд
                     шёл через пустое поле. Рядом с заголовком он читается
                     вместе с ним, одним движением.

                     Высота значка равна двум строкам заголовка — той
                     мере, по которой карточки и различаются: у одних
                     заголовок в строку, у других в две, и значок держит
                     общую высоту шапки.
                  */}
                  <div className="flex items-center gap-4">
                    {Glyph && <Glyph />}
                    <h3 className="text-[17px] font-medium leading-tight">{item.title}</h3>
                  </div>
                  <p className="mt-4 text-[14px] leading-relaxed text-ink-500">{item.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* --------------------- Порода без своей книги ------------------------ */}
        {/*
           Стоит после перечня возможностей и до пути данных.

           Довод адресован не хозяйству, а породному объединению
           и государству: сохранение малочисленной породы упирается
           не в геномику, а в учёт — пока у породы нет книги, сохранять
           формально нечего. Это единственное место на странице, где
           продукт говорит не про удой.
        */}
        <section className="mt-20">
          {/*
             Рисунок слева, как у полосы о стандарте: пустой пунктирный
             лист превращается в заполненный. Пунктир здесь не украшение —
             он и в родословной значит «этого нет», и порода без книги
             показана тем же знаком, что неизвестный предок.
          */}
          <div className="flex flex-col gap-8 rounded-2xl border border-brand-100 bg-brand-50 p-8 sm:p-10 lg:flex-row lg:items-start lg:gap-10">
            <div className="shrink-0">
              <BreedBookArt title={s.breeds.title} />
            </div>

            <div>
            <h2 className="max-w-[60ch] text-[26px] font-medium leading-tight sm:text-[30px]">
              {s.breeds.title}
            </h2>
            <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
              {s.breeds.body
                .replace(/\{all\}/g, breedNumbers.all)
                .replace(/\{ready\}/g, breedNumbers.ready)
                .replace(/\{own\}/g, breedNumbers.own)}
            </p>
            <a
              href={`${base}/${locale}/breeds`}
              className="mt-4 inline-block text-[15px] font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              {s.breeds.link} →
            </a>
            </div>
          </div>
        </section>

        {/* ---------------------------- Путь данных ---------------------------- */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{s.flow.title}</h2>

          {/*
             Схема слева, объяснение справа.

             Сама по себе она узкая — ярусы держат меру плашки, — и вширь
             её не растянуть: растянутая, она превращается в четыре
             далеко разнесённых прямоугольника, между которыми глаз
             ищет связь. Оставленная одна посреди полотна, она сидела
             в белой карточке с пустыми полями в треть экрана с каждой
             стороны.

             Поэтому ширину забирает текст: подводка и вывод переехали
             из-под заголовка вправо, к самой схеме. Тот же приём,
             что у трёх контуров учёта выше, и читается он так же —
             картинка и слова об одном, рядом.
          */}
          <div className="mt-8 grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] sm:p-8">
              <FlowArt title={s.flow.title} nodes={s.flow.nodes} marks={s.flow.marks} />
            </div>

            <div>
              <p className="text-[16px] leading-relaxed text-ink-700">{s.flow.lead}</p>
              <p className="mt-4 text-[14px] leading-relaxed text-ink-500">{s.flow.note}</p>
            </div>
          </div>
        </section>

        {/* --------------------- Как выглядит внутри --------------------- */}
        {/*
           Стоит после пути данных и до рейтинга — там, где читатель уже
           понял, что система делает, и впервые спрашивает «а как это
           выглядит». Раньше показывать нечего: карточка животного без
           объяснения, что в неё попадает, — просто таблица.

           Нарисовано вёрсткой, а не снимком. Снимок стареет молча
           (интерфейс поедет, картинка останется), весит сотни килобайт
           ради читаемых подписей и не переводится: на казахской странице
           надпись внутри картинки осталась бы русской. Разбор —
           в `ScreenArt.tsx`.
        */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{s.screen.title}</h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-ink-700">
            {s.screen.lead}
          </p>

          {/*
             Три экрана вместо одного.

             Одна карточка животного отвечала на вопрос «как это
             выглядит» и оставляла впечатление, что книга и есть
             карточка. Родословная и разбор оценки снимают два других
             возражения — «а происхождение вы видите?» и «а откуда
             берётся ваш индекс?», — и ни одно из трёх не снимается
             остальными.

             Сменяются сами: на витрине читатель не работает, а листает,
             и вкладки, которые надо нажать, смотрит меньшинство.
             Нажатие при этом останавливает показ — отнимать выбор ради
             движения нельзя.
          */}
          <div className="mt-8">
            <ScreenSlider
              /*
                 Все три экрана в одной оконной рамке, и заголовок у неё
                 один — кличка с номером. Прежде рамка была только
                 у карточки, и переключение показывало не три экрана
                 одной системы, а три куска вёрстки.

                 В заголовке животное, а не название раздела: раздел уже
                 назван на вкладке прямо над окном, а кличка связывает
                 три экрана в один — видно, что родословная и оценка
                 про то же животное.
              */
              items={[
                {
                  key: 'card',
                  label: s.screen.tabs.card,
                  screen: (
                    <WindowFrame title="Ромашка · RU 4512 087" subtitle="запись хозяйства">
                      <AnimalScreen labels={s.screen} />
                    </WindowFrame>
                  ),
                },
                {
                  key: 'pedigree',
                  label: s.screen.tabs.pedigree,
                  screen: (
                    <WindowFrame title="Ромашка · RU 4512 087" subtitle="происхождение">
                      <PedigreeScreen />
                    </WindowFrame>
                  ),
                },
                {
                  key: 'index',
                  label: s.screen.tabs.index,
                  screen: (
                    <WindowFrame title="Ромашка · RU 4512 087" subtitle="профиль Ассоциации">
                      <IndexScreen />
                    </WindowFrame>
                  ),
                },
              ]}
            />
          </div>

          <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
            {s.screen.note}
          </p>

          {/*
             Перечень разделов идёт сразу за нарисованной карточкой.

             Карточка отвечает на вопрос «как это выглядит» и молчит
             о том, что в книге есть. Читатель, дошедший сюда, второй
             вопрос уже задал: он видел шесть возможностей общими
             словами и хочет знать, из чего книга состоит. Ответ —
             разделы работающего кабинета, а не достоинства.
          */}
          <h3 className="mt-12 text-[20px] font-medium leading-tight sm:text-[22px]">
            {s.inside.title}
          </h3>
          <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-500">
            {s.inside.lead}
          </p>

          {/*
             Каждая подпись — ссылка на разбор своего раздела.

             Порядок подписей и порядок разборов один и тот же список
             (`lib/book-features.ts`), поэтому пара не может разъехаться:
             подпись без страницы или страница без подписи невозможны
             по устройству, а не по внимательности.
          */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.inside.items.map((item, i) => {
              const feature = BOOK_FEATURES[i]
              const card = (
                <>
                  <h4 className="text-[15px] font-medium leading-snug">{item.title}</h4>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{item.body}</p>
                  {feature && (
                    <span className="mt-3 inline-block text-[13px] font-medium text-forest-600">
                      Подробнее →
                    </span>
                  )}
                </>
              )

              return feature ? (
                <Link
                  key={item.title}
                  href={`${base}/${locale}/book/${feature.slug}`}
                  className="group rounded-2xl border border-ink-100 bg-white p-5 transition-colors hover:border-forest-500"
                >
                  {card}
                </Link>
              ) : (
                <div key={item.title} className="rounded-2xl border border-ink-100 bg-white p-5">
                  {card}
                </div>
              )
            })}
          </div>
        </section>

        {/* ----------------------- Чего система не делает ---------------------- */}
        {/*
           Блок стоит перед «кому это», и это осознанный порядок:
           сперва читатель узнаёт, чем система не является, и только
           потом решает, он ли это. Недостающее люди достраивают сами
           и достраивают неверно — «племенной учёт» читается как
           «программа для фермы», после чего страницу закрывают,
           решив, что такая уже есть.
        */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{s.limits.title}</h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {s.limits.items.map((item) => (
              <div key={item.title} className="rounded-2xl border border-ink-100 bg-white p-6">
                <h3 className="text-[16px] font-medium leading-snug">{item.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------- Кому ------------------------------- */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{m.who.title}</h2>

          {/*
             Две полосы одна под другой, а не две карточки рядом.

             ## Почему не рядом

             Рядом они делят полотно пополам, и каждой достаётся колонка
             в сорок знаков — вдвое уже меры, принятой на этой странице.
             Текст в ней тянется вниз на шесть строк, рисунок висит
             сверху в пустом квадрате, и обе половины выглядят
             недоделанными. Мы перебрали три раскладки и каждый раз
             упирались в одно: содержания на две колонки здесь нет,
             а места мало.

             ## Почему полосой

             Потому что такая полоса на странице уже есть и работает —
             «Международный стандарт отрасли»: рисунок слева, текст
             справа, во всю ширину. Читатель к этому строю привык
             к третьему экрану, и заводить ради двух абзацев четвёртую
             раскладку значило бы просить его разбираться заново.

             Друг под другом они ещё и читаются по очереди, а это верно
             по существу: хозяйство и объединение — два разных читателя
             с разными вопросами, а не две колонки одного сравнения.

             ## Про рисунок без подложки

             Серый квадрат вокруг него убран. Он ставился, чтобы
             выровнять две карточки по высоте; в полосе выравнивать
             нечего, а пустая подложка вокруг рисунка читалась как
             не загрузившаяся картинка.
          */}
          <div className="mt-8 space-y-4">
            {[
              { who: m.who.farms, href: '/economics', label: pages.economics.eyebrow },
              { who: m.who.associations, href: '/rules', label: pages.rules.eyebrow },
            ].map(({ who, href, label }, i) => (
              <div
                key={who.title}
                className="flex flex-wrap items-start gap-x-8 gap-y-5 rounded-2xl border border-ink-100 bg-white px-6 py-6 sm:px-8 sm:py-8"
              >
                <div className="shrink-0">
                  {i === 0 ? <FarmArt title={who.title} /> : <AssociationArt title={who.title} />}
                </div>

                <div className="min-w-[280px] flex-1">
                  <h3 className="text-[19px] font-medium leading-tight sm:text-[21px]">
                    {who.title}
                  </h3>
                  <p className="mt-3 max-w-[70ch] text-[16px] leading-relaxed text-ink-700">
                    {who.body}
                  </p>
                  <Link
                    href={`${base}/${locale}${href}`}
                    className="mt-4 inline-block text-[15px] font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
                  >
                    {label} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/*
           Здесь стоял блок «На чём построено» — заголовок, абзац
           и ссылка на соответствие. Убран как повтор: тот же довод
           уже сказан полосой о международном стандарте под первым
           экраном, и она сильнее — стоит раньше, отвечает на возражение
           «очередной стартап со своим форматом» до того, как оно
           сформулировано, и ведёт на разбор схем.

           Ссылка на соответствие при этом не потерялась: на него ведут
           два числа из четырёх на первом экране и подвал витрины.
           Третий вход в одну и ту же дверь ничего не добавляет, а место
           между «кому это» и действующей книгой занимает.
        */}

        {/*
           Действующая книга — предпоследним блоком, а не первым.
           Это самое сильное, что можно сказать о продукте: не «умеет»,
           а «работает, вот адрес». Но до этого места читателю нечего
           было там искать.
        */}
        <section className="mt-20 rounded-2xl bg-forest-500 p-8 text-white sm:p-10">
          <h2 className="max-w-[60ch] text-[26px] font-medium leading-tight sm:text-[32px]">
            {s.book.title}
          </h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-white/85">
            {s.book.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              {s.book.cta}
            </a>
            {/*
               Экскурсия стоит рядом с кнопкой «открыть книгу», а не вместо
               неё, и только на нерусских языках.

               Причина в том, куда ведёт сама кнопка: книга по-русски.
               Русскому посетителю этого достаточно — он открывает и читает.
               Всем прочим прямая ссылка упирается в непонятный экран
               на втором щелчке, и разбор устройства по-английски для них
               ближе к тому, зачем они сюда пришли, чем сама книга.

               Убирать при этом кнопку нельзя: работающая книга — главный
               довод, и прятать её за пересказом значило бы предлагать
               рассказ вместо доказательства.
            */}
            {s.book.tour && (
              <a
                href={`${base}/tour`}
                className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
              >
                {s.book.tour}
              </a>
            )}
            <a
              href={`${base}/${locale}/compliance`}
              className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
            >
              {s.footer.note}
            </a>
          </div>
        </section>

        {/* ------------------------------- Зачем ------------------------------- */}
        {/*
           Стоит предпоследним, перед приглашением написать.

           Раньше здесь не было ничего: страница рассказывала, что книга
           умеет, и молчала о том, зачем эта работа делается. Читатель,
           дочитавший до конца, второй вопрос задаёт сам — и не получив
           ответа, достраивает его сам, обычно неверно: «продают софт».
           Ответ дан числами, а не прилагательными: пород столько-то,
           книг у них ноль.
        */}
        {/*
           Цель работы и приглашение — в одну строку.

           Стояли они друг под другом, и между ними на широком экране
           оставалась пустая половина полотна: оба блока держат меру
           строки и занимают левую часть. Хуже пустоты был порядок
           чтения — дочитав «зачем», человек прокручивал дальше
           и встречал ещё один заголовок там, где ждал конца страницы.

           Рядом они читаются как одно: вот зачем это делается — вот как
           начать. На узком экране столбец возвращается сам.
        */}
        {/*
           Колонки неравные: слева текста втрое больше, и на равных
           половинах он тянулся вниз, оставляя под приглашением пустоту
           в полполотна. Ширина отдана по количеству слов, а не поровну.
        */}
        <section className="mt-20 grid grid-cols-1 items-start gap-12 lg:grid-cols-[7fr_5fr]">
          <div>
            <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
              {s.purpose.title}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
              {s.purpose.body
                .replace(/\{all\}/g, breedNumbers.all)
                .replace(/\{ready\}/g, breedNumbers.ready)
                .replace(/\{own\}/g, breedNumbers.own)}
            </p>
            <a
              href={`${base}/${locale}/breeds`}
              className="mt-4 inline-block text-[15px] font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              {s.breeds.link} →
            </a>
          </div>

          <div>
            <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
              {m.contact.title}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.contact.body}</p>
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="mt-6 inline-block rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
            >
              {m.contact.action}
            </a>
          </div>
        </section>

        {!info.reviewed && (
          <p className="mt-16 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
            {m.draft.notice}{' '}
            <Link href={`${base}/ru`} className="underline underline-offset-4 hover:text-forest-500">
              Русский
            </Link>
            {' · '}
            <Link href={`${base}/en`} className="underline underline-offset-4 hover:text-forest-500">
              English
            </Link>
          </p>
        )}
      </main>

      {/*
         Свой подвал: только ссылки. Знак уже стоит в шапке, а подпись
         разработчика уводила бы от системы — последнее, что видит
         уходящий, должно вести к ней.
      */}
      <footer style={{ marginTop: 'var(--footer-air)' }} className="bg-basement py-10 text-white">
        <nav
          aria-label={m.nav.home}
          className="container-page flex flex-wrap items-center gap-x-8 gap-y-3 text-[14px]"
        >
          <a
            href={BOOK_URL}
            className="text-white/70 underline underline-offset-4 transition-colors hover:text-white"
          >
            {s.book.cta}
          </a>
          <a
            href={`${base}/${locale}/compliance`}
            className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
          >
            {s.footer.note}
          </a>
          <a
            href={`${base}/${locale}/api-docs`}
            className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
          >
            API
          </a>
          {/*
             Адрес печатается словами, и теперь это можно: у продукта
             свой ящик на своём домене. Прежде здесь стоял адрес
             Ассоциации, в котором имя страны и породы читалось
             как «решение не про вас», — и его приходилось прятать
             за подписью действия.
          */}
          <a
            href={`mailto:${PRODUCT_MAIL}`}
            className="text-white/70 underline underline-offset-4 transition-colors hover:text-white"
          >
            {PRODUCT_MAIL}
          </a>
        </nav>
      </footer>
    </div>
  )
}
