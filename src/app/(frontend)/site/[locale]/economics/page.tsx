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
   */
  const weights = Object.entries(ECONOMIC_WEIGHTS)
    .map(([key, value]) => ({
      key,
      value: Number(value ?? 0),
      label: TRAIT_BASE.find((t) => t.key === key)?.label ?? key,
    }))
    .filter((w) => w.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const peak = Math.max(...weights.map((w) => Math.abs(w.value)))
  const money = (n: number) =>
    `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('ru-RU')} ₽`

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
            Рубли за жизнь животного на одну единицу признака. Знак минус означает не «плохой
            признак», а расход: за крупную корову платят кормом.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-2">
            {weights.map((w) => (
              <div key={w.key} className="border-b border-ink-100 pb-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[15px]">{w.label}</span>
                  <span
                    className={`${unbounded.className} whitespace-nowrap text-[17px] font-medium tabular-nums ${
                      w.value > 0 ? 'text-forest-600' : 'text-[#9e3520]'
                    }`}
                  >
                    {money(w.value)}
                  </span>
                </div>

                {/*
                   Полоса длиной по величине, а не по знаку: сравнивать
                   надо вес, а знак уже сказан цветом и самим числом.
                */}
                <div className="mt-2 h-1.5 w-full rounded-full bg-ink-100">
                  <div
                    className={`h-1.5 rounded-full ${w.value > 0 ? 'bg-forest-500' : 'bg-[#c0563c]'}`}
                    style={{ width: `${Math.round((Math.abs(w.value) / peak) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
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
