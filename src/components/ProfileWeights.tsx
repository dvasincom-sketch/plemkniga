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
 *
 * Сравнения со стандартным профилем здесь больше нет: цифра в скобках рядом
 * с весом требовала подсказки, чтобы понять, что она значит, и всё равно
 * не давала сравнить профили между собой — они отсортированы каждый по-своему.
 * На этот вопрос отвечает общая таблица внизу страницы.
 */

const label = (key: string) => TRAIT_BASE.find((t) => t.key === key)?.label ?? key

const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}

export function ProfileWeights({ profile, limit }: { profile: IndexProfile; limit?: number }) {
  const shares = sharesOf(profile)
    .filter((s) => s.share !== 0)
    .sort((a, b) => Math.abs(b.share) - Math.abs(a.share))
  const shown = limit ? shares.slice(0, limit) : shares
  const hidden = shares.length - shown.length

  const max = Math.max(...shares.map((s) => Math.abs(s.share)), 1)
  const suffix = profile.kind === 'economic' ? ' ₽' : ' %'

  return (
    <div>
      <ul className="space-y-1.5">
        {shown.map((s) => {
          const width = (Math.abs(s.share) / max) * 100
          const negative = s.share < 0
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
                {s.share > 0 ? '+' : '−'}
                {profile.kind === 'economic'
                  ? Math.round(Math.abs(s.share)).toLocaleString('ru-RU')
                  : Math.abs(s.share).toFixed(0)}
                {suffix}
              </p>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-[12px] text-ink-500">
          и ещё {hidden} {plural(hidden, 'признак', 'признака', 'признаков')} с меньшим весом
        </p>
      )}
    </div>
  )
}
