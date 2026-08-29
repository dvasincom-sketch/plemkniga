import Link from 'next/link'
import { BULL_COMPARISON_MIN, type BullProof as Proof } from '@/lib/bull-proof'
import { bullStatus } from '@/lib/bull-status'
import { Computed } from '@/components/Computed'
import { plural } from '@/lib/format'

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

/**
 * Ссылка на сравнение — здесь, а не в общем меню.
 *
 * Мысль «а с кем его сравнить» приходит на карточке быка и нигде больше:
 * человек уже смотрит на одного и хочет положить рядом второго. Пункт
 * меню в этот момент искать не будут, а найдя — начнут с пустой таблицы
 * вместо той, где первый бык уже стоит.
 */
/**
 * Статус оценки: можно ли верить числам ниже.
 *
 * Три ступени, и у каждой сказано не только название, но и что оно
 * означает для того, кто собирается покупать семя. «Предварительная»
 * без пояснения — ярлык; «будет заметно меняться с новыми дочерями» —
 * предупреждение, по которому можно принять решение.
 *
 * Чего не хватает до следующей ступени, названо числом. Человек,
 * смотрящий на молодого быка, должен понимать, сколько ещё ждать;
 * «данных недостаточно» на этот вопрос не отвечает и читается как отказ
 * системы работать.
 */
/*
 * Блок вынесен из «Оценки по дочерям» и показывается прямо под индексом.
 *
 * Стоял он внутри — после заголовка блока и абзаца пояснений, то есть
 * через экран от числа, к которому относится. А относится он именно
 * к индексу: индекс на десяти дочерях выглядит ровно так же, как индекс
 * на трёхстах, теми же знаками после запятой и с той же уверенностью.
 * Ответ «этому числу можно верить» обязан стоять там же, где число,
 * а не в блоке ниже — иначе решение уже принято, когда до него доходят.
 */
