import Link from 'next/link'
import {
  AUDIENCE_LABEL,
  AUDIENCE_ORDER,
  CURRENT_VERSION,
  MILESTONES,
  findChange,
  type Change,
} from '@/lib/product-versions'
import { CloseOnEscape } from './ChangeDetails'
import { plural } from '@/lib/format'

/**
 * Вкладка «Версии» — журнал изменений платформы.
 *
 * Вёрстка как у журналов изменений цифровых продуктов: слева узкая колонка
 * с номером выпуска, справа — что в нём. Первый вариант ставил номер в одну
 * строку с заголовком, и страница читалась как поток абзацев: взгляду
 * не за что зацепиться, границы выпусков видны только по отступу.
 *
 * Порядок обратный: сверху последнее. Первый вопрос пришедшего — «что там
 * сейчас», а не «с чего всё начиналось».
 *
 * У каждой строки есть подробности — они открываются панелью справа.
 * Панель управляется адресной строкой, а не состоянием компонента:
 * ссылку на конкретное изменение можно переслать, и получатель увидит
 * ровно ту же панель. Это же избавляет страницу от клиентского кода:
 * весь текст подробностей остаётся на сервере и не уезжает в браузер
 * целиком ради одной открытой карточки.
 */
export function EvolutionVersions({ openVersion }: { openVersion?: string }) {
  const current = MILESTONES.find((m) => m.current)
  const past = MILESTONES.filter((m) => !m.current).reverse()

  const total = MILESTONES.reduce((sum, m) => sum + m.changes.length, 0)
  const open = findChange(openVersion)

  return (
    <>
      {/* --------------------------- Текущая версия -------------------------- */}
      <section>
        <div className="card">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-forest-500 px-3 py-1 font-mono text-[15px] text-white">
              {CURRENT_VERSION}
            </span>
            <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[13px] text-forest-600">
              текущая версия
            </span>
            <span className="text-[13px] text-ink-500">в работе прямо сейчас</span>
          </div>

          <h2 className="mt-5 text-[28px] font-medium leading-tight">{current?.title}</h2>

          <p className="mt-3 max-w-[74ch] text-[16px] leading-relaxed text-ink-700">
            {current?.value}
          </p>

          {current && current.changes.length > 0 && (
            <div className="mt-6 border-t border-ink-100 pt-5">
              <ChangeList changes={current.changes} openVersion={openVersion} />
            </div>
          )}
        </div>

        {/*
           Расшифровка номера — вне карточки и приглушённо: это сноска
           к номеру, а не часть выпуска. Внутри карточки она читалась как
           ещё один абзац описания и отбирала внимание у него.
        */}
        <p className="mt-4 max-w-[78ch] text-[14px] leading-relaxed text-ink-500">
          Ноль в начале номера — не формальность: публичного обещания совместимости пока нет,
          структура данных и контракты обмена могут измениться. Что значат остальные части номера
          и чем alpha отличается от беты — на вкладке «Этапы зрелости».
        </p>
      </section>

      {/* ------------------------------ История ----------------------------- */}
      <section className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="section-title">История выпусков</h2>
          <span className="text-[13px] text-ink-500">
            {MILESTONES.length} выпусков · {total} изменений
          </span>
        </div>

        <p className="mt-4 max-w-[78ch] text-[15px] leading-relaxed text-ink-700">
          Минорный выпуск отвечает на вопрос «что стало можно», под ним перечислено то,
          из чего он сложился. Нажмите на строку — справа откроется разбор: что именно было
          сделано и что это даёт породе, Ассоциации, хозяйству и сервисным организациям.
        </p>

        <p className="mt-3 max-w-[78ch] text-[14px] leading-relaxed text-ink-500">
          В списке только то, что меняло возможности системы. Исправления ошибок и внутренние
          работы по обслуживанию в него не входят, поэтому номера — указатель для чтения,
          а не история изменений кода. Номера выпусков проставлены задним числом.
        </p>

        <div className="mt-4">
          {past.map((m) => (
            <article
              key={m.version}
              className="grid gap-x-8 gap-y-4 border-t border-ink-100 py-9 md:grid-cols-[132px_minmax(0,1fr)]"
            >
              {/*
                 Номер выпуска липкий: у выпусков по восемь изменений,
                 и к середине списка непонятно, к какому выпуску относится
                 строка, которую читаешь.
              */}
              <div className="md:sticky md:top-6 md:self-start">
                <div className="font-mono text-[15px] font-medium text-ink-900">{m.version}</div>
                <div className="mt-1 text-[12px] text-ink-500">
                  {m.changes.length}{' '}
                  {plural(m.changes.length, 'изменение', 'изменения', 'изменений')}
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="text-[20px] font-medium leading-tight">{m.title}</h3>
                <p className="mt-3 max-w-[74ch] text-[15px] leading-relaxed text-ink-700">
                  {m.value}
                </p>
                <ChangeList changes={m.changes} openVersion={openVersion} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {open && <DetailsPanel change={open} />}
    </>
  )
}

/**
 * Изменения внутри одного выпуска.
 *
 * Номер моноширинным в колонке постоянной ширины: иначе заголовки начинаются
 * на разной высоте от левого края и список перестаёт просматриваться сверху
 * вниз. Вся строка — ссылка: нажимать в заголовок, а не в строку целиком,
 * значит промахиваться.
 */
function ChangeList({ changes, openVersion }: { changes: Change[]; openVersion?: string }) {
  return (
    <ul className="mt-5 -ml-2">
      {[...changes].reverse().map((c) => {
        const active = c.version === openVersion
        return (
          <li key={c.version}>
            <Link
              href={`/evolution?tab=versions&change=${c.version}`}
              scroll={false}
              aria-current={active ? 'true' : undefined}
              className={`flex gap-x-3 rounded-lg px-2 py-1.5 text-[14px] leading-relaxed transition-colors ${
                active ? 'bg-brand-50' : 'hover:bg-[#eaeaea]'
              }`}
            >
              <span
                className={`w-[68px] shrink-0 font-mono text-[13px] tabular-nums ${
                  active ? 'text-forest-600' : 'text-ink-300'
                }`}
              >
                {c.version}
              </span>
              <span className={`min-w-0 ${active ? 'font-medium text-forest-600' : 'text-ink-700'}`}>
                {c.title}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Боковая панель с разбором изменения.
 *
 * Панель, а не раскрывающийся блок под строкой. Раскрытие внутри списка
 * сдвигает всё, что ниже, и читатель теряет место, к которому шёл; после
 * закрытия страница прыгает обратно. Панель справа оставляет список на месте,
 * и по нему можно идти дальше, не закрывая разбор.
 *
 * Ценность разбита по сторонам намеренно. Одно и то же изменение значит
 * разное для селекционера, для Ассоциации, для хозяйства и для сервисной
 * компании, а общий абзац «это очень полезно» не говорит ни одному из них
 * ничего. Где стороне ничего не достаётся — строки просто нет: выдуманная
 * польза дороже молчания.
 */
function DetailsPanel({ change }: { change: Change }) {
  const closeHref = '/evolution?tab=versions'

  return (
    <>
      <CloseOnEscape href={closeHref} />

      {/*
         Подложка — ссылка на закрытие. Она же гасит содержимое под панелью:
         без неё панель читается как ещё одна колонка страницы, а не как
         то, что открыли и сейчас закроют.
      */}
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Закрыть подробности"
        className="fixed inset-0 z-40 bg-ink-900/20"
      />

      <aside
        aria-label={`Подробнее: ${change.title}`}
        className="panel-in fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-white shadow-[0_0_40px_rgb(23_24_26_/_0.18)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-7 py-6">
          <div className="min-w-0">
            <div className="font-mono text-[13px] text-ink-500">{change.version}</div>
            <h2 className="mt-1.5 text-[22px] font-medium leading-tight">{change.title}</h2>
          </div>

          <Link
            href={closeHref}
            scroll={false}
            aria-label="Закрыть"
            className="-mr-2 -mt-1 shrink-0 rounded-lg px-3 py-2 text-[20px] leading-none text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
          >
            ✕
          </Link>
        </header>

        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <section>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
              Что было сделано
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{change.what}</p>
          </section>

          <section className="mt-8">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
              Что это даёт
            </h3>

            <dl className="mt-4 space-y-5">
              {AUDIENCE_ORDER.filter((a) => change.value[a]).map((a) => (
                <div key={a} className="border-l-2 border-l-brand-100 pl-4">
                  <dt className="text-[13px] font-medium text-forest-600">{AUDIENCE_LABEL[a]}</dt>
                  <dd className="mt-1 text-[15px] leading-relaxed text-ink-700">
                    {change.value[a]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="mt-8 border-t border-ink-100 pt-5 text-[13px] leading-relaxed text-ink-500">
            Адрес этой страницы содержит номер изменения — ссылку можно переслать, и разбор
            откроется сразу.
          </p>
        </div>
      </aside>
    </>
  )
}
