import {
  FGIAS_MEASURED_AT,
  FGIAS_MEASURED_ON,
  FGIAS_TEMPLATES,
  FGIAS_TOTALS,
  type FgiasTemplateState,
} from '@/lib/fgias-templates'

/**
 * Вкладка «ФГИАС ПР».
 *
 * ## Кому она отвечает
 *
 * Хозяйству, которое уже обязано сдавать данные в государственный реестр
 * и выбирает, где вести учёт. Вопрос у него один и прямой: если я веду
 * книгу, смогу ли я отдать из неё всё, что просит ФГИАС, — и если нет,
 * то чего не хватит.
 *
 * Отвечать на него в переписке дорого и ненадёжно: ответ живёт до первой
 * правки. Отвечать общими словами («интеграция запланирована») — хуже
 * вовсе: человек услышит «да» и обнаружит «нет» через полгода, когда
 * уже перенёс стадо.
 *
 * ## Почему таблица, а не рассказ
 *
 * У читателя двадцать шаблонов и один вопрос к каждому. Рассказ он
 * читать не станет: ему надо найти свой шаблон и увидеть три числа.
 * Поэтому колонок ровно столько, сколько нужно для решения: сколько
 * колонок в шаблоне, сколько из них книга заполнит, и чего не хватает
 * словами.
 *
 * ## Почему «заполним» меньше, чем могло бы
 *
 * Числа сосчитаны по живой базе, а не по схеме. Поле, заведённое
 * в системе и никем не заполняемое, в выгрузке даёт пустую ячейку,
 * а реестр отвергает запись за незаполненное обязательное поле. Считать
 * такие поля своими значило бы обещать то, чего не будет, — и обещать
 * тому, кто на это положится.
 *
 * Отсюда же строки, где «заполним» ниже, чем подсказывает схема: линейная
 * оценка совпадает по составу почти целиком, но шесть признаков из неё
 * в базе не заполнены ни разу.
 *
 * ## Чего вкладка не обещает
 *
 * Что выгрузка уже работает. Сегодня это опись готовности, а не кнопка:
 * ключи реестра проставляются сверкой, первый шаблон отдаётся файлом.
 * Сказано это вслух и вверху, а не мелким шрифтом внизу.
 */

const STATE_LABEL: Record<FgiasTemplateState, string> = {
  ready: 'отдадим',
  partial: 'частично',
  none: 'нечем',
}

/*
 * Цвет здесь несёт смысл, а не настроение: «нечем» и «отдадим» человек
 * различает взглядом раньше, чем читает. Но подпись стоит рядом всегда —
 * таблица, где состояние передано только цветом, не читается ни в печати,
 * ни тем, кто цвета не различает.
 */
const STATE_TONE: Record<FgiasTemplateState, string> = {
  ready: 'bg-[#e8f3ec] text-[#2e6b4c]',
  partial: 'bg-[#f6efdc] text-[#8c6714]',
  none: 'bg-[#f7e9e5] text-[#9e3520]',
}

const ORDER: FgiasTemplateState[] = ['ready', 'partial', 'none']

