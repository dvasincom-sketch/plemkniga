import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { CHECKS, CHECK_GROUPS, type CheckSpec } from '@/lib/checks-registry'
import { plural } from '@/lib/format'

/*
 * Заголовок, описание и указание основной страницы — из одного места
 * (`lib/seo.ts`). Описание берётся из подводки самой страницы: она уже
 * написана и переведена, а второе описание для робота никто не читает
 * и потому никто не правит.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return siteMetadata(locale, 'rules', '/rules')
}

/**
 * Каталог правил, по которым книга спорит с записью.
 *
 * ## Почему копия, а не ссылка в кабинет
 *
 * Такой же список есть в кабинете хозяйства, рядом с подачей
 * на верификацию. Он там на своём месте: его открывают, когда
 * собираются подавать. Но кабинет закрыт входом, а число «полсотни
 * правил» стоит на первом экране витрины — и человек, нажавший на него,
 * входа не имеет и иметь не должен.
 *
 * Копии данных при этом нет: обе страницы читают один реестр
 * (`lib/checks-registry.ts`). Разъехаться им негде, а разойтись
 * по назначению они обязаны — в кабинете список рабочий, здесь
 * показательный.
 *
 * ## Почему правила показываются посторонним вообще
 *
 * Затем же, зачем экзаменатор объявляет программу заранее. Скрытые
 * правила выглядят произволом: запись отклонена, а почему — узнают
 * из замечания через две недели. Названные заранее правила превращают
 * отказ в предсказуемое событие, к которому можно подготовиться.
 *
 * Отдельно для того, кто ещё ничего не ведёт: этот список и есть ответ
 * на вопрос «чем книга отличается от таблицы». Таблица принимает всё.
 *
 * ## Почему без базы
 *
 * Страница витринная, и ходить в базу ей незачем: правила — это текст
 * реестра, а не данные. Заодно она открывается на домене, где базы
 * может не быть вовсе.
 */
export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.rules
  const notice = PAGE_MESSAGES[locale].notice

  const rules = CHECKS as readonly CheckSpec[]

  /*
   * Номер правила — его место в реестре, считая с единицы.
   *
   * Нужен он для разговора: «посмотри правило 45» короче и точнее, чем
   * «ну то, про кровность потомка». До сих пор такого номера не было
   * вовсе, и в переписке правила называли пересказом — а пересказ
   * у двоих собеседников редко совпадает.
   *
   * Номер берётся из порядка в реестре, а не пишется рядом с правилом.
   * Написанный руками, он разъехался бы с порядком при первой вставке
   * в середину; посчитанный — не может. Плата за это названа честно:
   * вставка нового правила в середину сдвигает номера следующих,
   * и потому новые правила дописываются в конец своей группы.
   *
   * Свой код у правила при этом есть и остаётся главным ключом
   * (`no-birth-date`): он не меняется никогда и уезжает в выгрузки.
   * Номер — для людей, код — для машин.
   */
  const numberOf = new Map(rules.map((c, i) => [c.code, i + 1]))
  const fix = rules.filter((c) => c.severity === 'fix').length
  const note = rules.length - fix
  const withThreshold = rules.filter((c) => c.threshold).length

  const NUMBERS = [
    { value: String(rules.length), label: 'правил в реестре' },
    { value: String(fix), label: 'останавливают подачу до исправления' },
    { value: String(note), label: 'предупреждают, но не мешают работать' },
    { value: String(withThreshold), label: 'имеют числовую границу, названную вслух' },
  ]

  return (
    <>
      <ProductHeader locale={locale} path="/rules" />

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

        {/* -------------------------------- Числа ------------------------------- */}
        <section className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map((n) => (
            <div key={n.label} className="rounded-2xl border border-ink-100 bg-white p-5">
              <div
                className={`stat-value text-[30px] leading-none text-forest-600 sm:text-[34px]`}
              >
                {n.value}
              </div>
              <p className="mt-3 max-w-[24ch] text-[13px] leading-snug text-ink-500">{n.label}</p>
            </div>
          ))}
        </section>

        {/* ---------------------------- Два веса правил ------------------------- */}
        <section className="mt-12 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Почему не все находки одинаковы
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Правило либо останавливает подачу, либо предупреждает. Разница не в строгости,
            а в том, может ли правило ошибаться. «Отец моложе потомка» ошибаться не может —
            это противоречие, и запись с ним не должна уходить в реестр. «Удой выше двадцати
            пяти тысяч» ошибаться может: такая корова редка, но возможна, и запретить её
            значило бы поручиться за то, чего мы не знаем.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Поэтому предупреждение остаётся предупреждением, и решение — за человеком.
            Правило, которое всегда право, и правило, которое обычно право, различаются
            в книге по существу, а не оттенком плашки.
          </p>
        </section>

        {/* ------------------------------- Каталог ------------------------------ */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Список</h2>

          <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-500">
            У каждого правила есть номер — на него можно сослаться в письме или в разговоре
            с поддержкой: «правило 45». Номер отражает место в реестре и меняется, если
            в середину списка добавят новое; неизменный ключ правила — его код, он уезжает
            в выгрузки и остаётся прежним навсегда.
          </p>

          <div className="mt-8 space-y-12">
            {CHECK_GROUPS.map((group) => {
              const items = rules.filter((c) => c.group === group.key)
              if (items.length === 0) return null

              return (
                <div key={group.key}>
                  <div className="max-w-[75ch]">
                    <h3 className="text-[19px] font-medium leading-tight">
                      {group.label}
                      <span className="ml-3 text-[14px] font-normal text-ink-400">
                        {items.length} {plural(items.length, 'правило', 'правила', 'правил')}
                      </span>
                    </h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{group.intro}</p>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {items.map((c) => (
                      <div
                        key={c.code}
                        className="rounded-2xl border border-ink-100 bg-white p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-[15px] font-medium leading-snug">
                            <span
                              className={`stat-value mr-2 text-ink-300`}
                            >
                              {numberOf.get(c.code)}
                            </span>
                            {c.label}
                          </h4>
                          {/*
                             Вес правила назван словом, а не цветом: цвет
                             сообщает настроение, а нам надо сообщить, что
                             будет с записью.
                          */}
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] ${
                              c.severity === 'fix'
                                ? 'bg-[#f7e9e5] text-[#9e3520]'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {c.severity === 'fix' ? 'исправить' : 'предупреждение'}
                          </span>
                        </div>

                        <p className="mt-3 text-[14px] leading-relaxed text-ink-700">{c.what}</p>
                        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">{c.why}</p>

                        {c.threshold && (
                          <p className="mt-3 border-t border-ink-100 pt-2 text-[12px] tabular-nums text-ink-400">
                            Граница: {c.threshold}
                          </p>
                        )}

                        {/*
                           Правило, которого база и так не пропустит, помечено
                           отдельно. Иначе оно читается в отчёте как непроверенное:
                           «не сработало ни разу» и «нечему появиться» — разные
                           вещи, и различить их можно только здесь.
                        */}
                        {c.dbGuard && (
                          <p className="mt-2 text-[12px] leading-snug text-ink-400">
                            Такие данные не пропускает и сама база — правило остаётся
                            для записей, пришедших со стороны.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
