import { ROADMAP, STATE_LABEL, STATE_TONE, type RoadmapState } from '@/lib/roadmap'
import { plural } from '@/lib/format'

/**
 * Вкладка «Дорожная карта».
 *
 * Вёрстка повторяет вкладку версий: слева узкая колонка со сроком, справа —
 * что в него входит. Это не экономия усилий, а сообщение: сделанное
 * и намеченное — один и тот же список, просто прочитанный в разные стороны.
 * Читателю, который только что смотрел версии, не приходится заново
 * разбираться в устройстве страницы.
 *
 * Порядок прямой: ближайшее сверху. В версиях сверху последнее сделанное,
 * потому что там вопрос «что сейчас»; здесь вопрос «что дальше», и ответ
 * на него начинается с ближайшего.
 *
 * Состояние у каждой работы названо, включая неприятное. «Заблокировано»
 * вынесено в отдельное состояние и покрашено иначе: спрятать такую строку
 * среди планов значит пообещать срок там, где он не от нас зависит.
 */
export function EvolutionRoadmap() {
  const counts = ROADMAP.flatMap((h) => h.items).reduce<Record<string, number>>((acc, i) => {
    acc[i.state] = (acc[i.state] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      {/* --------------------------- Как читать ----------------------------- */}
      <section>
        <div className="card">
          <h2 className="text-[20px] font-medium">Как читать эту карту</h2>

          <p className="mt-3 max-w-[78ch] text-[15px] leading-relaxed text-ink-700">
            Сроки здесь — намерения, а не обязательства. Платформа на этапе альфы, и карта,
            написанная как договор, была бы договором, который никто не может выполнить.
            Зато состояние каждой работы названо честно, включая то, что от нас не зависит.
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(['inProgress', 'designed', 'planned', 'blocked'] as RoadmapState[]).map((s) => (
              <div key={s}>
                <dt>
                  <span className={`rounded-lg px-2.5 py-1 text-[13px] ${STATE_TONE[s]}`}>
                    {STATE_LABEL[s]}
                  </span>
                  <span className="ml-2 text-[13px] text-ink-500">{counts[s] ?? 0}</span>
                </dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-ink-500">{STATE_HINT[s]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --------------------------- Горизонты ------------------------------ */}
      <section className="mt-14">
        <h2 className="section-title">Что дальше</h2>

        <div className="mt-4">
          {ROADMAP.map((h) => (
            <article
              key={h.id}
              className="grid gap-x-8 gap-y-4 border-t border-ink-100 py-9 md:grid-cols-[132px_minmax(0,1fr)]"
            >
              {/*
                 Срок липкий по той же причине, что и номер выпуска в версиях:
                 в горизонте до семи работ, и к середине списка непонятно,
                 к какому сроку относится то, что читаешь.
              */}
              <div className="md:sticky md:top-6 md:self-start">
                <div className="text-[15px] font-medium text-ink-900">{h.when}</div>
                <div className="mt-1 text-[12px] text-ink-500">
                  {h.items.length} {plural(h.items.length, 'работа', 'работы', 'работ')}
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="text-[20px] font-medium leading-tight">{h.title}</h3>
                <p className="mt-3 max-w-[74ch] text-[15px] leading-relaxed text-ink-700">
                  {h.goal}
                </p>

                <ul className="mt-6 space-y-5">
                  {h.items.map((item) => (
                    <li key={item.title} className="border-l-2 border-l-ink-100 pl-5">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                        <h4 className="text-[16px] font-medium text-ink-900">{item.title}</h4>
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[12px] ${STATE_TONE[item.state]}`}
                        >
                          {STATE_LABEL[item.state]}
                        </span>
                        <span className="text-[12px] uppercase tracking-[0.06em] text-ink-300">
                          {item.area}
                        </span>
                      </div>

                      <p className="mt-2 max-w-[74ch] text-[15px] leading-relaxed text-ink-700">
                        {item.what}
                      </p>
                      <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed text-ink-500">
                        {item.why}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

const STATE_HINT: Record<RoadmapState, string> = {
  inProgress: 'делается прямо сейчас',
  designed: 'решение продумано и записано, кода пока нет',
  planned: 'работа названа, порядок понятен, сроки ориентировочные',
  blocked: 'ждём того, что не в нашей власти, — срок назвать нельзя',
}
