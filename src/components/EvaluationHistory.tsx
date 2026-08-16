import { getClient } from '@/lib/payload'
import { Collapsible } from './Collapsible'
import { nf, signed } from '@/lib/format'

/**
 * Как менялась племенная ценность животного.
 *
 * Ради этого блока и заводилась история оценок. Одно текущее число говорит,
 * сколько животное стоит сегодня; ряд чисел говорит, можно ли этому числу
 * верить. Ранняя геномная оценка молодого быка держится на предках и SNP,
 * и настоящий вопрос селекционера — подтверждается ли она по мере того,
 * как начинают доиться дочери. Если оценка ползёт вниз третий раз подряд,
 * это видно только в ряду.
 *
 * Показываем ИПЦ и удой: первое — итог, второе — признак, который меняется
 * заметнее прочих и потому лучше всего показывает направление сдвига.
 * Остальное есть в самой строке истории; вываливать сюда сорок колонок
 * значит превратить объяснение обратно в таблицу.
 */

const SOURCES: Record<string, string> = {
  center: 'Расчётный центр',
  association: 'Ассоциация',
  import: 'Загружено из файла',
  foreign: 'Зарубежная оценка',
}

export async function EvaluationHistory({ animalId }: { animalId: number }) {
  const payload = await getClient()

  const { docs } = await payload.find({
    collection: 'animal-evaluations',
    where: { animal: { equals: animalId } },
    sort: '-evaluatedAt',
    limit: 12,
    depth: 0,
    overrideAccess: true,
  })

  /*
   * Одна строка — это не история, а та же оценка, что уже показана выше.
   * Блок про изменение, а меняться там нечему.
   */
  if (docs.length < 2) return null

  const rows = docs.map((d, i) => {
    const previous = docs[i + 1]
    return {
      id: d.id,
      at: d.evaluatedAt,
      source: SOURCES[d.source ?? ''] ?? '—',
      base: d.baseVersion,
      ipc: typeof d.ipc === 'number' ? d.ipc : null,
      milk: typeof d.milkForecast === 'number' ? d.milkForecast : null,
      // Сдвиг относительно предыдущей по времени оценки, а не первой
      shift:
        typeof d.ipc === 'number' && typeof previous?.ipc === 'number' ? d.ipc - previous.ipc : null,
      current: Boolean(d.isCurrent),
    }
  })

  /*
     Аккордеон живёт внутри компонента, а не в странице: только здесь известно,
     есть ли что показывать. Иначе на карточке молодой тёлки с единственной
     оценкой висел бы пустой заголовок «Как менялась оценка», обещающий
     историю, которой нет.
  */
  return (
    <Collapsible
      title="Как менялась оценка"
      note="Переоценки по годам: подтверждается ли ранняя оценка по мере накопления данных"
    >
    <div className="overflow-x-auto">
      <table className="metric-table w-full">
        <thead>
          <tr>
            <th>Дата оценки</th>
            <th>Источник</th>
            <th className="text-right">ИПЦ</th>
            <th className="text-right">Изменение</th>
            <th className="text-right">Удой, кг</th>
            <th>База</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                {r.at ? new Date(r.at).toLocaleDateString('ru-RU') : '—'}
                {r.current && (
                  <span className="ml-2 text-[11px] text-forest-600">действующая</span>
                )}
              </td>
              <td className="text-[13px]">{r.source}</td>
              <td className="text-right tabular-nums">{r.ipc === null ? '—' : nf(r.ipc, 0)}</td>
              <td
                className={`text-right tabular-nums ${
                  r.shift === null ? 'text-ink-300' : r.shift < 0 ? 'text-[#c0392b]' : 'text-forest-600'
                }`}
              >
                {r.shift === null ? '—' : signed(Math.round(r.shift))}
              </td>
              <td className="text-right tabular-nums">{r.milk === null ? '—' : nf(r.milk, 0)}</td>
              <td className="text-[13px] text-ink-500">{r.base ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
        Изменение считается относительно предыдущей по времени оценки. Сравнивать напрямую
        стоит только оценки одного источника и одной базы сравнения: у разных моделей разная
        точка отсчёта, и сдвиг между ними говорит о смене линейки, а не о животном.
      </p>
    </div>
    </Collapsible>
  )
}
