import { TRAIT_BASE, type IndexProfile } from '@/lib/breeding-index'
import { sharesOf } from '@/lib/index-profiles'

/**
 * Веса профиля одной картинкой.
 *
 * Таблица из одиннадцати чисел не отвечает на вопрос, ради которого сюда
 * приходят: «на что этот профиль давит». Полоски отвечают — крупная сразу
 * видна, а отрицательный вес нарисован в другую сторону и другим цветом,
 * иначе «минус восемь» читается как маленькое положительное число.
 *
 * Признаки с нулевым весом не показываются: в профиле «Разгрузить роддом»
 * их треть, и они только удлиняют список.
 */

const label = (key: string) => TRAIT_BASE.find((t) => t.key === key)?.label ?? key

export function ProfileWeights({
  profile,
  /** С чем сравнивать: серая метка официального веса на той же полосе. */
  compare,
  limit,
}: {
  profile: IndexProfile
  compare?: IndexProfile
  limit?: number
}) {
  const shares = sharesOf(profile)
    .filter((s) => s.share !== 0)
    .sort((a, b) => Math.abs(b.share) - Math.abs(a.share))
  const shown = limit ? shares.slice(0, limit) : shares
  const hidden = shares.length - shown.length

  const cmp = compare ? new Map(sharesOf(compare).map((s) => [s.key, s.share])) : null
  const max = Math.max(...shares.map((s) => Math.abs(s.share)), 1)
  const suffix = profile.kind === 'economic' ? ' ₽' : ' %'

  return (
    <div>
      <ul className="space-y-1.5">
        {shown.map((s) => {
          const width = (Math.abs(s.share) / max) * 100
          const negative = s.share < 0
          const other = cmp?.get(s.key)
          return (
            <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] leading-tight">{label(s.key)}</p>
                <div className="mt-1 h-[6px] rounded-full bg-ink-100">
                  <div
                    style={{ width: `${width}%` }}
                    className={`h-full rounded-full ${negative ? 'bg-[#c0392b]' : 'bg-forest-500'}`}
                  />
                </div>
              </div>
              <p className="whitespace-nowrap text-right text-[13px] tabular-nums">
                {s.share > 0 ? '+' : ''}
                {s.share.toFixed(profile.kind === 'economic' ? 0 : 0)}
                {suffix}
                {other !== undefined && Math.round(other) !== Math.round(s.share) && (
                  <span className="ml-1.5 text-ink-500" title="В стандартном профиле Ассоциации">
                    ({other > 0 ? '+' : ''}
                    {other.toFixed(0)})
                  </span>
                )}
              </p>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-[12px] text-ink-500">и ещё {hidden} признаков с меньшим весом</p>
      )}
    </div>
  )
}