export function BullStatusNote({ daughters, herds }: { daughters: number; herds: number }) {
  const status = bullStatus(daughters, herds)

  /*
   * Статус различается точкой, а не заливкой всего блока.
   *
   * Первая редакция красила панель целиком — жёлтым для предварительной
   * оценки, зелёным для официальной. На странице, где всё остальное белые
   * карточки, это читалось как предупреждение системы о неполадке, хотя
   * предварительная оценка — обычное состояние молодого быка, а не сбой.
   * Цвет остался ровно там, где несёт смысл: в точке у названия.
   */
  const dot =
    status.key === 'official'
      ? 'bg-brand-500'
      : status.key === 'preliminary'
        ? 'bg-accent-500'
        : 'bg-ink-300'

  return (
    <div className="card">
      <h2 className="panel-heading mb-0 flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        {status.label}
      </h2>

      {/*
         Надёжность, дочери и хозяйства показаны как результат, а не мелкой
         строкой сбоку.

         Раньше они стояли примечанием справа от заголовка — тем же кеглем,
         что подпись под таблицей. Но это и есть ответ на главный вопрос
         покупателя: сколько дочерей, в скольких хозяйствах и насколько
         этому можно верить. Примечанием набирают оговорку, а не ответ,
         и набор решает за читателя, что здесь важно.

         Плитки те же, что в «Оценке по дочерям» ниже, и повтор намеренный:
         блоки читают по отдельности, и в каждом должно хватать своего.
      */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: 'Надёжность по удою',
            value: <Computed formula="bullReliability">{`${status.reliability} %`}</Computed>,
          },
          { label: 'Дочерей в книге', value: nf(daughters) },
          { label: herds === 1 ? 'Хозяйство' : 'Хозяйств', value: nf(herds) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-canvas px-4 py-3.5">
            <p className="text-[13px] leading-snug text-ink-500">{s.label}</p>
            <p className="mt-1 text-[24px] font-medium leading-none tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">{status.what}</p>

      {/*
         Путь до следующей ступени показан полосами, а не строкой
         «дочерей 11 из 13».

         Числа отвечают на вопрос точно, но требуют вычитания: сколько
         это — одиннадцать из тринадцати, почти дошли или ещё далеко?
         Полоса отвечает на тот же вопрос до чтения, а числа остаются
         рядом для тех, кому нужна точность. Ни то ни другое по отдельности
         не годится: одна полоса — впечатление без величины, одни числа —
         величина без впечатления.

         Полоса не уходит за сто процентов: перевыполненное условие
         (дочерей хватает, а хозяйств нет) должно выглядеть выполненным,
         а не выпирающим.
      */}
      <div
        className={`mt-5 rounded-xl border px-4 py-3.5 ${
          status.progress.done ? 'border-brand-300 bg-brand-50' : 'border-ink-100'
        }`}
      >
        <p className="flex items-center gap-2 text-[13px] text-ink-500">
          {/*
             Галочка — единственное украшение на карточке, и оно заслужено.

             Довести быка до устойчивой оценки — это полсотни дочерей,
             занесённых в книгу разными хозяйствами за годы. Работа
             долгая, а видел её раньше только тот, кто помнил, как
             блок выглядел вчера. Отметка о пройденном пороге — про неё,
             и стоит она ровно один раз: если ставить знак достижения
             на каждую мелочь, он перестанет что-либо значить.
          */}
          {status.progress.done && (
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white"
              aria-hidden="true"
            >
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M4 10.5 8 14.5 16 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          {status.progress.label}
        </p>

        <div className="mt-3 space-y-3">
          {status.progress.steps.map((s) => {
            const done = s.have >= s.need
            const share = Math.min(100, Math.round((s.have / s.need) * 100))
            return (
              <div key={s.what}>
                <div className="flex items-baseline justify-between gap-4 text-[13px]">
                  <span className={done ? 'text-ink-500' : 'text-ink-900'}>{s.what}</span>
                  <span className="tabular-nums text-ink-500">
                    {done ? `${nf(s.have)} — хватает` : `${nf(s.have)} из ${nf(s.need)}`}
                  </span>
                </div>
                <div
                  className={`mt-1 h-1.5 overflow-hidden rounded-full ${
                    status.progress.done ? 'bg-brand-100' : 'bg-ink-100'
                  }`}
                >
                  <div
                    className={`h-full rounded-full ${done ? 'bg-brand-500' : 'bg-accent-500'}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/*
           Строка про смысл порога — только на пройденном.

           До порога человек и так читает, чего не хватает; после —
           полосы сами по себе ничего не объясняют, и без подписи блок
           превращается в две зелёные черты. Нужно сказать, что именно
           сделано и почему это ценно, — иначе мотивации в отметке нет.
        */}
        {status.progress.done && (
          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-700">
            Дочерей достаточно и они стоят в разных хозяйствах — значит разница по ним говорит
            о быке, а не об условиях одного стада. Это та полнота данных, к которой книга
            и ведёт: собрана она хозяйствами, которые вносили отёлы и дойки годами.
          </p>
        )}
      </div>

      {/*
         Ссылка на практику CDCB — не украшение и не ссылка на авторитет.
         Она отвечает на вопрос, который возникает первым: «а почему
         именно столько». Их 60–75 дочерей — это надёжность 83–86 %
         по той же формуле, и совпадение стоит показать: оно означает,
         что порог не выдуман нами.
      */}
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Пороги выведены из формулы надёжности оценки по потомству. Для сравнения: расчётный
        центр CDCB (США) считает достаточными 60–75 дочерей в 40–50 стадах — это те же
        83–86 % надёжности.
      </p>
    </div>
  )
}

export function BullProofBlock({ data, bullId }: { data: Proof; bullId?: number }) {
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
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="panel-heading mb-0">Оценка по дочерям</h2>
        {bullId && (
          <Link
            href={`/bulls/compare?ids=${bullId}`}
            className="text-[14px] underline underline-offset-4 hover:text-forest-500"
          >
            Сравнить с другими быками
          </Link>
        )}
      </div>

      <p className="mb-6 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
        У быка нет собственного удоя — его ценность видна в дочерях. Ниже то, что о них знает
        книга. Это <span className="font-medium">не племенная ценность</span>: она считается
        по всей популяции сразу, с учётом происхождения самих дочерей и года отёла, а не
        запросом по одному быку.
      </p>

      {/* --------------------------- Сколько и где --------------------------- */}

      {/*
         «Сыновей» отсюда убрано. Число это ни на какой вопрос покупателя
         семени не отвечает и ни на что в карточке не влияет: сыновья быка
         — не его оценка, а факт о чужих закупках. Плитка на витрине
         обещает важное самим тем, что она на витрине, и пустое обещание
         занимает место рядом с тремя нужными.
      */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Дочерей в книге', value: nf(data.daughters) },
          { label: 'Хозяйств', value: nf(data.farms) },
          { label: 'С законченной лактацией', value: nf(data.withMilk) },
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
              <Computed formula="vsMates">{signed(data.vsMates)}</Computed>
            </span>
            <span className="text-[15px] text-ink-700">
              кг молока к сверстницам, по {data.compared}{' '}
              {plural(data.compared, 'дочери', 'дочерям', 'дочерям')}
            </span>
          </div>
        )}
      </div>

      {/* ----------------------------- Что дали ----------------------------- */}

      {/*
         Две таблицы стоят рядом, а не одна под другой.

         В каждой по три колонки, и растянутые на всю ширину экрана они
         давали строку в полтора метра пустоты между показателем и числом:
         глаз терял строку на полпути. Рядом они к тому же читаются
         как одно — «что дали дочери» и «когда эти дочери родились», —
         а это и есть один вопрос: чего стоит бык и не устарел ли ответ.

         На узком экране колонки складываются обратно в столбик.
      */}
      {/* Вторая колонка появляется только вместе со второй таблицей: одна
          таблица в половину ширины оставила бы рядом пустую половину,
          и это читалось бы как «здесь что-то не загрузилось» */}
      <div
        className={`mt-8 grid grid-cols-1 gap-8 border-t border-ink-100 pt-6 ${
          data.byYear.length > 1 ? 'lg:grid-cols-2' : ''
        }`}
      >
        <div>
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
              {/*
                 Строка возраста первого отёла показывается, только если
                 есть по чему считать. Прочерк при нулевом числе записей
                 — не ответ «мало данных», а строка, которая выглядит
                 измерением и им не является; читатель идёт искать,
                 кто не завёл данные, вместо того чтобы читать карточку.
              */}
              {data.afcCows > 0 && (
                <tr>
                  <td>Возраст первого отёла, мес.</td>
                  <td className="text-right tabular-nums">{nf(data.afcMean, 1)}</td>
                  <td className="text-right tabular-nums">{nf(data.afcCows)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------- Дочери по годам -------------------------- */}

      {data.byYear.length > 1 && (
        <div>
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
    </div>
  )
}
