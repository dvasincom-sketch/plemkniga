import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { EconomicAssumptions } from '@/components/EconomicAssumptions'
import { ECONOMIC_WEIGHTS } from '@/lib/economics'
import { TRAIT_BASE } from '@/lib/breeding-index'
import { unbounded } from '@/lib/fonts'

export const metadata: Metadata = { title: 'Экономический индекс' }

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
 */
export default async function EconomicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.economics
  const notice = PAGE_MESSAGES[locale].notice

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
        unit: trait?.unit ?? '',
        sd: trait?.sd ?? 0,
        label: trait?.label ?? key,
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
    `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('ru-RU')} ₽`

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
            Чем он отличается от обычного индекса
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Обычный индекс складывает признаки с весами в долях и отвечает на вопрос
            «насколько это животное лучше среднего». Ответ верный и непереводимый в решение:
            зоотехник, выбирая между двумя нетелями, считает не доли, а деньги.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Экономический индекс складывает те же признаки, но веса у него — рубли на единицу
            признака. Сумма получается в рублях за жизнь животного, и её можно сравнить
            с ценой нетели, стоимостью лечения и выручкой от выбраковки. Это и есть перевод
            селекции на язык, на котором принимаются решения.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Профиль Ассоциации при этом не заменяется: он отвечает за породу, а не за деньги
            одного хозяйства. Оба лежат рядом, и переключение между ними показывает то,
            что иначе обсуждают на словах, — что «лучшая корова» у породы и у бухгалтерии
            это разные коровы.
          </p>
        </section>

        {/* ------------------------------- Веса --------------------------------- */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Сколько стоит единица признака
          </h2>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            Рубли за продуктивную жизнь животного. Знак минус означает не «плохой признак»,
            а расход: за крупную корову платят кормом, а за смертность приплода — телятами.
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="data-table w-full min-w-[560px] text-[14px]">
              <thead>
                <tr>
                  <th className="text-left">Признак</th>
                  <th className="w-[150px] text-right">₽ за единицу</th>
                  <th className="w-[170px] text-right">₽ за обычный шаг</th>
                  <th className="w-[220px] text-left">Шаг</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => (
                  <tr key={w.key}>
                    <td>{w.label}</td>
                    <td
                      className={`text-right ${unbounded.className} tabular-nums ${
                        w.value > 0 ? 'text-forest-600' : 'text-[#9e3520]'
                      }`}
                    >
                      {money(w.value)}
                      <span className="ml-1 text-[12px] text-ink-400">/ {w.unit}</span>
                    </td>
                    <td
                      className={`text-right ${unbounded.className} tabular-nums ${
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
                      {w.sd.toLocaleString('ru-RU')} {w.unit}
                      <div className="mt-1 h-1.5 w-full rounded-full bg-ink-100">
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
            «Обычный шаг» — генетическое стандартное отклонение признака: настолько
            животные расходятся между собой в обычной популяции. Сравнивать веса имеет смысл
            по второму столбцу, а не по первому: килограммы жира расходятся на десятки,
            баллы вымени — на единицы, и цена за единицу об этом молчит.
          </p>
        </section>

        {/* ------------------------------- Цены --------------------------------- */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Из каких цен это собрано
          </h2>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            Ни одно из чисел выше не взято из воздуха: каждое считается из цен ниже. Это
            допущения по рынку 2026 года, а не истина — у хозяйства цифры свои, и под них
            заводится свой профиль.
          </p>

          <div className="mt-8">
            <EconomicAssumptions wide />
          </div>
        </section>

        <section className="mt-14 max-w-[75ch] rounded-2xl border border-brand-100 bg-brand-50 p-8 sm:p-10">
          <h2 className="text-[22px] font-medium leading-tight sm:text-[26px]">
            Где это в книге
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Профиль стоит рядом с остальными в разделе индекса племенной ценности:
            его берут за основу и правят цены под своё хозяйство. Веса пересчитываются
            сразу, и видно, как от цены молока меняется место животного в списке.
          </p>
          <Link
            href={`/${locale}/breeds`}
            className="mt-5 inline-block text-[15px] font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
          >
            Какие породы книга умеет вести →
          </Link>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
