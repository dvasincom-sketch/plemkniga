import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { TermsSeen } from '@/components/site/TermsSeen'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbLd, graph } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/seo'
import { fgiasPageBySlug, templateOf } from '@/lib/fgias-pages'
import { FGIAS_MEASURED_AT } from '@/lib/fgias-templates'

/*
 * Собирается на каждый запрос: у маршрута два изменяемых куска адреса,
 * `[locale]` и `[slug]`, и перечислить заранее можно только второй.
 * Разбор — на странице словаря, где та же строка стоит по той же
 * причине и где рассказано, чем это кончилось, когда её не было.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = fgiasPageBySlug(slug)
  if (!page) return { title: 'Шаблон ФГИАС ПР' }

  return pageMetadata({
    title: page.title,
    description: page.lead,
    path: `/ru/fgias/${slug}`,
  })
}

/**
 * Один шаблон ФГИАС ПР.
 *
 * ## Почему одна страница на весь раздел
 *
 * Двадцать шаблонов устроены одинаково: что реестр хочет, какие колонки
 * обязательны, что кладёт книга, где отказ. Заведи мы по файлу
 * на шаблон — шесть заголовков разошлись бы на третьей странице,
 * а порядок частей на пятой, и раздел перестал бы читаться как раздел.
 * У разборов наоборот, и по своей причине: там текст ходит в код
 * за числами и рисует таблицы, каких нет больше нигде.
 *
 * ## Почему числа колонок берутся связью, а не пишутся
 *
 * Имя шаблона связывает страницу с реестром `FGIAS_TEMPLATES`, откуда
 * приходят число колонок, число заполняемых и дата замера. Написанные
 * второй раз, они разошлись бы с обзорной страницей, и читатель поверил
 * бы той, что короче.
 */
export default async function FgiasTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const page = fgiasPageBySlug(slug)
  if (!page) notFound()

  const template = templateOf(page)

  return (
    <>
      <JsonLd
        data={graph(
          breadcrumbLd([
            { name: 'ФГИАС ПР', path: '/ru/fgias' },
            { name: page.title, path: `/ru/fgias/${page.slug}` },
          ]),
        )}
      />

      <ProductHeader locale="ru" />

      <main className="container-page pb-16">
        <nav className="text-[14px] text-ink-500">
          <Link href="/ru/fgias" className="underline underline-offset-4 hover:text-forest-500">
            ФГИАС ПР
          </Link>
        </nav>

        <section className="mt-6 max-w-[75ch]">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">
            Шаблон «{page.template}»
          </p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
            {page.title}
          </h1>

          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{page.lead}</p>

          {/*
             Паспорт шаблона — числа связью, а не словами. Дата замера
             стоит рядом с числом заполнения намеренно: «книга кладёт
             девять из тринадцати» без даты читается как вечная истина,
             а это замер по живой базе на конкретный день.
          */}
          {template && (
            <dl className="mt-6 grid grid-cols-1 gap-4 rounded-2xl bg-ink-50 p-6 sm:grid-cols-3">
              <div>
                <dt className="text-[13px] text-ink-500">Колонок в шаблоне</dt>
                <dd className="mt-1 text-[22px] font-medium">{template.columns}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-500">Из них кладёт книга</dt>
                <dd className="mt-1 text-[22px] font-medium">{template.fill}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-500">Замер по живой базе</dt>
                <dd className="mt-1 text-[15px]">{FGIAS_MEASURED_AT}</dd>
              </div>
            </dl>
          )}
        </section>

        <Prose title="Что это за шаблон" body={page.what} />

        {/* ----------------------- Обязательные колонки ---------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Обязательные колонки
          </h2>

          <dl className="mt-5 space-y-4">
            {page.required.map((r) => (
              <div key={r.name} className="border-t border-ink-100 pt-4">
                <dt className="text-[16px] font-medium">{r.name}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-ink-700">{r.note}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Prose title="Что кладёт книга" body={page.ours} />

        {/* --------------------------- Где спотыкаются ----------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Где спотыкаются
          </h2>

          <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
            Отказ реестра называет колонку, а не причину. Ниже — что за ним стоит.
          </p>

          <dl className="mt-5 space-y-4">
            {page.errors.map((e) => (
              <div key={e.error} className="border-t border-ink-100 pt-4">
                <dt className="text-[15px] font-medium">{e.error}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-ink-700">{e.means}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Prose title="Чего книга не кладёт и почему" body={page.gaps} />
        <Prose title="Чего этот шаблон не закрывает" body={page.limits} />

        <TermsSeen slugs={page.terms} />

        {page.see && page.see.length > 0 && (
          <section className="mt-14 max-w-[75ch]">
            <h2 className="text-[20px] font-medium leading-tight">Читать дальше</h2>
            <ul className="mt-4 space-y-2">
              {page.see.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="text-[15px] underline underline-offset-4 hover:text-forest-500"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <ProductFooter lang="ru" />
    </>
  )
}

/** Раздел из абзацев. Пустой не рисуется: заголовок без текста обещает. */
function Prose({ title, body }: { title: string; body: string[] }) {
  if (body.length === 0) return null

  return (
    <section className="mt-14 max-w-[75ch]">
      <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">{title}</h2>
      {body.map((p) => (
        <p key={p.slice(0, 40)} className="mt-5 text-[16px] leading-relaxed text-ink-700">
          {p}
        </p>
      ))}
    </section>
  )
}
