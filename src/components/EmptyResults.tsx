import Link from 'next/link'
import { FILTER_KEYS, one, queryWithout, type SearchParams } from '@/lib/animal-query'

/**
 * Пустая выдача с объяснением, что делать дальше.
 *
 * Строка «ничего не найдено» оставляет пользователя в тупике: он не знает,
 * какое из заданных условий отсекло всё. Поэтому предлагаем снять условия
 * по одному, начиная с последнего заданного.
 */
export function EmptyResults({
  sp,
  hasActive,
  labels,
}: {
  sp: SearchParams
  hasActive: boolean
  /** Человекочитаемые названия активных условий: ключ → «Возраст: Бык». */
  labels: Record<string, string>
}) {
  const active = FILTER_KEYS.filter((k) => one(sp[k]))

  if (!hasActive) {
    return (
      <div className="rounded-card bg-white p-10 text-center">
        <p className="text-[17px] font-medium">В книге пока нет записей</p>
        <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-500">
          Данные появятся, как только хозяйства загрузят своё поголовье
          и Ассоциация подтвердит первые пакеты.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-card bg-white p-10">
      <p className="text-[17px] font-medium">Под эти условия не подошло ни одно животное</p>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-500">
        Возможно, условия слишком узкие или в книге пока нет таких записей.
        Попробуйте снять одно из них:
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {active.map((key) => (
          <Link
            key={key}
            href={`${queryWithout(sp, key)}#results`}
            className="rounded-lg bg-[#f1f1f1] px-3 py-2 text-[13px] transition-colors hover:bg-[#e7e7e7]"
          >
            Без условия «{labels[key] ?? key}»
          </Link>
        ))}

        <Link href="/#results" className="btn btn-brand">
          Сбросить всё
        </Link>
      </div>
    </div>
  )
}
