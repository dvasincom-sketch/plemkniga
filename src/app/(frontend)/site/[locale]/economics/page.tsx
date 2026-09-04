import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'
import { EconomicAssumptions } from '@/components/EconomicAssumptions'
import { ECONOMIC_WEIGHTS } from '@/lib/economics'
import { ECONOMICS_PAGE_TEXT } from '@/lib/economics-page-text'
import { TRAIT_BASE } from '@/lib/breeding-index'

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
  return siteMetadata(locale, 'economics', '/economics')
}

/**
 * Экономический индекс — своей страницей на витрине.
 *
 * ## Зачем она понадобилась
 *
 * «Экономика коровы» названа на главной верхним из трёх контуров учёта
 * и объявлена тем, ради чего книгу и заводят. Дальше страница переходила
 * к другому, и читатель оставался с двумя словами вместо довода.
 *
 * А довод здесь редкий и проверяемый: индекс отвечает не «насколько
 * корова лучше», а «сколько она принесёт», и веса у него не в долях,
 * а в рублях. Это либо убеждает сразу, либо вызывает возражение
 * по существу — и то и другое лучше молчания.
 *
 * ## Почему цены показаны целиком
 *
 * Индекс верен ровно настолько, насколько верны цены под ним. Спрятать
 * их значило бы предложить верить числу, которое нельзя пересчитать, —
 * то самое, за что мы упрекаем закрытые индексы поставщиков семени
 * (`docs/rynok-semeni.md`). Цены наши открыты, названы годом и правятся
 * хозяйством под свои.
 *
 * ## Почему отрицательный вес не спрятан
 *
 * У композита тела вес со знаком минус: крупная корова дороже
 * в содержании, и в экономическом счёте рост её корпуса — убыток,
 * а не достоинство. Убрать этот знак с витрины значило бы показать
 * индекс, в котором всё хорошо, — то есть не показать индекс.
 *
 * ## Почему весь текст страницы лежит в наборе строк
 *
 * Набранный прямо в разметке абзац перевода не видит: заголовок
 * и подводка приходили переведёнными, а тело оставалось русским,
 * и английская страница читалась как брошенная на полпути. Слова
 * страницы теперь в `lib/economics-page-text.ts` — там же, где их можно
 * перевести целиком и разом.
 */
