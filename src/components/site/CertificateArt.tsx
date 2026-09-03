import { PlemLogo } from '@/components/PlemLogo'

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
 */

const ROWS: [label: string, value: string][] = [
  ['Индивидуальный №', 'RU 4512 087'],
  ['Международный №', 'RUSF 000004512087'],
  ['Кличка', 'Ромашка'],
  ['Дата рождения', '11.09.2022'],
  ['Порода', 'Голштинская, HOL'],
  ['Кровность по голштину', '93,75 %'],
]

const SIRE: [string, string][] = [
  ['Отец', 'RR Linus'],
  ['№', 'HODEU000360023959'],
  ['Рождён', '12.02.2017'],
]

const DAM: [string, string][] = [
  ['Мать', 'Берёзка'],
  ['№', 'RUSF 000003910444'],
  ['Рождена', '04.03.2019'],
]

const VALUES: [string, string][] = [
  ['Удой, кг', '+1 154'],
  ['Жир, кг', '+13'],
  ['Белок, кг', '+25'],
  ['Соматика', '3,11'],
  ['Долголетие', '+2,7'],
  ['ИПЦ', '+460'],
]

export function CertificateArt() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
      {/* Шапка бланка: знак, вид документа и форма, по которой он сделан */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-ink-100 px-6 py-5 sm:px-8">
        <div>
          <PlemLogo />
          <p className="mt-2 text-[12px] uppercase tracking-[0.09em] text-ink-500">
            Племенная книга
          </p>
        </div>

        <div className="text-right">
          <p className="text-[17px] font-medium leading-tight">Зоотехнический сертификат</p>
          <p className="mt-1 max-w-[34ch] text-[12px] leading-snug text-ink-500">
            Форма по Регламенту (ЕС) 2016/1012 — пятнадцать разделов, два ряда предков
          </p>
        </div>
      </div>

      {/* Животное */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <dl className="space-y-2">
          {ROWS.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-500">{label}</dt>
              <dd className="text-[14px] font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-x-6">
          {[SIRE, DAM].map((parent, i) => (
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
        <p className="text-[12px] uppercase tracking-[0.09em] text-ink-500">Племенная ценность</p>

        <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-6">
          {VALUES.map(([label, value]) => (
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
          <p className="text-[12px] text-ink-500">Выдан</p>
          <p className="text-[13px] tabular-nums">14.08.2026 · Ассоциация</p>
        </div>

        <div>
          <p className="text-[12px] text-ink-500">Код проверки</p>
          <p className="text-[13px] font-medium tabular-nums">PLEM-4KX9-2M7A</p>
        </div>

        <p className="max-w-[36ch] text-[12px] leading-snug text-ink-500">
          Проверяется по коду на сайте книги. Выданный документ не меняется: правка данных
          создаёт новый, прежний остаётся с отметкой об отзыве.
        </p>
      </div>
    </div>
  )
}
