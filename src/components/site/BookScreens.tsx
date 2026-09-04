import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
import {
  screensText,
  type ConformationTrait,
  type IndexPart,
  type ScreenRow,
  type SubmissionTone,
  type TrustStep,
} from '@/lib/book-screens-text'

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
 *
 * ## Почему у каждого экрана есть язык
 *
 * Третий довод был обещанием, пока подписи стояли прямо здесь: рисунок
 * «переводится вместе со страницей» только если ему есть чем переводиться.
 * Теперь слова приходят из `lib/book-screens-text.ts` по языку читателя,
 * а язык по умолчанию русский — чтобы экран, вставленный без него,
 * рисовался как прежде, а не пустым.
 */

/** Язык рисунка; без него — русский, как было до перевода. */
type ScreenProps = { locale?: Locale }

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

const Rows = ({ rows }: { rows: ScreenRow[] }) => (
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
export function AnimalStates({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).animal

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Panel title={t.outside.title} badge={t.outside.badge}>
        <Tabs items={t.outside.tabs} active={0} />
        <Rows rows={t.outside.rows} />
        <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
          {t.outside.note}
        </p>
      </Panel>

      <Panel title={t.own.title} badge={t.own.badge} badgeTone="own">
        <Tabs items={t.own.tabs} active={1} />
        <Rows rows={t.own.rows} />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2">
          {t.own.buttons.map((b) => (
            <span key={b} className="rounded-md bg-forest-500 px-2 py-0.5 text-[11px] text-white">
              {b}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title={t.bull.title} badge={t.bull.badge} badgeTone="bull">
        <Tabs items={t.bull.tabs} active={1} />
        <Rows rows={t.bull.rows} />
        <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
          {t.bull.note}
        </p>
      </Panel>
    </div>
  )
}

/**
 * Родословная: сколько поколений видно и что помечено.
 *
 * ## Почему номера ломаются посреди
 *
 * Международный номер — `HODEU000360023959` — для браузера одно слово,
 * и на телефоне он вылезал за плашку предка, ложась поверх соседней.
 * Перенос по любому знаку (`break-all`) здесь безопаснее переноса
 * по словам: у номера нет пробелов и дефисов, а разорванный номер
 * читается как номер, тогда как вылезший за рамку читается как поломка.
 */
export function PedigreeScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).pedigree

  return (
    /* Обводку даёт окно переключателя; своя вторая рамка внутри
       выглядела бы вложенным окном. */
    <div className="p-4">
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
        <div className="space-y-2">
          <div className="rounded-lg border border-ink-100 px-2 py-1.5">
            <div className="font-medium">{t.self.name}</div>
            <div className="break-all tabular-nums text-ink-500">{t.self.number}</div>
          </div>
        </div>

        <div className="space-y-2">
          {t.parents.map(([name, num, dna]) => (
            <div key={num} className="rounded-lg border border-ink-100 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{name}</span>
                {dna && (
                  <span className="rounded bg-brand-50 px-1.5 text-[10px] text-forest-600">
                    {t.dna}
                  </span>
                )}
              </div>
              <div className="break-all tabular-nums text-ink-500">{num}</div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {t.grand.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className={`rounded-lg border px-2 py-1 ${
                name === '—' ? 'border-dashed border-ink-200 text-ink-400' : 'border-ink-100'
              }`}
            >
              {name === '—' ? t.unknown : name}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        {t.note}
      </p>
    </div>
  )
}

/** Качество данных: находка называет животное и поле. */
export function QualityScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).quality

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">{t.title}</span>
        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
          {t.found}
        </span>
      </div>

      <table className="w-full text-[11px]">
        <tbody>
          {t.rows.map(([animal, issue, where]) => (
            <tr key={animal} className="border-b border-ink-100 last:border-0">
              <td className="px-4 py-2 tabular-nums text-ink-500">{animal}</td>
              <td className="px-2 py-2">{issue}</td>
              <td className="px-4 py-2 text-right text-ink-400">{where}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-snug text-ink-400">
        {t.note}
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
export function MilkScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).milk

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">{t.title}</span>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] text-forest-600">
          {t.method}
        </span>
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-ink-400">
            <th className="px-4 py-2 text-left font-normal">{t.head[0]}</th>
            <th className="px-2 py-2 text-right font-normal">{t.head[1]}</th>
            <th className="px-2 py-2 text-right font-normal">{t.head[2]}</th>
            <th className="px-4 py-2 text-right font-normal">{t.head[3]}</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map(([day, milk, fat, protein]) => {
            const gap = milk === '—'
            return (
              <tr key={day} className="border-t border-ink-100">
                <td className={`px-4 py-2 tabular-nums ${gap ? 'text-ink-400' : ''}`}>{day}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${gap ? 'text-amber-700' : ''}`}>
                  {gap ? t.gap : milk}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-ink-500">{fat}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-500">{protein}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex items-baseline justify-between border-t border-ink-100 px-4 py-3">
        <span className="text-[11px] text-ink-500">{t.totalLabel}</span>
        <span className="text-[13px] font-medium tabular-nums">{t.total}</span>
      </div>

      <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-snug text-ink-400">
        {t.note}
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
 *
 * Величины вкладов остаются здесь, а не уезжают в набор строк: они
 * задают длину полос, то есть сам рисунок, и от языка не зависят.
 * Переводится имя признака.
 */
export function IndexScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).index

  const parts: [признак: IndexPart, вклад: number][] = [
    ['fat', 46],
    ['protein', 28],
    ['udder', 17],
    ['body', -9],
  ]
  const peak = Math.max(...parts.map(([, v]) => Math.abs(v)))

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-[13px] font-medium">{t.title}</span>
        <span className="text-[15px] font-medium tabular-nums text-forest-600">{t.value}</span>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {parts.map(([part, value]) => (
          <div key={part}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span>{t.parts[part]}</span>
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
        {t.note}
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
 *
 * Правая половина не переводится вовсе: это ответ по стандарту ICAR,
 * и имена полей в нём английские на любом языке страницы. Перевести
 * их значило бы нарисовать сообщение, которого не бывает.
 */
export function ExchangeScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).exchange

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-medium">
          {t.register}
        </div>
        <dl className="space-y-1.5 px-4 py-3 text-[11px]">
          {t.rows.map(([k, v]) => (
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
 *
 * ## Почему числа остались здесь
 *
 * Оценка и границы желаемого — положение на шкале, а не слова: от них
 * зависит, где стоят отметка и полоса. В наборе строк они разъехались бы
 * между языками, и английский рисунок утверждал бы про то же животное
 * другое.
 */
export function ConformationScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).conformation

  const traits: {
    id: ConformationTrait
    /** Оценка животного, 1–9. */
    value: number
    /** Где лежит желаемое: от и до по той же шкале. */
    want: [number, number]
  }[] = [
    { id: 'stature', value: 7, want: [6, 8] },
    { id: 'depth', value: 6, want: [5, 8] },
    { id: 'legs', value: 5, want: [4, 6] },
    { id: 'udder', value: 8, want: [7, 9] },
  ]

  /* Девять делений: доля от левого края до середины деления. */
  const at = (v: number) => ((v - 0.5) / 9) * 100

  return (
    <div className="space-y-4 p-4">
      {traits.map((trait) => {
        const name = t.traits[trait.id]
        return (
          <div key={trait.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium">{name.name}</span>
              <span className="text-[11px] tabular-nums text-ink-500">{t.score(trait.value)}</span>
            </div>

            <div className="relative mt-2 h-4">
              {/* полоса желаемого */}
              <div
                className="absolute top-1 h-2 rounded-full bg-brand-50"
                style={{
                  left: `${at(trait.want[0])}%`,
                  width: `${at(trait.want[1]) - at(trait.want[0])}%`,
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
                style={{ left: `${at(trait.value)}%` }}
              />
            </div>

            <div className="mt-1 flex justify-between text-[10px] text-ink-400">
              <span>{name.low}</span>
              <span>{name.high}</span>
            </div>
          </div>
        )
      })}

      <p className="border-t border-ink-100 pt-3 text-[11px] leading-snug text-ink-400">
        {t.note}
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
export function MatingScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const text = screensText(locale)
  const t = text.mating

  /*
     Клички быков и их индексы одинаковы на любом языке — это имена
     и числа. Переводится подпись перед числом и причина предупреждения;
     сам инбридинг разбирается разрядами языка (`text.number`), иначе
     английский читатель увидел бы «8,2» и прочёл бы запятую как разряд.
  */
  const bulls: { name: string; index: string; f: number; common?: boolean }[] = [
    { name: 'RR Linus', index: '+512', f: 8.2, common: true },
    { name: 'Gywer RDC', index: '+486', f: 1.6 },
    { name: 'Bandares', index: '+455', f: 0.4 },
  ]

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-2">
        <span className="text-[12px] font-medium">{t.title}</span>
        <span className="text-[11px] text-ink-400">{t.threshold}</span>
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
                  <span className="text-ink-500">
                    {t.indexLabel} {b.index}
                  </span>
                  <span className={over ? 'font-medium text-[#9e3520]' : 'text-forest-600'}>
                    {t.fLabel} {text.number(b.f)} %
                  </span>
                </span>
              </div>

              {b.common && (
                <p className="mt-1 text-[10px] leading-snug text-[#9e3520]">{t.common}</p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        {t.note}
      </p>
    </div>
  )
}

/**
 * Отчёты: число, раскрытое в список животных.
 *
 * ## Что здесь визуальный код
 *
 * «За каждым числом стоит список» — обещание, которое словами звучит
 * одинаково у всех и потому не значит ничего. Показать его можно
 * единственным способом: раскрыть одну строку и показать под ней те
 * самые записи, из которых число получилось.
 *
 * Раскрыта нарочно средняя строка, а не первая. Раскрытая первая
 * читалась бы как «здесь так устроен заголовок»; раскрытая средняя —
 * как «раскрывается любая».
 *
 * ## Почему числа в списке хуже, чем в итоге
 *
 * Средний возраст первого отёла 25,4 месяца выглядит благополучно,
 * а в списке под ним стоят 26,8 и 27,2. Это и есть довод в пользу
 * списка: среднее прячет тех, ради кого отчёт открывают. Поставить
 * под хорошим средним три хороших животных значило бы нарисовать
 * возможность, которой незачем пользоваться.
 *
 * ## Почему нет даты пересчёта
 *
 * Отчёт считается при открытии, и приписка «на 4 сентября, 14:20»
 * говорила бы обратное — что число собрано заранее. К тому же
 * нарисованная дата стареет молча: через год рисунок утверждал бы,
 * что книга остановилась.
 */
export function ReportsScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).reports

  /* Раскрыта средняя строка; какая именно — устройство рисунка, а не слова. */
  const OPEN = 1

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-2">
        <span className="text-[12px] font-medium">{t.title}</span>
        <span className="text-[11px] text-ink-400">{t.computed}</span>
      </div>

      <div className="mt-2">
        {t.rows.map(([name, value, count], i) => (
          <div key={name}>
            <div
              className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-[11px] ${
                i === OPEN ? 'bg-ink-50' : ''
              }`}
            >
              <span>{name}</span>
              <span className="flex items-baseline gap-3 tabular-nums">
                <span className="text-[12px] font-medium">{value}</span>
                <span className="text-forest-600 underline underline-offset-2">{count}</span>
              </span>
            </div>

            {i === OPEN && (
              /*
                 Список смещён вправо и набран мельче: он подчинён строке,
                 а не стоит с ней рядом. Вровень он читался бы как ещё три
                 показателя отчёта.
              */
              <div className="ml-2 border-l border-ink-200 pl-3">
                {t.behind.map(([number, animal, behindValue]) => (
                  <div
                    key={number}
                    className="flex items-baseline justify-between gap-3 py-1 text-[11px]"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="tabular-nums text-ink-500">{number}</span>
                      <span>{animal}</span>
                    </span>
                    <span className="tabular-nums text-ink-500">{behindValue}</span>
                  </div>
                ))}
                <div className="py-1 text-[11px] text-ink-400">{t.more}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        {t.note}
      </p>
    </div>
  )
}

/**
 * Доступы: выдача на одно животное и запись о ней.
 *
 * ## Что здесь визуальный код
 *
 * Не роли — про них говорит карточка животного в трёх прочтениях
 * (`AnimalStates`), и рисовать их второй раз значит повторяться.
 * Здесь другое: **точечный доступ**, то есть выдача на одно животное
 * и на срок, и журнал, в котором эта выдача записана.
 *
 * Рядом стоят два перечня — что откроется и что не откроется. Один
 * без другого бесполезен: «покупатель увидит происхождение и оценку»
 * оставляет открытым вопрос «а надои?», из-за которого разговор
 * и заходит о доступах.
 *
 * ## Почему в журнале есть строка о будущем
 *
 * Последняя запись — «доступ закроется сам». Это ответ на возражение,
 * которое иначе останется невысказанным: выданный доступ не приходится
 * вспоминать и отзывать руками, он кончается сам. Строка о том, чего
 * ещё не произошло, помечена серым — иначе она читалась бы как
 * случившееся.
 */
export function AccessScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).access

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 pb-2">
        <span className="text-[12px] font-medium">{t.title}</span>
        <span className="text-[11px] text-ink-400">{t.until}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ink-100 px-3 py-2">
          <div className="text-[11px] text-ink-500">{t.shownTitle}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.shown.map((s) => (
              <span
                key={s}
                className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] text-forest-600"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink-100 px-3 py-2">
          <div className="text-[11px] text-ink-500">{t.hiddenTitle}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.hidden.map((s) => (
              <span key={s} className="rounded-md bg-ink-50 px-2 py-0.5 text-[11px] text-ink-400">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] text-ink-500">{t.logTitle}</div>
        <div className="mt-1.5 space-y-1">
          {t.log.map(([when, what, who], i) => {
            /* Будущее — последняя запись журнала: она о том, чего ещё не было. */
            const future = i === t.log.length - 1
            return (
              <div key={when} className="flex items-baseline gap-3 text-[11px]">
                <span className="w-[86px] shrink-0 tabular-nums text-ink-400">{when}</span>
                <span className={future ? 'text-ink-400' : ''}>{what}</span>
                <span className="ml-auto truncate text-right text-ink-400">{who}</span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        {t.note}
      </p>
    </div>
  )
}

/**
 * Заявки: пакет, принятый частями.
 *
 * ## Что здесь визуальный код
 *
 * «Принять можно частями» — фраза, за которой не видно устройства.
 * Рисунок показывает его целиком: пакет разложен на три исхода,
 * у каждого сомнения названа причина, а на кнопке стоят оба числа —
 * сто восемнадцать из ста двадцати двух. Кнопка «Принять» без чисел
 * означала бы ровно обратное: «залить файл как есть».
 *
 * ## Почему причины разные по строгости
 *
 * Одна запись отклонена, три отправлены на решение, и это не оттенки
 * одного и того же. Отца, которого нет в книге, дописать нельзя —
 * а осеменение раньше отёла бывает и правдой при редком стечении дат.
 * Разница между «нельзя» и «странно» есть в правилах и должна быть
 * видна на экране.
 *
 * ## Почему цепочка достоверности внизу
 *
 * Она отвечает на следующий вопрос — «и что, теперь этому верить?».
 * Уровень не назначается галочкой: он поднимается протоколом
 * лаборатории и закрепляется подписью с именем и датой. Последнее
 * звено показано неисполненным, потому что подпись это отдельное
 * действие человека, а не итог загрузки.
 */
export function SubmissionsScreen({ locale = DEFAULT_LOCALE }: ScreenProps) {
  const t = screensText(locale).submissions

  /* Числа исходов и готовность звеньев — устройство рисунка; слова к ним
     приходят по ключу, чтобы у языков не разъехались ни счёт, ни цвет. */
  const outcomes: { tone: SubmissionTone; count: string }[] = [
    { tone: 'ok', count: '118' },
    { tone: 'doubt', count: '3' },
    { tone: 'no', count: '1' },
  ]

  const chain: [шаг: TrustStep, готово: boolean][] = [
    ['declared', true],
    ['lab', true],
    ['signature', false],
  ]

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 pb-2">
        <span className="text-[12px] font-medium">{t.title}</span>
        <span className="text-[11px] tabular-nums text-ink-400">{t.count}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        {outcomes.map((o) => {
          const tone =
            o.tone === 'ok'
              ? 'border-ink-100'
              : o.tone === 'doubt'
                ? 'border-amber-200 bg-amber-50'
                : 'border-[#e3c4bb] bg-[#fdf3f0]'
          const number =
            o.tone === 'ok'
              ? 'text-forest-600'
              : o.tone === 'doubt'
                ? 'text-amber-800'
                : 'text-[#9e3520]'

          return (
            <div
              key={o.tone}
              className={`flex items-baseline gap-3 rounded-lg border px-3 py-2 text-[11px] ${tone}`}
            >
              <span className={`w-8 shrink-0 text-[13px] font-medium tabular-nums ${number}`}>
                {o.count}
              </span>
              <span>{t.outcomes[o.tone]}</span>
            </div>
          )
        })}
      </div>

      {/*
         Кнопка нарисованная и не нажимается — как кружки оконной рамки.
         Числа на ней стоят оба, потому что в них и заключено утверждение:
         принимается часть, а остальное остаётся в заявке, а не пропадает.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-forest-500 px-2.5 py-1 text-[11px] text-white">
          {t.accept}
        </span>
        <span className="text-[11px] text-ink-400">{t.rest}</span>
      </div>

      <div className="mt-4 border-t border-ink-100 pt-3">
        <div className="text-[11px] text-ink-500">{t.chainTitle}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {chain.map(([step, done], i) => (
            <span key={step} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[11px] text-ink-300">→</span>}
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] ${
                  done
                    ? 'bg-brand-50 text-forest-600'
                    : 'border border-dashed border-ink-200 text-ink-400'
                }`}
              >
                {t.chain[step]}
              </span>
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-snug text-ink-400">
        {t.note}
      </p>
    </div>
  )
}