export function EvolutionFgias() {
  const sorted = [...FGIAS_TEMPLATES].sort((a, b) => {
    const byState = ORDER.indexOf(a.state) - ORDER.indexOf(b.state)
    if (byState !== 0) return byState
    return b.fill / b.columns - a.fill / a.columns
  })

  const ready = FGIAS_TEMPLATES.filter((t) => t.state === 'ready').length
  const none = FGIAS_TEMPLATES.filter((t) => t.state === 'none').length

  return (
    <div className="space-y-10">
      {/* ------------------------ Итог тремя числами ------------------------ */}

      <section>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <p className="text-[13px] text-ink-500">Шаблонов реестра</p>
            <p className="mt-1 text-[30px] font-medium leading-none tabular-nums">
              {FGIAS_TOTALS.templates}
            </p>
            <p className="mt-2 text-[14px] leading-snug text-ink-700">
              {ready} отдадим уже сейчас, {none} нечем — таких данных книга пока не ведёт
            </p>
          </div>

          <div className="card">
            <p className="text-[13px] text-ink-500">Колонок во всех шаблонах</p>
            <p className="mt-1 text-[30px] font-medium leading-none tabular-nums">
              {FGIAS_TOTALS.fill}
              <span className="text-[20px] text-ink-500"> из {FGIAS_TOTALS.columns}</span>
            </p>
            <p className="mt-2 text-[14px] leading-snug text-ink-700">
              есть чем заполнить — по живой базе, а не по схеме
            </p>
          </div>

          <div className="card">
            <p className="text-[13px] text-ink-500">Строк уехало бы сегодня</p>
            <p className="mt-1 text-[30px] font-medium leading-none tabular-nums">
              {FGIAS_TOTALS.rowsReady.toLocaleString('ru-RU')}
            </p>
            <p className="mt-2 text-[14px] leading-snug text-ink-700">
              без единой правки данных: основные сведения, отёлы, осеменения, дойки, лактации
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          Сосчитано {FGIAS_MEASURED_AT} по базе: {FGIAS_MEASURED_ON}. Шаблоны — версии 2.6.0,
          прочитаны файлами. «Заполним» — это поля, которые в книге заведены{' '}
          <em>и заполняются</em>: поле, которое никто не вносит, даёт в выгрузке пустую ячейку,
          а реестр отвергает запись за незаполненное обязательное поле.
        </p>
      </section>

      {/* --------------------------- Таблица --------------------------- */}

      <section>
        <h2 className="text-[22px] font-medium">Шаблон за шаблоном</h2>

        <div className="card mt-4 overflow-x-auto">
          <table className="metric-table min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left">Шаблон ФГИАС</th>
                <th className="text-right">Колонок</th>
                <th className="text-right">Заполним</th>
                <th className="text-left">Состояние</th>
                <th className="text-left">Что мешает и чего не хватает</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.name}>
                  <td className="font-medium">{t.name}</td>
                  <td className="text-right tabular-nums">{t.columns}</td>
                  <td className="text-right tabular-nums">{t.fill}</td>
                  <td>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] leading-none ${STATE_TONE[t.state]}`}
                    >
                      {STATE_LABEL[t.state]}
                    </span>
                  </td>
                  <td className="max-w-[46ch] text-[14px] leading-snug text-ink-700">{t.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------ Что это значит ------------------------ */}

      <section>
        <h2 className="text-[22px] font-medium">Что из этого следует</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="card space-y-3 text-[15px] leading-relaxed text-ink-700">
            <h3 className="text-[17px] font-medium text-ink-900">
              Ежемесячная отчётность закрыта почти целиком
            </h3>
            <p>
              Дойки, осеменения, отёлы и лактации — то, что хозяйство сдаёт чаще всего, — книга
              отдаёт полностью или почти. Обязательные поля в них заполняются железно: из
              двадцати двух тысяч строк не выпадает ни одна.
            </p>
            <p>
              Не хватает только формата файла и ключа животного. Ни то, ни другое не требует
              от хозяйства менять учёт.
            </p>
          </div>

          <div className="card space-y-3 text-[15px] leading-relaxed text-ink-700">
            <h3 className="text-[17px] font-medium text-ink-900">
              Родословная — самое дорогое место
            </h3>
            <p>
              Реестр требует три ряда предков, четырнадцать гнёзд. Книга уверенно знает отцов
              и почти не знает матерей: второй ряд целиком не собирается ни у одного животного.
            </p>
            <p>
              Это не наша особенность — так ведут учёт в отрасли. Но выгрузить то, чего нет,
              нельзя, и заполнять это придётся из племенных свидетельств и обратных файлов
              реестра.
            </p>
          </div>

          <div className="card space-y-3 text-[15px] leading-relaxed text-ink-700">
            <h3 className="text-[17px] font-medium text-ink-900">
              Пять шаблонов книга не ведёт вовсе
            </h3>
            <p>
              Живая масса, три оценки экстерьера по шкале 50–100, спермопродукция и выставки.
              Из них живая масса — ежемесячная отчётность, и она первая в очереди; выставки —
              самое дешёвое, четыре текстовых поля и дата.
            </p>
            <p>
              Оценки экстерьера сложнее: у реестра другая система измерения, а не другое поле,
              и пересчитать одну в другую нельзя.
            </p>
          </div>

          <div className="card space-y-3 text-[15px] leading-relaxed text-ink-700">
            <h3 className="text-[17px] font-medium text-ink-900">
              Справочники реестра открыты, и это упрощает всё
            </h3>
            <p>
              Двадцать шаблонов заполняются не словами, а ключами: порода — это{' '}
              <code className="rounded bg-ink-100 px-1 text-[13px]">1bd6b3f1-648a-…</code>,
              а не «Голштинская». Пятьдесят один реестр ФГИАС отдаёт открыто, включая 556 пород
              и 10 580 линий.
            </p>
            <p>
              Книга сверяет с ними свои справочники и хранит государственный ключ рядом
              со своим. Побочная польза: сразу видно, каких наших пород в реестре нет
              и какие называются иначе.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------- Чего здесь нет ---------------------- */}

      <section>
        <h2 className="text-[22px] font-medium">Чего эта страница не обещает</h2>

        <div className="card mt-4 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            <strong className="font-medium text-ink-900">Что выгрузка уже работает.</strong>{' '}
            Сегодня это опись готовности, а не кнопка. Ключи реестра проставляются сверкой,
            первый шаблон отдаётся файлом; остальное впереди.
          </p>
          <p>
            <strong className="font-medium text-ink-900">Что числа вечны.</strong> «Заполним»
            меняется вместе с тем, что хозяйства вносят, а шаблоны — вместе с версиями реестра.
            Дата прогона стоит рядом с числами намеренно: страница, показывающая прошлогоднее
            за нынешнее, хуже отсутствующей.
          </p>
          <p>
            <strong className="font-medium text-ink-900">Что реестр примет всё принятое.</strong>{' '}
            Здесь сказано, чем книга заполнит колонку. Примет ли реестр записанное — вопрос
            его собственных проверок, и ответ на него даёт только настоящая отправка.
          </p>
        </div>
      </section>
    </div>
  )
}
