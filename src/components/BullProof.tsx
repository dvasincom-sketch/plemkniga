import { BULL_COMPARISON_MIN, type BullProof as Proof } from '@/lib/bull-proof'

/**
 * Оценка быка по дочерям — блок карточки вместо собственной продуктивности.
 *
 * ## Порядок чисел здесь и есть содержание
 *
 * Первым идёт не удой дочерей, а их количество и разброс по хозяйствам.
 * Это не вежливость к мелочам: у быка с четырьмя дочерьми в одном стаде
 * любое среднее — свойство этого стада, и знать об этом надо раньше,
 * чем увидеть само число.
 *
 * Затем сравнение со сверстницами, и только потом сырое среднее. Обратный
 * порядок читался бы как «вот удой быка, а вот оговорки к нему» — то есть
 * ровно так, как читать не надо.
 *
 * ## Почему сравнение может отсутствовать
 *
 * Сверстницы — коровы того же стада, не дочери этого быка. Их может
 * не оказаться: у быка мало дочерей, или все они стоят в стаде, где
 * больше никого нет. Тогда блок говорит об этом словами, а не показывает
 * прочерк: прочерк читается как ноль.
 */

const nf = (v: number | null | undefined, digits = 0): string =>
  typeof v === 'number' && Number.isFinite(v)
    ? v.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—'

const signed = (v: number | null): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  const r = Math.round(v)
  return `${r > 0 ? '+' : ''}${r.toLocaleString('ru-RU')}`
}

const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few
  return many
}

export function BullProofBlock({ data }: { data: Proof }) {
  if (data.daughters === 0) {
    return (
      <div className="card">
        <h2 className="panel-heading">Оценка по дочерям</h2>
        <p className="max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
          Дочерей этого быка в книге нет. Пока их не появится, сказать о нём по данным книги
          нечего: собственной продуктивности у быка не бывает, а всё остальное — оценка,
          привезённая вместе с животным, и она ниже.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="panel-heading">Оценка по дочерям</h2>

      <p className="mb-6 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
        У быка нет собственного удоя — его ценность видна в дочерях. Ниже то, что о них знает
        книга. Это <span className="font-medium">не племенная ценность</span>: она считается
        по всей популяции сразу, с учётом происхождения самих дочерей и года отёла, а не
        запросом по одному быку.
      </p>

      {/* --------------------------- Сколько и где --------------------------- */}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Дочерей в книге', value: nf(data.daughters) },
          { label: 'Хозяйств', value: nf(data.farms) },
          { label: 'С законченной лактацией', value: nf(data.withMilk) },
          { label: 'Сыновей', value: nf(data.sons) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-canvas px-4 py-3.5">
            <p className="text-[13px] leading-snug text-ink-500">{s.label}</p>
            <p className="mt-1 text-[24px] font-medium leading-none tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/*
         Предупреждение о числе хозяйств стоит сразу под счётчиками,
         а не внизу блока. Дочери в одном стаде — главная причина, по которой
         всё остальное здесь читать не стоит, и узнать об этом надо до того,
         как глаз дошёл до килограммов.
      */}
      {data.farms <= 1 && (
        <p className="mt-4 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
          Все дочери стоят в одном хозяйстве. Любое среднее по ним говорит об этом хозяйстве
          не меньше, чем о быке: разница между хозяйствами обычно больше разницы между быками.
        </p>
      )}

      {/* --------------------- Сравнение со сверстницами --------------------- */}

      <div className="mt-8 border-t border-ink-100 pt-6">
        <h3 className="text-[17px] font-medium">Дочери против сверстниц</h3>
        <p className="mt-1.5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
          У каждой дочери берётся средний удой других коров её же стада — не дочерей этого
          быка — и считается разница. Так сравнение не зависит от того, в какое хозяйство
          попали дочери.
        </p>

        {data.vsMates === null ? (
          <p className="mt-4 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
            {data.compared === 0
              ? 'Сравнивать не с кем: у дочерей этого быка нет сверстниц с законченной лактацией в их стадах.'
              : `Сравнить удалось ${data.compared} ${plural(data.compared, 'дочь', 'дочери', 'дочерей')} — этого мало. ` +
                `Разница показывается начиная с ${BULL_COMPARISON_MIN}: на меньшем числе она измеряет не быка, а этих коров.`}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="text-[34px] font-medium leading-none tabular-nums">
              {signed(data.vsMates)}
            </span>
            <span className="text-[15px] text-ink-700">
              кг молока к сверстницам, по {data.compared}{' '}
              {plural(data.compared, 'дочери', 'дочерям', 'дочерям')}
            </span>
          </div>
        )}
      </div>

      {/* ----------------------------- Что дали ----------------------------- */}

      <div className="mt-8 border-t border-ink-100 pt-6">
        <h3 className="text-[17px] font-medium">Что дали дочери</h3>
        <p className="mt-1.5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
          Среднее без поправки на хозяйство. Само по себе оно быков не сравнивает — для этого
          строка выше.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="metric-table">
            <thead>
              <tr>
                <th>Показатель</th>
                <th className="text-right">Среднее по дочерям</th>
                <th className="text-right">Записей</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Удой за лактацию, кг</td>
                <td className="text-right tabular-nums">{nf(data.milkMean)}</td>
                <td className="text-right tabular-nums">{nf(data.withMilk)}</td>
              </tr>
              <tr>
                <td>Жир, %</td>
                <td className="text-right tabular-nums">{nf(data.fatMean, 2)}</td>
                <td className="text-right tabular-nums">{nf(data.withMilk)}</td>
              </tr>
              <tr>
                <td>Белок, %</td>
                <td className="text-right tabular-nums">{nf(data.proteinMean, 2)}</td>
                <td className="text-right tabular-nums">{nf(data.withMilk)}</td>
              </tr>
              <tr>
                <td>Возраст первого отёла, мес.</td>
                <td className="text-right tabular-nums">{nf(data.afcMean, 1)}</td>
                <td className="text-right tabular-nums">{nf(data.afcCows)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------- Дочери по годам -------------------------- */}

      {data.byYear.length > 1 && (
        <div className="mt-8 border-t border-ink-100 pt-6">
          <h3 className="text-[17px] font-medium">Дочери по годам рождения</h3>
          <p className="mt-1.5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            По ряду видно, работает бык сейчас или отработал: у семени долгий срок хранения,
            и дочери появляются годами после выбытия самого быка.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Год рождения</th>
                  <th className="text-right">Дочерей</th>
                  <th className="text-right">Средний удой, кг</th>
                </tr>
              </thead>
              <tbody>
                {data.byYear.map((y) => (
                  <tr key={y.year}>
                    <td className="tabular-nums">{y.year}</td>
                    <td className="text-right tabular-nums">{nf(y.daughters)}</td>
                    <td className="text-right tabular-nums">{nf(y.milk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
