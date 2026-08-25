import { signed } from '@/lib/format'
import { exteriorDirection, type ExteriorTrait } from '@/lib/dictionaries'

/**
 * Линейные признаки экстерьера — двумя блоками, а не одним.
 *
 * ## Почему признаки разведены
 *
 * У девяти признаков из восемнадцати лучшее значение посередине шкалы,
 * а не на краю: слишком мелкое вымя так же плохо, как слишком глубокое,
 * сильно приподнятый таз — как сильно свислый. Пока все они нарисованы
 * одинаково, читатель понимает полосу вправо как «лучше» — и понимает
 * неправильно ровно в половине строк.
 *
 * Lactanet переделывал у себя это отдельным решением генетического совета
 * и назвал причину теми же словами: восприятие такого показа — что всё
 * справа лучше, а для признаков с промежуточным оптимумом это неверно.
 * Разведение по блокам — их же приём, и он дешевле любого другого:
 * не требует ни новых данных, ни объяснений в тексте.
 *
 * ## Почему у каждой строки написано направление
 *
 * «Глубина вымени −1,49» не отвечает на вопрос, что это значит. Число
 * читается, только если помнить наизусть, куда растёт шкала у каждого
 * из восемнадцати признаков; таких людей на всю страну несколько десятков,
 * а карточку открывают тысячи. «Глубже среднего» отвечает сразу.
 *
 * Знак при этом остаётся: он нужен тому, кто сравнивает двух быков
 * и складывает разницу. Слово — для чтения, число — для счёта.
 *
 * ## Почему полоса у признаков с оптимумом красится иначе
 *
 * У направленного признака цвет отделяет отклонение вниз от отклонения
 * вверх — это разные вещи, и одна из них хуже. У признака с оптимумом
 * посередине обе крайности равно нежелательны, и красить их разными
 * цветами значило бы намекать, что одна лучше. Поэтому там цвет один
 * на обе стороны, а точка отсчёта подписана «оптимум».
 */

export type ExteriorRow = { key: string; label: string; value?: number | null }

const SCALE_MIN = -2.5
const SCALE_MAX = 2.5
const pct = (v: number) => ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100

function Bar({ value, middle }: { value?: number | null; middle?: boolean }) {
  if (value === null || value === undefined) {
    return <div className="relative h-6" />
  }
  const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, value))
  const zero = pct(0)
  const here = pct(clamped)
  const left = Math.min(zero, here)
  const width = Math.abs(here - zero)
  const negative = clamped < 0

  /*
   * У признака с оптимумом посередине цвет одинаков с обеих сторон:
   * обе крайности равно нежелательны, и разный цвет намекал бы, что одна
   * из них лучше.
   */
  const fill = middle ? 'bg-ink-400' : negative ? 'bg-forest-700' : 'bg-brand-300'

  return (
    <div className="relative h-6">
      {[-2, -1, 0, 1, 2].map((t) => (
        <span
          key={t}
          className={`absolute top-0 h-full ${t === 0 ? 'w-px bg-ink-300' : 'w-px bg-ink-100'}`}
          style={{ left: `${pct(t)}%` }}
          aria-hidden="true"
        />
      ))}
      <span
        className={`absolute top-1 h-4 rounded-[2px] ${fill}`}
        style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
      />
    </div>
  )
}

const digits = (v?: number | null) =>
  v !== null && v !== undefined && Math.abs(v % 1) > 0.05 ? 2 : 1

function ScaleHead({ middle }: { middle?: boolean }) {
  return (
    <thead>
      <tr className="bg-[#f0f0f0] text-ink-700">
        <th className="w-[40%] rounded-tl-lg px-3.5 pb-1.5 pt-2.5 text-left font-normal">
          Признак
        </th>
        <th className="px-3.5 pb-1.5 pt-2.5 text-center font-normal">
          {middle ? 'Отклонение от оптимума' : 'Профиль'}
        </th>
        <th className="w-[22%] px-3.5 pb-1.5 pt-2.5 text-right font-normal">Что это значит</th>
        <th className="w-[12%] rounded-tr-lg px-3.5 pb-1.5 pt-2.5 text-right font-normal">
          Оценка
        </th>
      </tr>
      <tr className="bg-[#f0f0f0] text-ink-500">
        <th className="rounded-bl-lg" />
        <th className="px-3.5 pb-2 font-normal">
          <span className="relative flex h-4 w-full items-center">
            {[-2, -1, 0, 1, 2].map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 text-xs"
                style={{ left: `${pct(t)}%` }}
              >
                {/*
                   У признаков с оптимумом посередине ноль подписан
                   словом, а не цифрой: цифра здесь — просто отметка
                   шкалы, а слово говорит, что именно это значение
                   и есть лучшее.
                */}
                {middle && t === 0 ? 'оптимум' : t > 0 ? `+${t}` : t}
              </span>
            ))}
          </span>
        </th>
        <th />
        <th className="rounded-br-lg" />
      </tr>
    </thead>
  )
}

