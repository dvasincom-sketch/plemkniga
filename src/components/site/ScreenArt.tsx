/**
 * Как выглядит книга внутри — нарисованное вёрсткой, а не снимком.
 *
 * ## Почему не снимок экрана
 *
 * Снимок стареет молча. Через полгода интерфейс поедет, а картинка
 * останется прежней — и посетитель, дошедший до системы, увидит другое.
 * Обещание с витрины при этом никто не отзовёт: картинка не падает
 * от того, что перестала быть правдой.
 *
 * Снимок ещё и тяжёл: чтобы читались подписи, нужна двойная плотность,
 * то есть сотни килобайт на каждое изображение, и всё это едет
 * по мобильной сети хозяйству, у которого связь — вышка за десять
 * километров.
 *
 * И третье: снимок нельзя перевести. Витрина на шести языках, а надпись
 * внутри картинки остаётся русской, и на казахской странице читатель
 * видит ровно то, чего мы старались избежать.
 *
 * Вёрстка снимает все три: она масштабируется, весит килобайты,
 * переводится вместе со страницей и меняется вместе с оформлением книги,
 * потому что берёт из него те же цвета и те же отступы.
 *
 * ## Что здесь настоящее, а что показанное
 *
 * Числа и имена полей — настоящие: те же, что в карточке животного,
 * с теми же единицами. Значения выдуманы, и это видно по кличке.
 * Выдавать нарисованное за снимок мы не станем — на витрине,
 * где всё остальное проверяемо, одна подделка стоит дороже всей пользы.
 *
 * ## Почему подписи приходят снаружи
 *
 * Их тринадцать, и все они переводятся вместе с остальной витриной.
 * Держать их внутри компонента значило бы завести четырнадцатое место,
 * где живут строки, и первое, которое забудут перевести.
 */

export type ScreenLabels = {
  /** Заголовок панели — «Карточка животного». */
  card: string
  number: string
  name: string
  born: string
  breed: string
  father: string
  mother: string
  /** Заголовок правого столбца — «Контрольные доения». */
  milk: string
  date: string
  yield: string
  fat: string
  /** Итоговая строка — «За 305 дней». */
  total: string
  /** Подпись под индексом — «Индекс племенной ценности». */
  index: string
}

/* ------------------------------------------------------------------ */

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-2 last:border-0">
      <span className="text-[13px] text-ink-500">{label}</span>
      <span className={`text-[14px] text-ink-900 ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * Панель книги.
 *
 * Полоска сверху — не окно браузера. Адресная строка и кнопки вместе
 * читаются как «это снимок», а здесь рисунок, и притворяться ему нечем.
 * Полоска нужна другому: она отделяет показанное от страницы, иначе
 * таблица посреди текста выглядит частью самой витрины.
 */
export function AnimalScreen({ labels }: { labels: ScreenLabels }) {
  const tests: [date: string, milk: string, fat: string][] = [
    ['12.04', '34,2', '3,82'],
    ['14.05', '32,8', '3,75'],
    ['11.06', '30,1', '3,91'],
  ]

  return (
    /*
       Своей рамки и своей шапки у карточки больше нет: и то и другое
       даёт общее окно (`WindowFrame`). Прежде заголовок «Карточка
       животного» стоял внутри окна прямо под одноимённой вкладкой —
       одно и то же дважды в двух сантиметрах друг от друга.
    */
    <>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 p-5 sm:p-6 lg:grid-cols-2">
        <div>
          <Row label={labels.number} value="RU 4512 087" />
          {/*
             Кличка — единственное значение не моноширинным: это слово,
             а не число, и выравнивать его по разрядам незачем. Заодно
             сразу видно, что запись выдумана.
          */}
          <Row label={labels.name} value="Ромашка" mono={false} />
          <Row label={labels.born} value="14.03.2021" />
          <Row label={labels.breed} value="HOL" />
          <Row label={labels.father} value="USAM 000132745901" />
          <Row label={labels.mother} value="RUSF 000000451209" />
        </div>

        <div>
          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-400">
            {labels.milk}
          </div>

          <div className="grid grid-cols-3 gap-x-4 border-b border-ink-200 pb-1.5 text-[11px] uppercase tracking-wide text-ink-400">
            <span>{labels.date}</span>
            <span className="text-right">{labels.yield}</span>
            <span className="text-right">{labels.fat}</span>
          </div>

          {tests.map(([d, m, f]) => (
            <div
              key={d}
              className="grid grid-cols-3 gap-x-4 border-b border-ink-100 py-1.5 font-mono text-[14px] tabular-nums text-ink-900"
            >
              <span>{d}</span>
              <span className="text-right">{m}</span>
              <span className="text-right">{f}</span>
            </div>
          ))}

          <div className="grid grid-cols-3 gap-x-4 pt-2 text-[14px] font-medium">
            <span className="text-ink-500">{labels.total}</span>
            <span className="text-right font-mono tabular-nums">9 640</span>
            <span className="text-right font-mono tabular-nums">3,83</span>
          </div>

          <div className="mt-5 flex items-baseline gap-3 rounded-xl bg-brand-50 px-4 py-3">
            <span className="font-mono text-[22px] font-medium tabular-nums text-forest-600">
              +421
            </span>
            <span className="text-[13px] leading-snug text-ink-700">{labels.index}</span>
          </div>
        </div>
      </div>
    </>
  )
}
