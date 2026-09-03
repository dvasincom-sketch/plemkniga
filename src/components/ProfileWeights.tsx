import { TRAIT_BASE, type IndexProfile } from '@/lib/breeding-index'
import { sharesOf } from '@/lib/index-profiles'
import { plural } from '@/lib/format'

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
 *
 * ## У экономического профиля порядок другой, и это не мелочь
 *
 * Веса там — рубли на единицу признака, а единицы у признаков разные.
 * «5 400 ₽ за балл вымени» против «1 320 ₽ за килограмм жира» читается
 * как «вымя вчетверо важнее», и это неверно: килограммы жира у животных
 * расходятся на десятки, баллы вымени — на единицы. На обычный шаг —
 * то есть на одно генетическое отклонение — жир даёт около пятнадцати
 * тысяч рублей против пяти с половиной у вымени.
 *
 * Поэтому у экономического профиля длина полосы и порядок строк
 * считаются по весу на шаг, а число рядом остаётся ценой за единицу:
 * оно и есть то, что правит хозяйство в своём профиле. Пара «полоса
 * про влияние, число про цену» подписана внизу — без подписи она
 * выглядела бы расхождением.
 *
 * У селекционного профиля этой беды нет: там веса уже в долях одной
 * шкалы, и сравнивать их между собой можно прямо.
 */

const traitOf = (key: string) => TRAIT_BASE.find((t) => t.key === key)

export function ProfileWeights({ profile, limit }: { profile: IndexProfile; limit?: number }) {
  const economic = profile.kind === 'economic'

  const shares = sharesOf(profile)
    .filter((s) => s.share !== 0)
    .map((s) => {
      const trait = traitOf(s.key)
      return {
        ...s,
        unit: trait?.unit ?? '',
        /** Чем меряется вес при сравнении признаков между собой. */
        weight: economic ? s.share * (trait?.sd ?? 1) : s.share,
      }
    })
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))

  const shown = limit ? shares.slice(0, limit) : shares
  const hidden = shares.length - shown.length

  const max = Math.max(...shares.map((s) => Math.abs(s.weight)), 1)

  return (
    <div>
      <ul className="space-y-1.5">
        {shown.map((s) => {
          const width = (Math.abs(s.weight) / max) * 100
          const negative = s.share < 0
          return (
            <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] leading-tight">
                  {traitOf(s.key)?.label ?? s.key}
                </p>
                <div className="mt-1 h-[6px] rounded-full bg-ink-100">
                  <div
                    style={{ width: `${width}%` }}
                    className={`h-full rounded-full ${negative ? 'bg-[#c0392b]' : 'bg-forest-500'}`}
                  />
                </div>
              </div>
              <p className="whitespace-nowrap text-right text-[13px] tabular-nums">
                {s.share > 0 ? '+' : '−'}
                {economic
                  ? Math.round(Math.abs(s.share)).toLocaleString('ru-RU')
                  : Math.abs(s.share).toFixed(0)}
                {economic ? ' ₽' : ' %'}
                {/*
                   Единица у экономического веса обязательна: «+5 400 ₽»
                   без неё не отвечает на вопрос «за что» и потому
                   не проверяется. У селекционного единица одна на всех —
                   проценты, — и повторять её у каждой строки незачем.
                */}
                {economic && s.unit && (
                  <span className="text-[11px] text-ink-400"> / {s.unit}</span>
                )}
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

      {economic && (
        <p className="mt-3 text-[11px] leading-snug text-ink-400">
          Число — цена за единицу признака. Длина полосы — вес на обычный шаг признака:
          единицы у признаков разные, и сравнивать цены между собой напрямую нельзя.
        </p>
      )}
    </div>
  )
}