function TraitRows({ rows, middle }: { rows: (ExteriorRow & { trait: ExteriorTrait })[]; middle?: boolean }) {
  return (
    <tbody>
      {rows.map((t) => (
        <tr key={t.key} className="border-b border-[#ededed] last:border-0">
          <td className="py-2.5 pr-3 align-middle leading-snug">
            {t.label}
            {/*
               Полюса подписаны у самого признака, мелко. Вынести их
               в легенду над таблицей значило бы заставить читателя
               переводить взгляд на каждой строке: у восемнадцати
               признаков полюса разные.
            */}
            <span className="block text-[12px] leading-snug text-ink-400">
              {t.trait.minus} ← → {t.trait.plus}
            </span>
          </td>
          <td className="px-3 align-middle">
            <Bar value={t.value} middle={middle} />
          </td>
          <td className="py-2.5 pl-3 text-right align-middle text-[13px] leading-snug text-ink-700">
            {exteriorDirection(t.trait, t.value) ?? '—'}
          </td>
          <td className="py-2.5 pl-3 text-right align-middle tabular-nums">
            {signed(t.value, digits(t.value))}
          </td>
        </tr>
      ))}
    </tbody>
  )
}

export function ExteriorChart({
  traits,
  composites,
}: {
  traits: (ExteriorRow & { trait: ExteriorTrait })[]
  composites: ExteriorRow[]
}) {
  const directed = traits.filter((t) => t.trait.optimum === 'edge')
  const middle = traits.filter((t) => t.trait.optimum === 'middle')

  return (
    <div>
      {/*
         Композиты стоят первыми, а не последними.

         Раньше они лежали в подвале блока — после восемнадцати линейных
         признаков, то есть после самой подробной таблицы карточки.
         Порядок был обратен тому, как экстерьер читают: сначала смотрят
         три сводных числа и решают, интересно ли вымя вообще, и только
         потом идут разбираться, из чего это вымя сложено. Так устроены
         и чужие каталоги — сводное сверху, разложение под ним.

         Восемнадцать строк перед итогом означали, что до итога дочитает
         не всякий, а первым в глаза бросится самый частный признак.
      */}
      <h4 className="mb-3 text-[15px] font-medium text-forest-500">Сводные индексы</h4>
      <table className="w-full text-sm">
        <tbody>
          {composites.map((t) => (
            <tr key={t.key} className="border-b border-[#ededed] last:border-0">
              <td className="w-[40%] py-2.5 pr-3 align-middle">{t.label}</td>
              <td className="px-3 align-middle">
                <Bar value={t.value} />
              </td>
              <td className="w-[34%] py-2.5 pl-3 text-right align-middle tabular-nums">
                {signed(t.value, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mb-1 mt-7 text-[15px] font-medium text-forest-500">
        Признаки «чем больше, тем лучше»
      </h4>
      <p className="mb-3 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
        Здесь правый край шкалы — желаемое направление, и чем длиннее полоса вправо, тем лучше.
      </p>
      <table className="w-full text-sm">
        <ScaleHead />
        <TraitRows rows={directed} />
      </table>

      {!!middle.length && (
        <>
          <h4 className="mb-1 mt-7 text-[15px] font-medium text-forest-500">
            Признаки с оптимумом посередине
          </h4>
          <p className="mb-3 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
            У этих признаков лучшее значение среднее, а не крайнее: слишком мелкое вымя так же
            нежелательно, как слишком глубокое. Отклонение в любую сторону читается одинаково,
            поэтому и полоса здесь одного цвета.
          </p>
          <table className="w-full text-sm">
            <ScaleHead middle />
            <TraitRows rows={middle} middle />
          </table>
        </>
      )}
    </div>
  )
}
