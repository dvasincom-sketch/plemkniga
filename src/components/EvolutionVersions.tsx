import { CURRENT_VERSION, MILESTONES } from '@/lib/product-versions'

/**
 * Вкладка «Версии» — что появлялось в платформе и в каком порядке.
 *
 * Порядок обратный: сверху последнее. Первый вопрос пришедшего — «что там
 * сейчас», а не «с чего всё начиналось»; прямой порядок заставляет
 * прокручивать всю историю, чтобы добраться до настоящего.
 *
 * Два уровня подробности намеренно. Минорная версия отвечает на вопрос
 * «что стало можно» — это читают все. Патчи под ней — заголовки коммитов
 * с хешами: их читает тот, кто хочет увидеть, из чего блок сложился,
 * и найти конкретное изменение в репозитории. Одним списком это не сводится:
 * восемьдесят строк подряд перестают читаться уже на второй минорной версии.
 *
 * Почему без дат. Дата отвечает на вопрос «когда мы это сделали» — вопрос
 * разработчика. Читателю нужен порядок: что стало возможно и на чём держится
 * следующее.
 *
 * Вёрстка без вынесенных наружу маркеров. Первый вариант рисовал ленту
 * с точками на отрицательном отступе; выглядело лучше, но точка, выехавшая
 * за границу колонки, налезает на текст при любом сбое стилей и на узком
 * экране. Полоса слева и отступ — то же самое по смыслу и не ломается.
 */
export function EvolutionVersions() {
  const current = MILESTONES.find((m) => m.current)
  // Хронология в данных прямая — она там и должна быть прямой; переворот
  // делается на показе, чтобы порядок хранения не зависел от вкуса вёрстки
  const past = MILESTONES.filter((m) => !m.current).reverse()

  const total = MILESTONES.reduce((sum, m) => sum + m.patches.length, 0)

  return (
    <>
      <section>
        <h2 className="section-title mb-6">Текущая версия</h2>

        <div className="card border-l-4 border-l-forest-500">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-[22px] font-medium text-ink-900">
              {CURRENT_VERSION}
            </span>
            <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[13px] text-forest-600">
              alpha · в работе
            </span>
          </div>

          <h3 className="mt-3 text-[20px] font-medium">{current?.title}</h3>
          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            {current?.value}
          </p>

          {current && current.patches.length > 0 && <PatchList patches={current.patches} />}

          {/*
             Расшифровка номера стоит здесь, а не в подписи мелким шрифтом:
             «0.11.0-alpha» без объяснения читается как «почти готово,
             осталось до единицы чуть-чуть», а означает ровно обратное.
          */}
          <p className="mt-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Ноль в начале номера — не формальность. Он говорит, что публичного обещания
            совместимости пока нет: структура данных и контракты API могут измениться
            без сохранения обратной совместимости. Что значат остальные части номера
            и чем alpha отличается от беты — на вкладке «Этапы зрелости».
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="section-title mb-2">Что было до этого</h2>
        <p className="mb-8 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
          Одиннадцать блоков работы и {total} изменений в них — от последнего к первому.
          Минорная версия отвечает на вопрос «что стало можно», под ней перечислены коммиты,
          из которых она сложилась. Номера проставлены задним числом: тегов в репозитории
          не было, и притворяться, что были, незачем.
        </p>

        <div className="space-y-8">
          {past.map((m) => (
            <article key={m.version} className="border-l-2 border-l-ink-100 pl-6">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="text-[19px] font-medium">{m.title}</h3>
                <span className="font-mono text-[13px] text-ink-500">{m.version}</span>
              </div>

              <p className="mt-2 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                {m.value}
              </p>

              <PatchList patches={m.patches} />
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

/**
 * Список изменений внутри одной минорной версии.
 *
 * Номер и хеш моноширинным и приглушённо, заголовок обычным: читают
 * заголовки, а номер и хеш нужны только тогда, когда нашлось интересное
 * и надо посмотреть в репозитории. Колонка номера фиксированной ширины —
 * иначе заголовки начинаются на разной высоте от левого края и список
 * перестаёт просматриваться сверху вниз.
 */
function PatchList({ patches }: { patches: { version: string; hash: string; title: string }[] }) {
  return (
    <ul className="mt-4 space-y-1.5">
      {[...patches].reverse().map((p) => (
        <li key={p.hash} className="flex flex-wrap gap-x-3 text-[14px] leading-relaxed">
          <span className="w-[92px] shrink-0 font-mono text-[13px] text-ink-500">{p.version}</span>
          <span className="min-w-0 flex-1 text-ink-700">{p.title}</span>
          <span className="font-mono text-[12px] text-ink-300">{p.hash}</span>
        </li>
      ))}
    </ul>
  )
}
