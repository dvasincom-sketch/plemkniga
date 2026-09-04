import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { noticeFor, pick } from '@/lib/i18n/translated'
import {
  AREA_ORDER,
  STATE_CLASS,
  STATE_ORDER,
  byArea,
  countByState,
  type ComplianceItem,
  type ComplianceState,
  type ComplianceText,
  type Evidence,
} from '@/lib/compliance'
import {
  complianceAreaHint,
  complianceAreaTitle,
  complianceStateHint,
  complianceStateLabel,
  complianceText,
} from '@/lib/i18n/data/compliance'
import { COMPLIANCE_PAGE_TEXT, type CompliancePageText } from '@/lib/compliance-page-text'
import { BOOK_URL, isSharedPath } from '@/lib/hosts'

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
  return siteMetadata(locale, 'compliance', '/compliance')
}

/**
 * Соответствие: чему книга следует и чем это подтверждается.
 *
 * ## Зачем одна страница на всё
 *
 * Вопросов о соответствии четыре, и задают их разные люди. Эксперт
 * спрашивает про племенное дело, интегратор — про форматы обмена,
 * закупщик — про реестр отечественного ПО и ГОСТы, зарубежный партнёр —
 * на каком языке мы разговариваем. До сих пор ответы лежали в четырёх
 * документах и трёх страницах, и собрать их мог только тот, кто и так
 * всё знает.
 *
 * ## Почему у каждой строки стоит доказательство
 *
 * Заявление «соответствует» стоит ровно столько, сколько стоит способ
 * его проверить. Поэтому у позиции есть ссылка на прогон, страницу,
 * файл или документ — а позиция без доказательства может быть только
 * в состоянии «в плане» или «вне области».
 *
 * Что ссылки ведут на существующее, следит `npm run check:compliance`.
 * Ссылка на несуществующий прогон хуже отсутствия соответствия: первое —
 * обман, второе — пробел.
 *
 * ## Почему сводка вверху честная, а не выгодная
 *
 * Первым числом стоит «выполнено», и оно самое маленькое. Обратный
 * порядок — от плана к сделанному — читался бы как список намерений,
 * а прятать три позиции среди двадцати трёх значило бы прятать
 * и остальные двадцать: читатель, поймавший умолчание в одном месте,
 * перестаёт верить всей странице.
 *
 * ## Почему «закрыто извне» отдельно от «в плане»
 *
 * Членство в ICAR требует санкционной декларации, а членство в EHRC
 * приостановлено с июля 2022 года. Записать это в план значило бы
 * пообещать то, что от нас не зависит.
 *
 * ## Почему на странице не осталось набранного текста
 *
 * Это страница, ради которой иностранный читатель сюда и приходит:
 * он ищет ответ на вопрос, на каком языке система разговаривает
 * с чужими системами. Абзац, набранный прямо в разметке, перевода
 * не видит — заголовок приходил переведённым, а тело оставалось
 * русским, и страница отвечала на этот вопрос раньше и хуже любого
 * текста. Слова страницы теперь в `lib/compliance-page-text.ts`,
 * а описания позиций — в словарях `lib/i18n/data/compliance.<язык>.ts`,
 * откуда их выдаёт `complianceText` по одному языку для всех шести.
 *
 * ## Где смотреть
 *
 * Список — `src/lib/compliance.ts`; правится там, а не здесь.
 */
