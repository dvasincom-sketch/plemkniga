import { InfoTip } from './InfoTip'
import { TRAIT_BASE, type Base, type IndexProfile, type TraitKey } from '@/lib/breeding-index'
import { influenceShares } from '@/lib/index-profiles'

/**
 * Одна таблица вместо семи карточек: чем профили отличаются друг от друга.
 *
 * Карточка показывает профиль сам по себе и отсортирована по его же весам:
 * в одной жир первый, в другой третий. Пока листаешь их подряд, ответить
 * на вопрос «а чем, собственно, „Молоко на сыр“ отличается от стандартного»
 * невозможно — глазу не за что зацепиться.
 *
 * Здесь признаки стоят в фиксированном порядке, профили — колонками, и разница
 * видна строкой: белок 14 % у Ассоциации против 34 % в сырном профиле.
 *
 * Экономический профиль приведён к той же шкале умножением рублей на σ
 * признака — иначе его колонка была бы в других единицах и сравнивать
 * было бы нечего. В самом расчёте индекса он по-прежнему считается в рублях.
 */

export function ProfileComparison({
  profiles,
  base,
  activeKey,
}: {
  profiles: IndexProfile[]
  base: Base
  activeKey?: string
}) {
  const columns = profiles.map((p) => ({
    profile: p,
    shares: new Map(influenceShares(p, base).map((s) => [s.key, s.share])),
  }))

  // Признаки, у которых хоть где-то есть вес: пустые строки только удлиняют таблицу
  const rows = TRAIT_BASE.filter((t) =>
    columns.some((c) => Math.abs(c.shares.get(t.key) ?? 0) >= 0.5),
  )

  const cell = (share: number | undefined) => {
    const v = share ?? 0
    if (Math.abs(v) < 0.5) return <span className="text-ink-300">—</span>
    return (
      <span className={v < 0 ? 'text-[#c0392b]' : undefined}>
        {v > 0 ? '+' : '−'}
        {Math.abs(v).toFixed(0)}
      </span>
    )
  }

  /** Насколько вес отличается от стандартного профиля — для подсветки. */
  const standard = columns[0]?.shares

  return (
    <section className="mt-12">
      <h2 className="text-[22px] font-medium leading-tight">
        Чем профили отличаются{' '}
        <InfoTip>
          Доля влияния признака в индексе, %. Для экономического профиля рубли переведены
          в эту шкалу умножением на σ признака — иначе колонки были бы в разных единицах
        </InfoTip>
      </h2>
      <p className="mt-1.5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
        Доля влияния признака, проценты. Заметно выделенные значения — те, что расходятся
        со стандартным профилем Ассоциации больше чем в полтора раза: именно они и делают
        профиль другим.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="data-table w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="text-left">Признак</th>
              {columns.map((c) => (
                <th
                  key={c.profile.key}
                  className={`whitespace-normal text-right ${
                    c.profile.key === activeKey ? 'text-forest-600' : ''
                  }`}
                >
                  {c.profile.name}
                  {c.profile.key === activeKey && (
                    <span className="block text-[11px] font-normal text-forest-600">основной</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.key}>
                <td>
                  <span className="text-[14px]">{t.label}</span>
                  <span className="ml-1.5 text-[12px] text-ink-500">{t.unit}</span>
                </td>
                {columns.map((c) => {
                  const v = c.shares.get(t.key) ?? 0
                  const ref = standard?.get(t.key) ?? 0
                  /*
                   * Выделяем не «больше» и «меньше», а «сильно иначе»: профиль
                   * отличается не парой процентов, а сменой приоритета.
                   */
                  const notable =
                    c.shares !== standard &&
                    Math.abs(v) >= 5 &&
                    (Math.abs(ref) < 0.5 || Math.abs(v) / Math.abs(ref) >= 1.5)
                  return (
                    <td
                      key={c.profile.key}
                      className={`text-right tabular-nums ${notable ? 'font-medium' : ''} ${
                        c.profile.key === activeKey ? 'bg-brand-50' : ''
                      }`}
                    >
                      {cell(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
