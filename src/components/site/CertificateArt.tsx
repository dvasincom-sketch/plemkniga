import { PlemLogo } from '@/components/PlemLogo'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
import { screensText } from '@/lib/book-screens-text'

/**
 * Как выглядит выпущенный документ — нарисованное вёрсткой.
 *
 * ## Почему это стоит показывать
 *
 * Документ — единственное, что уходит из книги наружу и попадает в руки
 * покупателю. Про него спрашивают первым: «а что вы выдаёте?» Ответ
 * словами («племенное свидетельство и зоотехнический сертификат»)
 * не отвечает ни на что: их выдают все, и выглядят они у всех по-разному.
 *
 * Показанный бланк отвечает сразу на три вопроса — что в нём есть,
 * по какой форме он сделан и чем его можно проверить.
 *
 * ## Почему не снимок PDF
 *
 * Та же причина, что у нарисованной карточки животного: снимок стареет
 * молча, весит сотни килобайт и не переводится. Плюс четвёртая, здесь
 * главная: в настоящем документе стоят настоящие животные и настоящие
 * хозяйства, и выкладывать их на витрину нельзя. Нарисованное же видно,
 * что нарисовано.
 *
 * ## Что здесь честно
 *
 * Разделы, подписи и единицы — те же, что в выпускаемом бланке.
 * Значения выдуманы, и это сказано подписью под рисунком. На витрине,
 * где всё остальное проверяемо, одна подделка стоит дороже всей пользы.
 *
 * ## Почему английский бланк не перевод русского
 *
 * У формы Регламента (ЕС) 2016/1012 есть свои английские названия
 * разделов, и они старше нашего бланка. Перевод русских подписей обратно
 * дал бы похожие, но чужие слова — документ, который специалист узнаёт
 * по названиям граф, перестал бы узнаваться. Поэтому подписи взяты
 * из самой формы (`lib/book-screens-text.ts`).
 */
export function CertificateArt({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = screensText(locale).certificate

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
      {/* Шапка бланка: знак, вид документа и форма, по которой он сделан */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-ink-100 px-6 py-5 sm:px-8">
        <div>
          <PlemLogo />
          <p className="mt-2 text-[12px] uppercase tracking-[0.09em] text-ink-500">{t.book}</p>
        </div>

        <div className="text-right">
          <p className="text-[17px] font-medium leading-tight">{t.kind}</p>
          <p className="mt-1 max-w-[34ch] text-[12px] leading-snug text-ink-500">{t.form}</p>
        </div>
      </div>

      {/* Животное */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <dl className="space-y-2">
          {t.rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-500">{label}</dt>
              <dd className="text-[14px] font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-x-6">
          {[t.sire, t.dam].map((parent, i) => (
            <dl key={i} className="space-y-1.5">
              {parent.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">{label}</dt>
                  <dd className="text-[13px] leading-snug tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      </div>

      {/* Племенная ценность */}
      <div className="border-t border-ink-100 px-6 py-5 sm:px-8">
        <p className="text-[12px] uppercase tracking-[0.09em] text-ink-500">{t.valuesTitle}</p>

        <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-6">
          {t.values.map(([label, value]) => (
            <div key={label}>
              <div className="text-[15px] font-medium tabular-nums text-forest-600">{value}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Подвал бланка: чем проверяется */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-ink-100 bg-ink-50 px-6 py-4 sm:px-8">
        <div>
          <p className="text-[12px] text-ink-500">{t.issuedLabel}</p>
          <p className="text-[13px] tabular-nums">{t.issued}</p>
        </div>

        <div>
          <p className="text-[12px] text-ink-500">{t.codeLabel}</p>
          {/* Код проверки — не слово: он одинаков на любом языке страницы. */}
          <p className="text-[13px] font-medium tabular-nums">PLEM-4KX9-2M7A</p>
        </div>

        <p className="max-w-[36ch] text-[12px] leading-snug text-ink-500">{t.check}</p>
      </div>
    </div>
  )
}
