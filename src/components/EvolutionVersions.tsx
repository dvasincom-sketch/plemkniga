import { CURRENT_VERSION, MILESTONES } from '@/lib/product-versions'

/**
 * Вкладка «Версии» — что появлялось в платформе и в каком порядке.
 *
 * Почему без дат. Дата отвечает на вопрос «когда мы это сделали» — вопрос
 * разработчика. Читателю нужен другой ответ: что стало возможно и на чём
 * держится следующее. Порядок это передаёт, календарь только отвлекает
 * и провоцирует считать скорость вместо содержания.
 *
 * Почему сверху текущая, а ниже прошлые в прямом порядке. Первое, что нужно
 * узнать пришедшему, — где система сейчас; это отдельным блоком. А историю
 * читают от начала: она объясняет, почему возможности именно такие, и обратный
 * порядок эту связку рвёт.
 */
export function EvolutionVersions() {
  const current = MILESTONES.find((m) => m.current)
  const past = MILESTONES.filter((m) => !m.current)

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

          {/*
             Расшифровка номера стоит здесь, а не в подписи мелким шрифтом:
             «0.11.0-alpha» без объяснения читается как «почти готово,
             осталось до единицы чуть-чуть», а означает ровно обратное.
          */}
          <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Ноль в начале номера — не формальность. Он говорит, что публичного обещания
            совместимости пока нет: структура данных и контракты API могут измениться
            без сохранения обратной совместимости. Что значат остальные части номера
            и чем alpha отличается от беты — на вкладке «Этапы зрелости».
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="section-title mb-2">Что было до этого</h2>
        <p className="mb-6 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
          Одиннадцать вех в том порядке, в каком они появлялись. Номера версий проставлены
          задним числом — тегов в репозитории не было, и притворяться, что были, незачем.
          Ценность списка не в номерах, а в ответе на вопрос «что стало можно после этого».
        </p>

        {/*
           Вертикальная линия слева связывает вехи в одну последовательность.
           Пробовали карточками в сетке — получался каталог возможностей,
           где порядок не читается, а он здесь и есть главное содержание.
        */}
        <ol className="relative space-y-8 border-l border-ink-200 pl-8">
          {past.map((m) => (
            <li key={m.version} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[38px] top-[7px] h-2.5 w-2.5 rounded-full bg-ink-300"
              />
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="text-[19px] font-medium">{m.title}</h3>
                <span className="font-mono text-[13px] text-ink-500">{m.version}</span>
              </div>
              <p className="mt-2 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                {m.value}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
