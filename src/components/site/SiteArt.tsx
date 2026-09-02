/**
 * Рисунки витрины: значки и схемы.
 *
 * ## Почему всё рисуется разметкой, а не картинками
 *
 * Ни один рисунок здесь не содержит фотографии — только линии, круги
 * и подписи. Такое дешевле нарисовать разметкой, чем нарисовать
 * и положить файлом:
 *
 * Резкость на любом экране без второго файла под удвоенную плотность.
 * Цвета берутся из темы через `currentColor`, поэтому рисунок сам
 * подстраивается под окружение и не выцветает рядом с изменённой палитрой.
 * Подписи на схемах — настоящий текст: он переводится вместе со страницей
 * и читается программой чтения с экрана. Файл пришлось бы рисовать
 * шесть раз, по разу на язык.
 *
 * И главное: ни одного лишнего запроса. Витрина открывается одним
 * ответом, без ожидания картинок.
 *
 * ## Почему у схем нет собственных подписей внутри кода
 *
 * Все слова приходят доводами. Рисунок, у которого текст зашит внутри,
 * на пятом языке показывает шестую копию русского — и заметить это может
 * только тот, кто открыл страницу на киргизском.
 *
 * ## Про доступность
 *
 * Схема — картинка со смыслом, поэтому у неё есть `role="img"`
 * и подпись целиком: программе чтения с экрана нужен связный ответ
 * на вопрос «что нарисовано», а не пять оторванных слов в порядке
 * отрисовки. Значки же чисто украшательные и от чтения скрыты —
 * рядом с каждым стоит заголовок, и произносить ещё и значок значит
 * повторять.
 */

/* ------------------------------------------------------------------ *
 *  Значки возможностей                                               *
 * ------------------------------------------------------------------ */

const ICON = 'h-7 w-7 flex-none text-forest-500'

/** Общая обёртка: одна сетка координат и одна толщина линии на все значки. */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Племенная книга: страницы и закладка. */
const IconBook = () => (
  <Icon>
    <path d="M4 6a2 2 0 0 1 2-2h6v20H6a2 2 0 0 1-2-2V6Z" />
    <path d="M24 6a2 2 0 0 0-2-2h-6v20h6a2 2 0 0 0 2-2V6Z" />
    <path d="M19 4v7l2-1.5L23 11V4" />
  </Icon>
)

/** Контроль продуктивности: капля и растущий ряд. */
const IconMilk = () => (
  <Icon>
    <path d="M9 4c0 3-3 4.5-3 7a3 3 0 0 0 6 0c0-2.5-3-4-3-7Z" />
    <path d="M15 22v-4M19 22v-8M23 22v-12" />
    <path d="M4 22h20" />
  </Icon>
)

/** Экстерьер: измерение по точкам. */
const IconRuler = () => (
  <Icon>
    <path d="M4 18 18 4l6 6L10 24l-6-6Z" />
    <path d="M8 14l2 2M12 10l2 2M16 6l2 2" />
  </Icon>
)

/** Племенная ценность: восходящая кривая с отметкой. */
const IconIndex = () => (
  <Icon>
    <path d="M4 22V4M4 22h20" />
    <path d="M7 18l5-6 4 3 6-9" />
    <circle cx="22" cy="6" r="2" />
  </Icon>
)

/** Проверки: щит с галкой. */
const IconCheck = () => (
  <Icon>
    <path d="M14 3l9 4v7c0 5-4 9-9 11-5-2-9-6-9-11V7l9-4Z" />
    <path d="M10 13.5l3 3 5-6" />
  </Icon>
)

/** Обмен: два узла и стрелки между ними. */
const IconExchange = () => (
  <Icon>
    <circle cx="6" cy="8" r="3" />
    <circle cx="22" cy="20" r="3" />
    <path d="M9 8h9a4 4 0 0 1 0 8h-1" />
    <path d="M11 13l-2 3 3 1" />
  </Icon>
)

/**
 * Значки по порядку карточек возможностей.
 *
 * Массив, а не поиск по названию: названия приходят переводом и меняются,
 * а порядок карточек задан набором строк и меняется вместе со значками.
 * Привязка по имени сломалась бы на первом же переводе и молча — карточка
 * осталась бы без значка, что выглядит как недогрузка, а не как ошибка.
 */
export const FEATURE_ICONS = [IconBook, IconMilk, IconRuler, IconIndex, IconCheck, IconExchange]

/* ------------------------------------------------------------------ *
 *  Схема: три контура учёта                                          *
 * ------------------------------------------------------------------ */

/**
 * Три слоя один над другим: отчётность, учёт стада, экономика коровы.
 *
 * Нижний слой самый широкий и самый бледный — он обязателен и общий
 * для всех. Верхний узкий и яркий: он не обязателен никому, и именно
 * поэтому его чаще всего нет. Порядок снизу вверх повторяет порядок
 * появления в хозяйстве.
 */
