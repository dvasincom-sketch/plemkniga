/**
 * Экраны книги, нарисованные вёрсткой, — для страниц разделов.
 *
 * ## Зачем они там
 *
 * Текст описывает возможности, но не показывает **визуальный код**:
 * чем своё животное отличается от чужого, где книга предупреждает,
 * а где утверждает, что видно покупателю и чего он не видит. Это
 * и есть наша сильная сторона, и она пропадает, пока страница
 * состоит из абзацев.
 *
 * ## Почему три состояния карточки, а не одна
 *
 * Карточка одна, а прочтения три, и различаются они правами:
 *
 * **Чужое животное.** Видно то, что хозяйство открыло: происхождение,
 * племенная ценность, документы. Не видно ни событий, ни здоровья,
 * ни экономики — и это не ограничение показа, а правило доступа.
 *
 * **Своё животное.** То же плюс работа: события, ввод, выгрузки,
 * кнопки, которых у постороннего нет вовсе.
 *
 * **Бык.** Другая карточка по существу: у быка нет лактаций, зато есть
 * дочери, наличие семени и сравнение со сверстниками. Показывать быка
 * теми же полями, что корову, значит показать пустые графы там,
 * где на самом деле другой предмет.
 *
 * Различие в правах — самое частое недоразумение при первом разговоре
 * («а покупатель увидит мои надои?»), и рисунок отвечает на него
 * быстрее любого абзаца.
 *
 * ## Почему вёрсткой, а не снимком
 *
 * Те же четыре довода, что у карточки на главной: снимок стареет
 * молча, весит сотни килобайт, не переводится — и содержит настоящих
 * животных настоящих хозяйств, которым не место на витрине.
 */

type Row = [label: string, value: string]

