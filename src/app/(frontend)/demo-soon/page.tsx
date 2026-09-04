import type { Metadata } from 'next'
import { PlemLogo } from '@/components/PlemLogo'
import { BOOK_URL, PRODUCT_MAIL, SITE_HOSTS } from '@/lib/hosts'

export const metadata: Metadata = {
  title: 'Показательная книга готовится',
  /*
   * Описание есть, а показывать страницу в поиске незачем: она живёт
   * до запуска стенда и всё её содержание — «скоро». Найденная в выдаче
   * через год, она рассказала бы о нас ровно обратное задуманному.
   */
  description: 'Показательная книга с вымышленным стадом открывается позже.',
  robots: { index: false, follow: true },
}

/**
 * Заглушка показательной книги.
 *
 * ## Почему она существует
 *
 * Домен `demo.plem.online` направлен на то же приложение, что и книга
 * Ассоциации, а приложение одно и база одна. Арендатор меняет имя
 * и реквизиты, но не данные: без этой заглушки посетитель увидел бы
 * двести восемьдесят тысяч настоящих голштинских животных под словом
 * «демонстрация» — чужие данные, выданные за примерные.
 *
 * Так и случилось в день, когда домен наконец заработал. Заслонка
 * поставлена в тот же час.
 *
 * ## Почему заглушка, а не отключение домена
 *
 * Домен уже разошёлся по разговорам, и «сайт не открывается» читается
 * как «у них ничего не работает». Страница, которая честно говорит,
 * что стенд готовится, и уводит в действующую книгу, стоит того же
 * места и не оставляет ложного впечатления.
 *
 * Убирается переменной `DEMO_READY=1` на том развёртывании, где
 * показательная книга поднята со своей базой (`docs/demo-stend.md`).
 */
export default function DemoSoonPage() {
  const site = `https://${SITE_HOSTS[0]}`

  return (
    <main className="container-page flex min-h-[70vh] max-w-[70ch] flex-col justify-center py-16">
      <PlemLogo />

      <h1 className="mt-8 text-[30px] font-medium leading-tight sm:text-[38px]">
        Показательная книга готовится
      </h1>

      <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
        Здесь будет книга на демонстрационных данных: те же экраны, те же расчёты, придуманные
        животные. Она поднимается отдельно и со своей базой — показывать вместо примеров чужое
        стадо мы не станем.
      </p>

      <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
        Пока стенда нет, устройство видно на действующей книге Ассоциации производителей КРС
        голштинской породы: она открыта и работает на настоящих данных.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <a
          href={BOOK_URL}
          className="rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
        >
          Открыть племенную книгу
        </a>
        <a
          href={site}
          className="text-[15px] underline underline-offset-4 hover:text-forest-500"
        >
          О продукте
        </a>
        <a
          href={`mailto:${PRODUCT_MAIL}`}
          className="text-[15px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
        >
          {PRODUCT_MAIL}
        </a>
      </div>
    </main>
  )
}