export function LayersArt({ labels, title }: { labels: string[]; title: string }) {
  const rows = [
    { y: 84, w: 300, fill: 'var(--color-ink-100)', text: 'var(--color-ink-500)' },
    { y: 48, w: 240, fill: 'var(--color-brand-100)', text: 'var(--color-forest-600)' },
    { y: 12, w: 180, fill: 'var(--color-forest-500)', text: '#ffffff' },
  ]

  /* Подписи приходят сверху вниз, слои рисуются снизу вверх. */
  const ordered = [...labels].reverse()

  return (
    <svg viewBox="0 0 320 124" className="h-auto w-full max-w-[320px]" role="img" aria-label={title}>
      {rows.map((row, i) => (
        <g key={row.y}>
          <rect
            x={(320 - row.w) / 2}
            y={row.y}
            width={row.w}
            height={28}
            rx={8}
            fill={row.fill}
          />
          <text
            x={160}
            y={row.y + 18}
            textAnchor="middle"
            fontSize={11}
            fill={row.text}
            /* Подпись может не влезть на длинном языке — сжимаем, а не режем. */
            textLength={row.w - 24}
            lengthAdjust="spacingAndGlyphs"
          >
            {ordered[i]}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 *  Схема: путь данных                                                *
 * ------------------------------------------------------------------ */

/**
 * Пять узлов в строку: хозяйство → проверки → книга → реестр и рынок.
 *
 * Раздвоение в конце нарисовано намеренно: одни и те же записи уходят
 * и в государственный реестр, и в рейтинг с обменом. Прямая линия
 * из пяти узлов сказала бы, что реестр — предпоследний шаг перед
 * рейтингом, а это не так: адресаты равноправны и получают одно и то же.
 */
export function FlowArt({ nodes, title }: { nodes: string[]; title: string }) {
  const [farm, checks, book, registry, market] = nodes

  const Node = ({
    x,
    y,
    label,
    accent,
  }: {
    x: number
    y: number
    label?: string
    accent?: boolean
  }) => (
    <g>
      <rect
        x={x}
        y={y}
        width={104}
        height={40}
        rx={10}
        fill={accent ? 'var(--color-forest-500)' : '#ffffff'}
        stroke={accent ? 'var(--color-forest-500)' : 'var(--color-ink-100)'}
        strokeWidth={1.5}
      />
      <text
        x={x + 52}
        y={y + 24}
        textAnchor="middle"
        fontSize={11}
        fill={accent ? '#ffffff' : 'var(--color-ink-700)'}
        textLength={88}
        lengthAdjust="spacingAndGlyphs"
      >
        {label}
      </text>
    </g>
  )

  const Arrow = ({ d }: { d: string }) => (
    <path
      d={d}
      fill="none"
      stroke="var(--color-ink-300)"
      strokeWidth={1.5}
      strokeLinecap="round"
      markerEnd="url(#flow-arrow)"
    />
  )

  return (
    <svg viewBox="0 0 560 160" className="h-auto w-full" role="img" aria-label={`${title}: ${nodes.join(' → ')}`}>
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 8 8"
          refX={7}
          refY={4}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="var(--color-ink-300)" />
        </marker>
      </defs>

      <Node x={0} y={60} label={farm} />
      <Node x={140} y={60} label={checks} />
      <Node x={280} y={60} label={book} accent />

      <Node x={440} y={12} label={registry} />
      <Node x={440} y={108} label={market} />

      <Arrow d="M108 80 h24" />
      <Arrow d="M248 80 h24" />
      {/* Раздвоение: от книги вверх к реестру и вниз к рейтингу. */}
      <Arrow d="M388 80 h20 q12 0 12 -12 v-20 q0 -12 12 -12 h4" />
      <Arrow d="M388 80 h20 q12 0 12 12 v20 q0 12 12 12 h4" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 *  Схема: место в рейтинге                                           *
 * ------------------------------------------------------------------ */

/**
 * Полоса с отметкой: где стоит животное среди всех.
 *
 * Числа здесь выдуманные и нарочно круглые — это рисунок, а не выдержка
 * из книги. Настоящие числа на витрине означали бы, что мы показываем
 * чужое поголовье поимённо посторонним, чего книга как раз не делает.
 */
export function RankArt({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 320 96" className="h-auto w-full max-w-[320px]" role="img" aria-label={title}>
      <rect x={0} y={40} width={320} height={12} rx={6} fill="var(--color-ink-100)" />
      <rect x={0} y={40} width={48} height={12} rx={6} fill="var(--color-forest-500)" />

      <circle cx={48} cy={46} r={9} fill="#ffffff" stroke="var(--color-forest-500)" strokeWidth={3} />

      <text x={48} y={28} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-forest-600)">
        47
      </text>
      <text x={0} y={76} fontSize={11} fill="var(--color-ink-500)">
        1
      </text>
      <text x={320} y={76} textAnchor="end" fontSize={11} fill="var(--color-ink-500)">
        21 480
      </text>
    </svg>
  )
}