function Panel({
  title,
  badge,
  badgeTone = 'quiet',
  children,
}: {
  title: string
  badge: string
  badgeTone?: 'quiet' | 'own' | 'bull'
  children: React.ReactNode
}) {
  const tone =
    badgeTone === 'own'
      ? 'bg-brand-50 text-forest-600'
      : badgeTone === 'bull'
        ? 'bg-ink-900 text-white'
        : 'bg-ink-50 text-ink-500'

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">{title}</span>
        <span className={`rounded-md px-2 py-0.5 text-[11px] ${tone}`}>{badge}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

const Rows = ({ rows }: { rows: Row[] }) => (
  <dl className="space-y-1.5">
    {rows.map(([label, value]) => (
      <div key={label} className="flex items-baseline justify-between gap-3">
        <dt className="text-[11px] text-ink-500">{label}</dt>
        <dd className="text-[12px] tabular-nums">{value}</dd>
      </div>
    ))}
  </dl>
)

const Tabs = ({ items, active }: { items: string[]; active: number }) => (
  <div className="mb-3 flex flex-wrap gap-1.5">
    {items.map((t, i) => (
      <span
        key={t}
        className={`rounded-md px-2 py-0.5 text-[11px] ${
          i === active ? 'bg-forest-500 text-white' : 'bg-ink-50 text-ink-500'
        }`}
      >
        {t}
      </span>
    ))}
  </div>
)

/** Три прочтения карточки животного. */
export function AnimalStates() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Panel title="Чужая корова" badge="публичный просмотр">
        <Tabs items={['Основное', 'Происхождение', 'Документы']} active={0} />
        <Rows
          rows={[
            ['Номер', 'RU 4512 087'],
            ['Порода', 'Голштинская'],
            ['Отец', 'RR Linus'],
            ['ИПЦ', '+460'],
            ['Свидетельство', 'выдано'],
          ]}
        />
        <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
          Событий, здоровья и экономики не видно: их открывает владелец, а не система.
        </p>
      </Panel>

      <Panel title="Своя корова" badge="владелец" badgeTone="own">
        <Tabs items={['Основное', 'Продуктивность', 'События', 'Документы']} active={1} />
        <Rows
          rows={[
            ['За 305 дней', '9 640 кг'],
            ['Жир / белок', '3,83 / 3,21 %'],
            ['Соматика', '148 тыс.'],
            ['Осеменение', '12.04, бык RR Linus'],
            ['Проверка стельности', '18.05, стельная'],
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2">
          {['Внести доение', 'Выгрузить в реестр', 'Выпустить документ'].map((b) => (
            <span key={b} className="rounded-md bg-forest-500 px-2 py-0.5 text-[11px] text-white">
              {b}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="Бык" badge="другая карточка" badgeTone="bull">
        <Tabs items={['Основное', 'Дочери', 'Семя']} active={1} />
        <Rows
          rows={[
            ['Дочерей в книге', '1 284'],
            ['Со сверстницами', '+512 кг'],
            ['Достоверность', '0,91'],
            ['Семя в наличии', 'да, 3 хозяйства'],
            ['Гаплотипы', 'свободен'],
          ]}
        />
        <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
          Лактаций у быка нет — вместо них дочери и сравнение со сверстницами.
        </p>
      </Panel>
    </div>
  )
}

/** Родословная: сколько поколений видно и что помечено. */
export function PedigreeScreen() {
  return (
    /* Обводку даёт окно переключателя; своя вторая рамка внутри
       выглядела бы вложенным окном. */
    <div className="p-4">
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
        <div className="space-y-2">
          <div className="rounded-lg border border-ink-100 px-2 py-1.5">
            <div className="font-medium">Ромашка</div>
            <div className="tabular-nums text-ink-500">RU 4512 087</div>
          </div>
        </div>

        <div className="space-y-2">
          {[
            ['RR Linus', 'HODEU000360023959', true],
            ['Берёзка', 'RUSF 000003910444', false],
          ].map(([name, num, dna]) => (
            <div key={String(num)} className="rounded-lg border border-ink-100 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{name}</span>
                {dna && (
                  <span className="rounded bg-brand-50 px-1.5 text-[10px] text-forest-600">ДНК</span>
                )}
              </div>
              <div className="tabular-nums text-ink-500">{num}</div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {['Progenesis Lighter', 'Gywer RDC', 'Дубрава', '—'].map((name, i) => (
            <div
              key={`${name}-${i}`}
              className={`rounded-lg border px-2 py-1 ${
                name === '—' ? 'border-dashed border-ink-200 text-ink-400' : 'border-ink-100'
              }`}
            >
              {name === '—' ? 'предок неизвестен' : name}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        Пропуск в цепочке показан, а не скрыт: коэффициент родства считается по тому, что есть,
        и рядом стоит полнота данных.
      </p>
    </div>
  )
}

/** Качество данных: находка называет животное и поле. */
export function QualityScreen() {
  const rows: [string, string, string][] = [
    ['RU 4512 087', 'Отец моложе потомка', 'происхождение'],
    ['RU 4512 130', 'Осеменение раньше отёла', 'события'],
    ['RU 4511 902', 'Приплод не сходится с типом рождения', 'отёл'],
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">Качество книги</span>
        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
          3 находки
        </span>
      </div>

      <table className="w-full text-[11px]">
        <tbody>
          {rows.map(([animal, issue, where]) => (
            <tr key={animal} className="border-b border-ink-100 last:border-0">
              <td className="px-4 py-2 tabular-nums text-ink-500">{animal}</td>
              <td className="px-2 py-2">{issue}</td>
              <td className="px-4 py-2 text-right text-ink-400">{where}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-snug text-ink-400">
        Находка не блокирует работу: правило может ошибаться в редком случае, и решение остаётся
        за человеком.
      </p>
    </div>
  )
}

/**
 * Лактации и контрольные доения: ряд замеров и то, что из него следует.
 *
 * Раздел про доения текстом не показать: там речь о ряде — о том, что
 * замеры идут через равные промежутки и что из ряда считается кривая
 * и итог за 305 дней. Таблица из четырёх строк говорит это сразу,
 * а пропуск в ряду — самое частое, за что цепляется проверка, —
 * виден как разрыв.
 */
export function MilkScreen() {
  const rows: [день: string, надой: string, жир: string, белок: string][] = [
    ['30', '38,2', '3,74', '3,18'],
    ['58', '41,6', '3,68', '3,15'],
    ['86', '—', '—', '—'],
    ['114', '36,9', '3,91', '3,24'],
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">Контрольные доения</span>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] text-forest-600">A4</span>
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-ink-400">
            <th className="px-4 py-2 text-left font-normal">День лактации</th>
            <th className="px-2 py-2 text-right font-normal">Надой, кг</th>
            <th className="px-2 py-2 text-right font-normal">Жир, %</th>
            <th className="px-4 py-2 text-right font-normal">Белок, %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([day, milk, fat, protein]) => {
            const gap = milk === '—'
            return (
              <tr key={day} className="border-t border-ink-100">
                <td className={`px-4 py-2 tabular-nums ${gap ? 'text-ink-400' : ''}`}>{day}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${gap ? 'text-amber-700' : ''}`}>
                  {gap ? 'пропуск' : milk}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-ink-500">{fat}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-500">{protein}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex items-baseline justify-between border-t border-ink-100 px-4 py-3">
        <span className="text-[11px] text-ink-500">За 305 дней</span>
        <span className="text-[13px] font-medium tabular-nums">9 640 кг</span>
      </div>

      <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-snug text-ink-400">
        Метод записан рядом с рядом замеров: без него «9 640 кг» из двух хозяйств несравнимы,
        а выглядят одинаково.
      </p>
    </div>
  )
}

/**
 * Индекс племенной ценности: из чего он сложился.
 *
 * Само число ничего не значит без разбора — этому и посвящён раздел.
 * Поэтому рисунок показывает не индекс, а вклады: видно, что решило,
 * и видно, что один из вкладов отрицательный.
 */
export function IndexScreen() {
  const parts: [признак: string, вклад: number][] = [
    ['Жир', 46],
    ['Белок', 28],
    ['Здоровье вымени', 17],
    ['Композит тела', -9],
  ]
  const peak = Math.max(...parts.map(([, v]) => Math.abs(v)))

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">Индекс племенной ценности</span>
        <span className="text-[15px] font-medium tabular-nums text-forest-600">+460</span>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {parts.map(([name, value]) => (
          <div key={name}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span>{name}</span>
              <span className={`tabular-nums ${value < 0 ? 'text-[#9e3520]' : 'text-ink-500'}`}>
                {value > 0 ? '+' : '−'}
                {Math.abs(value)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-ink-100">
              <div
                className={`h-1.5 rounded-full ${value < 0 ? 'bg-[#c0563c]' : 'bg-forest-500'}`}
                style={{ width: `${(Math.abs(value) / peak) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-snug text-ink-400">
        Профиль назван, достоверность стоит рядом с числом. Индекс без профиля — число
        без единицы: сравнивать его не с чем.
      </p>
    </div>
  )
}

/**
 * Выгрузки и обмен: один и тот же животный, два адресата, две формы.
 *
 * Раздел объясняет, что запись одна, а форм у неё столько, сколько
 * адресатов. Показать это можно только рядом: слева строка реестра,
 * справа ответ по международному стандарту — те же величины, разные
 * имена полей.
 */
export function ExchangeScreen() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-medium">
          Государственный реестр
        </div>
        <dl className="space-y-1.5 px-4 py-3 text-[11px]">
          {[
            ['Базовый номер', 'RU 4512 087'],
            ['Дата доения', '12.04.2026'],
            ['Надой за сутки, кг', '38,2'],
            ['Массовая доля жира, %', '3,74'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-500">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-medium">
          ICAR ADE
        </div>
        <pre className="overflow-x-auto px-4 py-3 text-[10px] leading-relaxed text-ink-700">
{`{
  "animal": { "id": "RU4512087" },
  "milkingDateTime": "2026-04-12",
  "milkWeight24Hours": 38.2,
  "milkingMilkCharacteristics": [
    { "characteristic": "FAT", "value": 3.74 }
  ]
}`}
        </pre>
      </div>
    </div>
  )
}

/**
 * Линейная оценка экстерьера: шкала описывает, а не хвалит.
 *
 * ## Что здесь визуальный код
 *
 * Самое частое недоразумение с линейной оценкой в том, что её читают
 * как отметку в школе: пять — посредственно, девять — отлично. А это
 * шкала **описания**: у роста девятка означает «очень высокая»,
 * и хорошо это или плохо, зависит от того, чего добивается хозяйство.
 * У постановки ног обе крайности плохи, и лучшее — середина.
 *
 * Поэтому у признаков нарисована полоса желаемого, и она стоит
 * в разных местах шкалы. Одним рисунком снимается вопрос, который
 * абзацем не снимается никогда.
 *
 * ## Почему подписаны оба конца
 *
 * Без них шкала читается как «мало — много», то есть снова как отметка.
 * «Слоновость — саблистость» не оставляет такой возможности: обе
 * подписи называют недостаток, и становится видно, что оценка тут
 * не про количество.
 */
export function ConformationScreen() {
  const traits: {
    name: string
    low: string
    high: string
    /** Оценка животного, 1–9. */
    value: number
    /** Где лежит желаемое: от и до по той же шкале. */
    want: [number, number]
  }[] = [
    { name: 'Рост', low: 'низкая', high: 'высокая', value: 7, want: [6, 8] },
    { name: 'Глубина туловища', low: 'мелкое', high: 'глубокое', value: 6, want: [5, 8] },
    { name: 'Постановка задних ног', low: 'слоновость', high: 'саблистость', value: 5, want: [4, 6] },
    { name: 'Прикрепление вымени', low: 'слабое', high: 'плотное', value: 8, want: [7, 9] },
  ]

  /* Девять делений: доля от левого края до середины деления. */
  const at = (v: number) => ((v - 0.5) / 9) * 100

  return (
    <div className="space-y-4 p-4">
      {traits.map((t) => (
        <div key={t.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium">{t.name}</span>
            <span className="text-[11px] tabular-nums text-ink-500">{t.value} из 9</span>
          </div>

          <div className="relative mt-2 h-4">
            {/* полоса желаемого */}
            <div
              className="absolute top-1 h-2 rounded-full bg-brand-50"
              style={{
                left: `${at(t.want[0])}%`,
                width: `${at(t.want[1]) - at(t.want[0])}%`,
              }}
            />
            <div className="absolute top-[7px] h-0.5 w-full rounded-full bg-ink-100" />
            {/* деления */}
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
              <span
                key={n}
                className="absolute top-[5px] h-1.5 w-px bg-ink-200"
                style={{ left: `${at(n)}%` }}
              />
            ))}
            <span
              className="absolute top-0 h-4 w-1.5 -translate-x-1/2 rounded-full bg-forest-500"
              style={{ left: `${at(t.value)}%` }}
            />
          </div>

          <div className="mt-1 flex justify-between text-[10px] text-ink-400">
            <span>{t.low}</span>
            <span>{t.high}</span>
          </div>
        </div>
      ))}

      <p className="border-t border-ink-100 pt-3 text-[11px] leading-snug text-ink-400">
        Светлая полоса — желаемое, и она стоит в разных местах шкалы: у роста ближе к краю,
        у постановки ног посередине. Девятка не значит «лучше»; она значит «очень».
      </p>
    </div>
  )
}

/**
 * Подбор пар: индекс и родство рядом, а не по очереди.
 *
 * ## Что здесь визуальный код
 *
 * Что лучший по индексу бык может оказаться худшим выбором. В каталоге
 * поставщика этого не видно вовсе — там у быка одно число, — а видно
 * только у того, кто держит обе родословные разом и считает инбридинг
 * **будущего** потомка, которого ещё нет.
 *
 * Поэтому строки отсортированы по индексу, а помечен цветом другой
 * столбец: глаз идёт сверху вниз и на первой же строке спотыкается
 * о предупреждение. Это и есть то, ради чего раздел существует.
 *
 * ## Почему назван общий предок
 *
 * «Инбридинг 8,2 %» — число, с которым нельзя ничего сделать. «Общий
 * предок: RR Linus, отец матери» — повод посмотреть остальных быков
 * этой линии и выбрать другого. Предупреждение без причины
 * не предупреждение, а помеха.
 */
export function MatingScreen() {
  const bulls: { name: string; index: string; f: number; common?: string }[] = [
    { name: 'RR Linus', index: '+512', f: 8.2, common: 'общий предок: Progenesis Lighter, отец матери' },
    { name: 'Gywer RDC', index: '+486', f: 1.6 },
    { name: 'Bandares', index: '+455', f: 0.4 },
  ]

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-2">
        <span className="text-[12px] font-medium">Подбор к корове Ромашка</span>
        <span className="text-[11px] text-ink-400">порог 6,25 %</span>
      </div>

      <div className="mt-3 space-y-2">
        {bulls.map((b) => {
          const over = b.f > 6.25
          return (
            <div
              key={b.name}
              className={`rounded-lg border px-3 py-2 ${
                over ? 'border-[#e3c4bb] bg-[#fdf3f0]' : 'border-ink-100'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium">{b.name}</span>
                <span className="flex items-baseline gap-3 text-[11px] tabular-nums">
                  <span className="text-ink-500">ИПЦ {b.index}</span>
                  <span className={over ? 'font-medium text-[#9e3520]' : 'text-forest-600'}>
                    F потомка {b.f.toLocaleString('ru-RU')} %
                  </span>
                </span>
              </div>

              {b.common && (
                <p className="mt-1 text-[10px] leading-snug text-[#9e3520]">{b.common}</p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        Список отсортирован по индексу, а предупреждение стоит у первой строки: лучший
        по числу бык здесь и есть худший выбор. Увидеть это можно только там, где обе
        родословные лежат рядом.
      </p>
    </div>
  )
}
