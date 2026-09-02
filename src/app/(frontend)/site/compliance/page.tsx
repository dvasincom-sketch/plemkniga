import type { Metadata } from 'next'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import {
  AREA_HINT,
  AREA_ORDER,
  AREA_TITLE,
  COMPLIANCE,
  STATE_CLASS,
  STATE_HINT,
  STATE_LABEL,
  STATE_ORDER,
  byArea,
  countByState,
  type ComplianceItem,
  type Evidence,
} from '@/lib/compliance'
import { plural } from '@/lib/format'
import { BOOK_URL, isSharedPath } from '@/lib/hosts'

export const metadata: Metadata = { title: 'Соответствие' }

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
 * ## Где смотреть
 *
 * Список — `src/lib/compliance.ts`; правится там, а не здесь.
 */

const EVIDENCE_LABEL: Record<Evidence['kind'], string> = {
  check: 'прогон',
  page: 'страница',
  code: 'код',
  doc: 'документ',
}

export default function CompliancePage() {
  const counts = countByState()

  return (
    <>
      <ProductHeader />

      <main className="container-page pb-8">
        <h1 className="text-[38px] font-medium sm:text-[46px]">Соответствие</h1>

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            Стандарты, методологии и своды правил, которым следует племенная книга, — с честным
            состоянием по каждому. У всего, что заявлено сделанным, стоит ссылка на то, чем это
            подтверждается: прогон, страница, файл или документ.
          </p>
          <p>
            Список написан без оглядки на то, как он выглядит. Специалист, открывший систему,
            всё равно найдёт то, о чём здесь умолчали, — и дальше не поверит ничему. Знать
            границы за десять минут выгоднее обеим сторонам, чем узнавать их на третьем месяце
            внедрения.
          </p>
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
                <span
                  className={`rounded-md px-2 py-0.5 text-[12px] ${STATE_CLASS[state]}`}
                >
                  {STATE_LABEL[state]}
                </span>
              </div>
              <p className="mt-1.5 max-w-[24ch] text-[12px] leading-snug text-ink-500">
                {STATE_HINT[state]}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          Всего {COMPLIANCE.length}{' '}
          {plural(COMPLIANCE.length, 'позиция', 'позиции', 'позиций')} в{' '}
          {AREA_ORDER.length} разделах. «Закрыто извне» — не «руки не дошли»: членство в ICAR
          требует санкционной декларации, а членство в европейской конфедерации приостановлено
          решением от июля 2022 года.{' '}
          <Link href="/icar" className="underline underline-offset-4 hover:text-forest-500">
            Разбор по разделам руководств ICAR
          </Link>{' '}
          — отдельной страницей.
        </p>

        {AREA_ORDER.map((area) => {
          const items = byArea(area)
          if (!items.length) return null

          return (
            <section key={area} className="mt-14">
              <h2 className="text-[26px] font-medium leading-tight">{AREA_TITLE[area]}</h2>
              <p className="mt-1.5 text-[14px] text-ink-500">{AREA_HINT[area]}</p>

              <div className="mt-6 space-y-4">
                {items.map((item) => (
                  <Item key={item.key} item={item} />
                ))}
              </div>
            </section>
          )
        })}

        <div className="mt-16 max-w-[80ch] rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
          <h2 className="text-[22px] font-medium leading-tight">Откуда взяты оценки</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
            Состояния расставлены по разбору открытых источников: уставы и анкеты организаций,
            тексты стандартов там, где они открыты, списки членов, регламенты использования
            знаков. Там, где факт не удалось подтвердить первоисточником, это сказано прямо
            в самом разборе. Порядок работ и обоснование очерёдности — в отдельном плане.
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-500">
            Знаки и марки организаций на этой странице не используются: они выдаются по статусу
            члена или по пройденной проверке, а не за соответствие правилам. Утверждение
            о собственной работе разрешено всем и без всякого членства — им и ограничиваемся.
          </p>
        </div>
      </main>

      <ProductFooter />
    </>
  )
}

function Item({ item }: { item: ComplianceItem }) {
  return (
    <div className="rounded-2xl border border-ink-100 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[17px] font-medium leading-snug">{item.title}</h3>
          <p className="mt-1 text-[13px] text-ink-500">{item.org}</p>
        </div>
        <span
          className={`flex-none rounded-md px-2 py-0.5 text-[12px] ${STATE_CLASS[item.state]}`}
        >
          {STATE_LABEL[item.state]}
        </span>
      </div>

      <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
        <span className="text-ink-500">Что требует.</span> {item.what}
      </p>

      <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
        <span className="text-ink-500">Что у нас.</span> {item.ours}
      </p>

      {item.next && (
        <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
          <span className="text-ink-500">Что дальше.</span> {item.next}
        </p>
      )}

      {(item.evidence.length > 0 || item.source) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-100 pt-4 text-[13px]">
          {item.evidence.map((e) => (
            <EvidenceLink key={`${e.kind}:${e.value}`} evidence={e} />
          ))}

          {item.source && (
            <a
              href={item.source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-500 underline underline-offset-4 transition-colors hover:text-forest-500"
            >
              {item.source.label} ↗
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
function EvidenceLink({ evidence }: { evidence: Evidence }) {
  if (evidence.kind === 'page') {
    const local = isSharedPath(evidence.value.split(/[?#]/)[0]!)

    return local ? (
      <Link
        href={evidence.value}
        className="underline underline-offset-4 hover:text-forest-500"
      >
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
      <span className="text-ink-300">{EVIDENCE_LABEL[evidence.kind]}: </span>
      <code className="font-mono text-[12px] text-ink-700">{text}</code>
    </span>
  )
}