export default async function EconomicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.economics

  const picked = pick(ECONOMICS_PAGE_TEXT, locale)
  const text = picked.value

  /*
   * Оговорка «текст ниже по-русски» стоит только там, где он и правда
   * русский. Раньше она показывалась на всех нерусских языках без
   * разбора — в том числе на английском, где переведено уже всё, — и
   * извинялась за то, чего нет. Строка, извиняющаяся напрасно, обесценивает
   * ту же строку там, где она сказана по делу.
   */
  const notice = picked.fallback ? PAGE_MESSAGES[locale].notice : null

  /*
   * Названия признаков идут за языком, на котором показан текст, а не
   * за языком в адресе: на казахской странице тело русское, и русские
   * названия рядом с ним на месте, а английские выглядели бы третьим
   * языком на одной странице.
   */
  const english = picked.shown === 'en'

  /*
   * Веса берутся из того же места, откуда их берёт расчёт. Переписать
   * их сюда числами значило бы завести вторую правду, которая разойдётся
   * с первой на ближайшей правке цен — и разойдётся молча.
   *
   * ## Знак берётся из признака, а не из веса
   *
   * У смертности приплода вес записан положительным числом, и это верно:
   * расчёт разворачивает его сам, потому что признак помечен как
   * «рост значения — ухудшение» (`inverted` в `TRAIT_BASE`). А страница
   * показывала вес как есть — и выходило «+490 ₽ за процент смертности
   * приплода», то есть ровно наоборот тому, что считает система.
   *
   * Ошибка из самых дорогих: число выглядит осмысленным, лежит
   * на витрине рядом с обещанием проверяемости, и опровергнуть его может
   * любой зоотехник за секунду.
   *
   * ## Почему рядом с ценой за единицу стоит размах
   *
   * «1 320 ₽ за килограмм жира» и «5 400 ₽ за балл вымени» несравнимы:
   * килограммы жира у быков расходятся на десятки, баллы вымени — на
   * единицы. Читатель, сравнивающий веса напрямую, делает неверный
   * вывод о том, что двигает деньги.
   *
   * Поэтому вторым числом стоит вес, умноженный на генетическое
   * стандартное отклонение признака: сколько рублей приносит животное,
   * отличающееся от среднего на один обычный шаг. Это и есть ответ
   * на вопрос «что реально решает».
   */
  const weights = Object.entries(ECONOMIC_WEIGHTS)
    .map(([key, value]) => {
      const trait = TRAIT_BASE.find((t) => t.key === key)
      const direction = trait?.inverted ? -1 : 1
      return {
        key,
        /** Рубли за единицу признака так, как их видит зоотехник. */
        value: Number(value ?? 0) * direction,
        /*
         * Знак у шага тот же, что у цены за единицу: иначе смертность
         * приплода стояла бы с минусом в одном столбце и с плюсом
         * в соседнем — на одной строке, про одно и то же.
         */
        perStep: Number(value ?? 0) * (trait?.sd ?? 0) * direction,
        unit: (english ? trait?.unitEn : trait?.unit) ?? '',
        sd: trait?.sd ?? 0,
        label: (english ? trait?.labelEn : trait?.label) ?? key,
      }
    })
    .filter((w) => w.value !== 0)
    /*
     * Порядок — по величине, а не по знаку: вопрос «что двигает деньги»
     * не различает прибыль и убыток, крупная корова стоит хозяйству
     * ровно столько же, сколько приносит хорошее вымя.
     */
    .sort((a, b) => Math.abs(b.perStep) - Math.abs(a.perStep))

  const peak = Math.max(...weights.map((w) => Math.abs(w.perStep)))
  const money = (n: number) =>
    `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString(text.numberLocale)} ₽`

  return (
    <>
      <ProductHeader locale={locale} path="/economics" />

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

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{frame.lead}</p>
        </section>

        {/* --------------------------- Чем он отличается ------------------------ */}
        <section className="mt-12 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.compareTitle}
          </h2>

          {text.comparePara.map((paragraph, i) => (
            <p
              key={paragraph.slice(0, 40)}
              className={`${i === 0 ? 'mt-5' : 'mt-4'} text-[16px] leading-relaxed text-ink-700`}
            >
              {paragraph}
            </p>
          ))}
        </section>

        {/* ------------------------------- Веса --------------------------------- */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.weightsTitle}
          </h2>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            {text.weightsLead}
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="data-table w-full min-w-[560px] text-[14px]">
              <thead>
                <tr>
                  <th className="text-left">{text.table.trait}</th>
                  <th className="w-[150px] text-right">{text.table.perUnit}</th>
                  <th className="w-[170px] text-right">{text.table.perStep}</th>
                  <th className="w-[220px] text-left">{text.table.step}</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => (
                  <tr key={w.key}>
                    <td>{w.label}</td>
                    <td
                      className={`text-right stat-value ${
                        w.value > 0 ? 'text-forest-600' : 'text-[#9e3520]'
                      }`}
                    >
                      {money(w.value)}
                      {/*
                         Слэш прижат к рублю без отступа: с отступом
                         выходило «+1 320 ₽ / кг», то есть три отдельные
                         величины вместо одной цены за единицу. В блоке
                         цен ниже та же дробь набрана слитно — «₽/кг», —
                         и две записи одного на одной странице спорили.
                      */}
                      <span className="text-[12px] text-ink-400">/{w.unit}</span>
                    </td>
                    <td
                      className={`text-right stat-value ${
                        w.perStep > 0 ? 'text-forest-600' : 'text-[#9e3520]'
                      }`}
                    >
                      {money(w.perStep)}
                    </td>
                    <td className="text-ink-500">
                      {/*
                         Размах назван числом, а не словом: «обычный шаг»
                         без величины — то же прилагательное, от которых
                         мы отказались на первом экране.
                      */}
                      {w.sd.toLocaleString(text.numberLocale)} {w.unit}
                      <div className="row-bar mt-1 h-1.5 w-full rounded-full bg-ink-100">
                        <div
                          className={`h-1.5 rounded-full ${
                            w.perStep > 0 ? 'bg-forest-500' : 'bg-[#c0563c]'
                          }`}
                          style={{
                            width: `${Math.round((Math.abs(w.perStep) / peak) * 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            {text.stepNote}
          </p>

          {/*
             Ссылка на разбор базы стоит здесь, а не в подводке страницы.
             Вопрос «а откуда взято это отклонение» возникает ровно тогда,
             когда человек прочитал про обычный шаг и понял, что от него
             зависит весь второй столбец.

             Адрес остаётся русским: сам разбор написан по-русски, и вести
             на несуществующий перевод было бы хуже, чем честно сказать
             об этом в подписи.
          */}
          <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            {text.sourceLead}{' '}
            <Link
              href="/ru/razbory/baza-sravneniya"
              className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              {text.sourceLink}
            </Link>
            .
          </p>
        </section>

        {/* ------------------------------- Цены --------------------------------- */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.pricesTitle}
          </h2>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            {text.pricesLead}
          </p>

          <div className="mt-8">
            {/*
               Блоку цен передаётся язык, на котором показан текст
               страницы, и запрет на собственный заголовок: он здесь уже
               есть — «Из каких цен это собрано» с подводкой, — и второй
               заголовок под ним читался бы как начало нового раздела.
            */}
            <EconomicAssumptions wide withHeading={false} locale={picked.shown} />
          </div>
        </section>

        <section className="mt-14 max-w-[75ch] rounded-2xl border border-brand-100 bg-brand-50 p-8 sm:p-10">
          <h2 className="text-[22px] font-medium leading-tight sm:text-[26px]">{text.whereTitle}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{text.whereBody}</p>
          {/*
             Ссылка ведёт в раздел про индекс, а не в каталог пород.
             Блок называется «Где это в книге» и говорит про профиль
             рядом с остальными — а уводил на список пород, то есть
             отвечал не на тот вопрос, который сам же поставил.
          */}
          <Link
            href={`/${locale}/book/index`}
            className="mt-5 inline-block text-[15px] font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
          >
            {text.whereLink}
          </Link>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
