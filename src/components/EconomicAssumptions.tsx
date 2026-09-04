import { ECONOMIC_ASSUMPTIONS, type Assumption } from '@/lib/economics'
import { ECONOMICS_PAGE_TEXT } from '@/lib/economics-page-text'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'

/**
 * Цены, из которых собран экономический профиль.
 *
 * Стоит ячейкой сетки рядом с самой карточкой профиля — не отдельным разделом
 * внизу страницы и не свёрнутым блоком внутри карточки. Внизу страницы это
 * читалось как примечание ко всему списку профилей; внутри карточки шириной
 * в треть колонки таблица цен в два столбца разваливалась.
 *
 * Развёрнуто, а не под кликом: у экономического индекса цена — это и есть
 * содержание. «Прибыль 93 тысячи» без понимания, по чём считали молоко,
 * ничего не значит и проверке не поддаётся.
 *
 * ## Почему язык — необязательный параметр
 *
 * Блок стоит в двух местах: в кабинете, который русский весь целиком,
 * и на витрине, которая читается на шести языках. Кабинету незачем
 * знать про языки, поэтому без параметра блок остаётся русским,
 * а витрина передаёт язык читателя явно.
 */
export function EconomicAssumptions({
  wide,
  locale,
  /**
   * Печатать ли собственный заголовок и подводку.
   *
   * По умолчанию да: в кабинете блок стоит сам по себе, и без них
   * он повисает таблицей цен без объяснения, откуда они. На витрине
   * над ним уже стоит раздел с тем же заголовком — там передают `false`.
   */
  withHeading = true,
}: {
  wide?: boolean
  locale?: Locale
  withHeading?: boolean
}) {
  const text = pick(ECONOMICS_PAGE_TEXT, locale ?? DEFAULT_LOCALE).value
  const t = text.assumptions

  /* Число и слово при нём складываются здесь: слово переводится, число — нет. */
  const amount = (a: Assumption) =>
    `${a.amount.toLocaleString(text.numberLocale, {
      minimumFractionDigits: a.digits,
      maximumFractionDigits: a.digits,
    })} ${t.units[a.unit]}`

  return (
    <div className={`rounded-2xl border border-ink-100 p-5 ${wide ? 'xl:col-span-2' : ''}`}>
      {/*
         Свой заголовок блок печатает только там, где его никто
         не объявил. На витрине над ним стоит раздел «Из каких цен это
         собрано» с той же мыслью в подводке — и получалось два
         заголовка об одном подряд, а фраза «индекс верен настолько,
         насколько верны цены» звучала на странице трижды. В кабинете
         же блок стоит сам по себе, и без заголовка он повисает
         таблицей без объяснения.
      */}
      {withHeading && (
        <>
          <h3 className="text-[15px] font-medium leading-tight">{t.title}</h3>
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">{t.lead}</p>
        </>
      )}

      {/*
         Две колонки только на широком экране. На среднем блок занимает
         половину ряда, и пара цена + пояснение в нём уже не помещается:
         подпись ломается на три строки и читается хуже длинного списка.
      */}
      <dl className={`mt-4 ${wide ? 'grid gap-x-8 gap-y-2 xl:grid-cols-2' : 'space-y-2'}`}>
        {ECONOMIC_ASSUMPTIONS.map((a) => (
          <div key={a.key} className="border-b border-ink-100 pb-2 last:border-0 last:pb-0">
            <dt className="flex items-baseline justify-between gap-3 text-[13px]">
              <span>{t.rows[a.key].label}</span>
              <span className="whitespace-nowrap font-medium tabular-nums">{amount(a)}</span>
            </dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-ink-500">{t.rows[a.key].note}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">{t.footnote}</p>
    </div>
  )
}
