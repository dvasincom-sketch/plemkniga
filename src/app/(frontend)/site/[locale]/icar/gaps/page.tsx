import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ICAR_GAP_COUNT, ICAR_WIKI, ICAR_WITH_GAPS } from '@/lib/icar-map'
import { plural } from '@/lib/format'

/*
 * Единственная страница витрины, у которой не было ни описания,
 * ни указания основной версии, — нашёл `check:seo`. Заголовок был,
 * и потому пропажа не бросалась в глаза.
 */
export const metadata: Metadata = {
  title: 'Чего не хватает до руководств ICAR',
  description:
    'Разбор пробелов по разделам руководств ICAR: чего в книге нет, чем это грозит ' +
    'и что нужно, чтобы закрыть. Названо нами, а не найдено проверяющим.',
  alternates: { canonical: '/ru/icar/gaps' },
}

/**
 * Разбор пробелов: чего в книге нет, чем это грозит и что для этого нужно.
 *
 * ## Зачем такая страница вообще
 *
 * На карте соответствия стояло «частично» без объяснений — то есть слово,
 * которое не сообщает ничего. Читатель волен был понять его и как «почти
 * всё готово», и как «почти ничего»; оба прочтения одинаково обоснованы,
 * и значит, слово стояло зря.
 *
 * ## Почему пробелы описаны так подробно и так невыгодно
 *
 * Потому что иначе они описаны не будут. Список недостатков, написанный
 * с оглядкой на то, как он выглядит, превращается в список достоинств
 * с оговорками, и первый же специалист, открывший систему, найдёт то,
 * о чём здесь умолчали, — и дальше не поверит уже ничему.
 *
 * Заводчик или эксперт, читающий эту страницу, узнаёт границы системы
 * за десять минут вместо трёх месяцев внедрения. Это выгодная сделка
 * для обеих сторон, и невыгодной она кажется только до первого разговора,
 * начатого не с обмана.
 *
 * ## Форма: три вопроса на каждый пробел
 *
 * «Чего нет», «почему это важно», «что для этого нужно». Третий пункт
 * обязателен: пробел без ответа на вопрос «что делать» — это жалоба,
 * а не работа. Там, где сделать нельзя (закрыто членством, требует решения
 * Ассоциации, требует научной работы), так и написано — это тоже ответ.
 *
 * ## Где смотреть
 *
 * Список общий с картой: `src/lib/icar-map.ts`. Правится там, а не здесь.
 */
export default async function IcarGapsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const notice = PAGE_MESSAGES[locale].notice

  return (
    <>
      <ProductHeader locale={locale} path="/icar/gaps" />

      <main className="container-page pb-8">
        <Breadcrumbs
          items={[{ label: 'Руководства ICAR', href: '/icar' }, { label: 'Чего не хватает' }]}
        />

        <h1 className="text-[38px] font-medium sm:text-[46px]">Чего не хватает</h1>

        {notice && (
          <p className="mt-5 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
            {notice}
          </p>
        )}

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            На{' '}
            <Link href={`/${locale}/icar`} className="underline underline-offset-4 hover:text-forest-500">
              карте соответствия
            </Link>{' '}
            против каждого раздела стоит «частично». Здесь сказано, что именно за этим словом:{' '}
            {ICAR_GAP_COUNT} {plural(ICAR_GAP_COUNT, 'пробел', 'пробела', 'пробелов')} по{' '}
            {ICAR_WITH_GAPS.length}{' '}
            {plural(ICAR_WITH_GAPS.length, 'разделу', 'разделам', 'разделам')}.
          </p>
          <p>
            Список написан без оглядки на то, как он выглядит. Специалист, открывший систему,
            всё равно найдёт то, о чём здесь умолчали, — и дальше не поверит ничему. Знать
            границы за десять минут выгоднее обеим сторонам, чем узнавать их на третьем месяце
            внедрения.
          </p>
        </div>

        {/*
           Оглавление ссылками на якоря: пробелов полтора десятка, и человек,
           пришедший из таблицы по ссылке на конкретный раздел, должен видеть,
           что рядом есть остальные, — но не должен ради этого прокручивать
           всю страницу обратно.
        */}
        <nav aria-label="Разделы" className="mt-8 flex flex-wrap gap-x-4 gap-y-2">
          {ICAR_WITH_GAPS.map((s) => (
            <a
              key={s.slug}
              href={`#${s.slug}`}
              className="text-[14px] text-ink-500 underline underline-offset-4 transition-colors hover:text-forest-500"
            >
              {s.title}{' '}
              <span className="tabular-nums text-ink-300">({s.gaps.length})</span>
            </a>
          ))}
        </nav>

        {ICAR_WITH_GAPS.map((s) => (
          <section key={s.slug} id={s.slug} className="mt-14 scroll-mt-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-[26px] font-medium leading-tight">{s.title}</h2>
              <a
                href={`${ICAR_WIKI}${s.wiki}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] tabular-nums text-ink-500 underline underline-offset-4 hover:text-forest-500"
              >
                Section {s.section} ↗
              </a>
            </div>

            <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">{s.about}</p>

            <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              <span className="text-ink-700">Как сейчас.</span> {s.ours}
            </p>

            <div className="mt-6 space-y-4">
              {s.gaps.map((g) => (
                <div key={g.what} className="rounded-2xl border border-ink-100 p-6">
                  <h3 className="max-w-[70ch] text-[17px] font-medium leading-snug">{g.what}</h3>

                  <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                    <span className="text-ink-500">Чем это грозит.</span> {g.why}
                  </p>

                  <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                    <span className="text-ink-500">Что для этого нужно.</span> {g.need}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-16 max-w-[80ch] rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
          <h2 className="text-[22px] font-medium leading-tight">Что из этого зависит не от кода</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
            Часть пробелов закрывается работой, часть — решением, и путать их не стоит.
            Разделы племенной книги, состав признаков экстерьера и структура методов контроля —
            это решения Ассоциации: система умеет и так, и иначе, а выбирать должен тот,
            кто отвечает за породу. Расчёт генетических параметров по российской популяции —
            работа научного учреждения. Международное сравнение оценок и сертификация качества
            ведения книги упираются в членство в ICAR, и это{' '}
            <Link href={`/${locale}/icar`} className="underline underline-offset-4 hover:text-forest-500">
              отдельный разговор
            </Link>
            , в котором от нас зависит немногое.
          </p>
        </div>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
