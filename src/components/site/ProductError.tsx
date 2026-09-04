import Link from 'next/link'
import { PRODUCT_MAIL } from '@/lib/hosts'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'
import { PRODUCT_ERROR_TEXT, type ProductWayKey } from '@/lib/product-error-text'

/**
 * Страницы отказа на витрине: «не найдено» и «не загрузилось».
 *
 * ## Почему у витрины свои, а не общие с книгой
 *
 * Общие показывали знак голштинской ассоциации, самарский адрес
 * и предложение поискать животное по номеру — человеку, который пришёл
 * прочитать про продукт и ошибся адресом. Ошибка при этом становится
 * второй: сперва не та страница, потом не та организация.
 *
 * ## Про шутку
 *
 * Она здесь ровно одна и держится на нашем же обещании: книга находит
 * животное по номеру среди сотен тысяч, а собственную страницу
 * не нашла. Самоирония дешевле извинений и, в отличие от них, сообщает
 * что-то о продукте.
 *
 * Границу видно по трём правилам. Шутка не над читателем — он ничего
 * не сделал не так, адрес мог устареть у нас. Шутка не над предметом:
 * племенной учёт для того, кто пришёл, работа, а не повод повеселиться.
 * И шутка одна: вторая подряд превращает отказ в представление, а он
 * должен кончиться дорогой дальше.
 *
 * ## Почему дороги отсюда именно эти
 *
 * Их четыре, и это не оглавление. Человек, попавший на несуществующий
 * адрес витрины, пришёл за одним из четырёх: посмотреть, что за продукт,
 * какие породы, по каким правилам он устроен и как выглядит работающая
 * книга. Полный список разделов здесь был бы предложением начать сначала.
 *
 * ## Где слова
 *
 * В `lib/product-error-text.ts`, вместе с доводом, почему набор строк
 * отдельный и почему об откате на русский здесь не объявляют. Пока
 * фразы стояли в разметке, английская витрина показывала переведённую
 * шапку, переведённый подвал и русский отказ посередине.
 */

/*
 * Адреса дорог лежат здесь, а подписи — в наборе строк.
 *
 * Адрес одинаков на всех языках и меняется вместе с разметкой сайта,
 * подпись переводится и меняется вместе с текстом. Держать их вместе
 * значило бы просить переводчика не задеть ссылку, а нас — не забыть
 * ссылку при переводе.
 */
const WAYS: { key: ProductWayKey; href: string }[] = [
  { key: 'about', href: '' },
  { key: 'breeds', href: '/breeds' },
  { key: 'rules', href: '/rules' },
  { key: 'compliance', href: '/compliance' },
]

export function ProductNotFound({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = pick(PRODUCT_ERROR_TEXT, locale).value.notFound

  return (
    <div className="max-w-[75ch] pt-10">
      <p className="text-[14px] uppercase tracking-wide text-ink-400">{t.eyebrow}</p>

      <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">{t.title}</h1>

      <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{t.body}</p>

      <h2 className="mt-10 text-[15px] font-medium">{t.waysTitle}</h2>

      <ul className="mt-4 space-y-3">
        {WAYS.map((w) => (
          <li key={w.key} className="text-[15px] leading-relaxed">
            <Link
              href={`/${locale}${w.href}`}
              className="font-medium underline underline-offset-4 hover:text-forest-500"
            >
              {t.ways[w.key].label}
            </Link>
            <span className="text-ink-500"> — {t.ways[w.key].hint}</span>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-[14px] leading-relaxed text-ink-500">
        {t.mailLead}{' '}
        <a href={`mailto:${PRODUCT_MAIL}`} className="underline underline-offset-4">
          {PRODUCT_MAIL}
        </a>{' '}
        {t.mailTail}
      </p>
    </div>
  )
}

type ProductFailedProps = {
  digest?: string
  /**
   * Язык страницы, на которой случился отказ.
   *
   * Со значением по умолчанию, в отличие от обычных страниц витрины:
   * границу ошибок вызывает Next, и языка у неё под рукой может
   * не оказаться вовсе (`app/(frontend)/error.tsx`). Русский здесь —
   * запасной язык союза, а не «главный» (`i18n/locales.ts`).
   */
  locale?: Locale
}

/**
 * «Не загрузилось» — это отказ нашей стороны, и тон здесь другой.
 *
 * Шутить, когда виноваты мы, нельзя: читатель ничего не выбирал
 * и ничего не сделал, ему просто не показали страницу. Поэтому здесь
 * ровно то, что ему нужно: что случилось, что с данными и что делать.
 *
 * Отпечаток ошибки показан не для красоты. По нему запись находится
 * в логе за секунды, и человек, приславший его в письме, экономит нам
 * час поисков — а нам ещё придётся объяснять, почему час ушёл.
 */
export function ProductFailed({ digest, locale = DEFAULT_LOCALE }: ProductFailedProps) {
  const t = pick(PRODUCT_ERROR_TEXT, locale).value.failed

  return (
    <div className="max-w-[75ch] pt-10">
      <p className="text-[14px] uppercase tracking-wide text-ink-400">{t.eyebrow}</p>

      <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">{t.title}</h1>

      <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{t.body}</p>

      <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{t.help}</p>

      {digest && (
        <p className="mt-6 rounded-xl bg-ink-50 px-4 py-3 font-mono text-[13px] text-ink-700">
          {digest}
        </p>
      )}

      <p className="mt-8 text-[15px] leading-relaxed">
        <a
          href={`mailto:${PRODUCT_MAIL}`}
          className="font-medium underline underline-offset-4 hover:text-forest-500"
        >
          {PRODUCT_MAIL}
        </a>
      </p>
    </div>
  )
}