export default async function CompliancePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.compliance
  const trust = PAGE_MESSAGES[locale].trust

  const picked = pick(COMPLIANCE_PAGE_TEXT, locale)
  const text = picked.value

  /*
   * Оговорка «текст ниже по-русски» стоит только там, где он и правда
   * русский. Показанная на английской странице, где переведено всё,
   * она извиняется за то, чего нет, — и обесценивает ту же строку там,
   * где она сказана по делу.
   */
  const notice = noticeFor(locale, picked.fallback)

  /*
   * Описания позиций идут за языком, на котором показан текст, а не
   * за языком в адресе. Если проза страницы откатилась на русский,
   * то и реестр под ней русский: третий язык на одной странице читается
   * хуже, чем откат, о котором сказано оговоркой.
   */
  const shown = picked.shown

  const words = complianceText(shown)
  const stateLabel = complianceStateLabel(shown)
  const stateHint = complianceStateHint(shown)
  const areaTitle = complianceAreaTitle(shown)
  const areaHint = complianceAreaHint(shown)

  const counts = countByState()

  return (
    <>
      <ProductHeader locale={locale} path="/compliance" />

      <main className="container-page pb-8">
        <p className="text-[14px] uppercase tracking-wide text-forest-500">{frame.eyebrow}</p>

        <h1 className="max-w-[26ch] mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
          {frame.title}
        </h1>

        <p className="mt-5 max-w-[75ch] text-[17px] leading-relaxed text-ink-700">{frame.lead}</p>

        {notice && (
          <p className="mt-5 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
            {notice}
          </p>
        )}

        {/*
           Довод о доверии стоит на первом экране страницы соответствия,
           потому что именно здесь читатель ищет печать и не находит её.
           Неназванная слабость додумывается в худшую сторону; названная
           становится частью разговора, которым управляем мы.
        */}
        <div className="mt-8 max-w-[75ch] rounded-2xl border border-brand-100 bg-brand-50 p-6 sm:p-7">
          <h2 className="text-[18px] font-medium leading-tight">{trust.title}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{trust.body}</p>
        </div>

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          {text.intro.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>

        {/*
           Сводка стоит до списка и начинается с наименьшего числа.
           Порядок от плана к сделанному читался бы как список намерений.
        */}
        <div className="card mt-8 flex flex-wrap gap-x-8 gap-y-4">
          {STATE_ORDER.map((state) => (
            <div key={state} className="min-w-[9rem]">
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-medium tabular-nums">{counts[state]}</span>
                <span className={`rounded-md px-2 py-0.5 text-[12px] ${STATE_CLASS[state]}`}>
                  {stateLabel[state]}
                </span>
              </div>
              <p className="mt-1.5 max-w-[24ch] text-[12px] leading-snug text-ink-500">
                {stateHint[state]}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          {text.scale.lead}{' '}
          <Link
            href={`/${locale}/icar`}
            className="underline underline-offset-4 hover:text-forest-500"
          >
            {text.scale.link}
          </Link>{' '}
          {text.scale.tail}
        </p>

        {/*
           Ответ на вопрос, который задают первым: «а можно закрыть всё?».
           Без него список читается как перечень недоделок, и владелец
           системы разумно требует их доделать — при том, что часть
           не доделывается ни за какие деньги на разработку.

           Числа считаются из самого реестра — там же, где собирается
           текст. Написать их словами значило бы завести второе место,
           где состояние живёт, — и то, которое отстанет первым, окажется
           как раз на самом видном месте.
        */}
        <div className="card mt-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
          <p>
            <strong className="font-medium">{text.closed.strong}</strong>
            {text.closed.after}
          </p>
          <p className="mt-3">{text.closed.ours}</p>
        </div>

        {AREA_ORDER.map((area) => {
          const items = byArea(area)
          if (!items.length) return null

          return (
            <section key={area} className="mt-14">
              <h2 className="text-[26px] font-medium leading-tight">{areaTitle[area]}</h2>
              <p className="mt-1.5 text-[14px] text-ink-500">{areaHint[area]}</p>

              <div className="mt-6 space-y-4">
                {items.map((item) => (
                  <Item
                    key={item.key}
                    item={item}
                    words={words(item.key)}
                    stateLabel={stateLabel}
                    text={text}
                  />
                ))}
              </div>
            </section>
          )
        })}

        <div className="mt-16 max-w-[80ch] rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
          <h2 className="text-[22px] font-medium leading-tight">{text.sources.title}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">{text.sources.body}</p>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-500">{text.sources.marks}</p>
        </div>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}

function Item({
  item,
  words,
  stateLabel,
  text,
}: {
  item: ComplianceItem
  words: ComplianceText
  stateLabel: Record<ComplianceState, string>
  text: CompliancePageText
}) {
  return (
    <div className="rounded-2xl border border-ink-100 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[17px] font-medium leading-snug">{words.title}</h3>
          <p className="mt-1 text-[13px] text-ink-500">{words.org}</p>
        </div>
        <span className={`flex-none rounded-md px-2 py-0.5 text-[12px] ${STATE_CLASS[item.state]}`}>
          {stateLabel[item.state]}
        </span>
      </div>

      <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
        <span className="text-ink-500">{text.item.what}</span> {words.what}
      </p>

      <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
        <span className="text-ink-500">{text.item.ours}</span> {words.ours}
      </p>

      {words.next && (
        <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
          <span className="text-ink-500">{text.item.next}</span> {words.next}
        </p>
      )}

      {/*
         Кто должен действовать, кроме нас. Стоит после «что дальше»
         и до доказательств: сперва читатель узнаёт работу, потом — что
         она не наша. Обратный порядок читался бы как отговорка вперёд
         объяснения.
      */}
      {words.external && (
        <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
          <span className="text-ink-500">{text.item.external}</span> {words.external}
        </p>
      )}

      {(item.evidence.length > 0 || item.source) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-100 pt-4 text-[13px]">
          {item.evidence.map((e) => (
            <EvidenceLink key={`${e.kind}:${e.value}`} evidence={e} labels={text.evidence} />
          ))}

          {item.source && (
            <a
              href={item.source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-500 underline underline-offset-4 transition-colors hover:text-forest-500"
            >
              {words.source ?? item.source.label} ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Доказательство: страница открывается ссылкой, остальное показывается текстом.
 *
 * Прогон, файл и документ ссылкой не сделать — они живут в исходниках,
 * а не в вебе. Показывать их как ссылку, ведущую в никуда, хуже, чем
 * показать имя: по имени находят за секунду, по битой ссылке идут
 * и не находят.
 *
 * ## Два домена среди доказательств
 *
 * Сама эта страница живёт на витрине, а половина доказательств ведёт
 * в книгу: кабинет с профилями индекса, «Эволюция продукта», выгрузка
 * во ФГИАС ПР. Другая половина — сквозные страницы, которые переехали
 * сюда же (`/icar`, `/api-docs`).
 *
 * Различать их по виду адреса нельзя — они выглядят одинаково. Признак
 * берётся из того же списка, по которому страницы и переезжали
 * (`lib/hosts.ts`): что в нём есть, то живёт здесь, остальное на домене
 * книги и требует полного адреса. Одна ошибка здесь означает ссылку,
 * ведущую в «страница не найдена», — то есть ровно то, ради чего вся
 * эта страница и написана: битое доказательство хуже отсутствующего.
 */
function EvidenceLink({
  evidence,
  labels,
}: {
  evidence: Evidence
  labels: CompliancePageText['evidence']
}) {
  if (evidence.kind === 'page') {
    const local = isSharedPath(evidence.value.split(/[?#]/)[0]!)

    return local ? (
      <Link href={evidence.value} className="underline underline-offset-4 hover:text-forest-500">
        {evidence.value}
      </Link>
    ) : (
      <a
        href={`${BOOK_URL}${evidence.value}`}
        className="underline underline-offset-4 hover:text-forest-500"
      >
        {evidence.value}
      </a>
    )
  }

  const text = evidence.kind === 'check' ? `npm run ${evidence.value}` : evidence.value

  return (
    <span className="text-ink-500">
      <span className="text-ink-300">{labels[evidence.kind]}: </span>
      <code className="font-mono text-[12px] text-ink-700">{text}</code>
    </span>
  )
}
