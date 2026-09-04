import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { NOTES } from '@/lib/notes'
import { pageMetadata } from '@/lib/seo'
import { isLocale, type Locale } from '@/lib/i18n/locales'

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: 'Разборы — как устроено то, что считает книга',
    description:
      'Откуда взяты числа, на которых работают индекс и отчёты: источник, что с ним сделано ' +
      'и чего по нему делать нельзя. Пишем сами, подписываемся именем.',
    path: '/ru/razbory',
  })
}

/**
 * Список разборов.
 *
 * ## Почему список короткий и не притворяется длинным
 *
 * Двум материалам не нужны ни разбивка по темам, ни поиск, ни лента
 * «читайте также». Заводить их заранее — обещать раздел, которого нет;
 * человек видит рубрикатор на два элемента и делает верный вывод, что
 * здесь ничего не происходит. Пустая полка хуже короткой.
 *
 * ## Почему на карточке стоит дата
 *
 * Разбор — высказывание, а не справка, и у высказывания есть время.
 * Дата говорит две вещи сразу: на каком состоянии дел он написан
 * и жив ли раздел. Второе читатель проверяет первым, и прятать это
 * бесполезно — он посмотрит по другим признакам и решит хуже.
 */
export default async function NotesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale: Locale = raw

  return (
    <>
      <ProductHeader locale={locale} />

      <main className="container-page pb-16">
        <section className="max-w-[75ch]">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">Разборы</p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
            Как устроено то, что считает книга
          </h1>

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">
            Книга просит верить своим числам потому, что их можно пересчитать. Здесь
            показано, откуда взято каждое: источник, что мы с ним сделали, где у источника
            не нашлось нужного и чего по этим числам выводить нельзя.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-500">
            Не перевод чужих статей и не пересказ: под каждым разбором стоит имя, и оно
            отвечает за ошибку. Отдельным разделом в каждом — чего работа не доказывает.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          {NOTES.map((n) => (
            <Link
              key={n.slug}
              href={`/${locale}/razbory/${n.slug}`}
              className="block max-w-[75ch] rounded-2xl border border-ink-100 bg-white p-6 transition-colors hover:border-forest-500 sm:p-8"
            >
              <h2 className="text-[20px] font-medium leading-snug sm:text-[22px]">{n.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{n.lead}</p>
              <p className="mt-4 text-[13px] text-ink-400">
                {n.author} ·{' '}
                {new Date(n.date).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </Link>
          ))}
        </section>

        {/*
           Почему раздел по-русски — сказано на самой странице, а не только
           в комментарии к коду: читатель на казахском адресе видит русский
           текст и вправе знать, что это не поломка.
        */}
        <p className="mt-10 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
          Разборы выходят только по-русски. Шесть языков от текста, вся ценность которого
          в точности формулировок, дали бы пять машинных переводов — и обесценили бы
          оригинал. Появится проверенный перевод — появится и язык.
        </p>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
