import Link from 'next/link'
import type { Animal } from '@/payload-types'
import { AGE_GROUPS, SEXES, STATES } from '@/lib/dictionaries'
import { nf, signed } from '@/lib/format'
import { LockHint } from './LockHint'
import { TableRowNav } from './TableRowNav'
import { ANONYMOUS, LOCK_HINT, isAnimalLocked, type Viewer } from '@/lib/visibility'

/**
 * Таблица книги.
 *
 * Колонок четырнадцать, и при узкой области они превращаются в горизонтальный
 * скролл, по которому невозможно сравнивать животных. Поэтому у каждой колонки
 * есть приоритет: основные видны всегда, вспомогательные показываются, когда
 * для них есть место. Ничего не теряется — полный набор всегда в карточке
 * животного, а на широком экране видна и вся таблица.
 *
 * Строка кликабельна целиком — обработчиком на таблице, см. `TableRowNav`.
 * Раньше здесь был растянутый невидимый слой поверх строки; он держался
 * на `position: relative` у `<tr>` и, когда это свойство не срабатывало,
 * накрывал собой пол-страницы.
 */

const ageShort = (v?: string | null) => AGE_GROUPS.find((o) => o.value === v)?.short ?? '—'

/**
 * Отец одной строкой: кличка, если есть, иначе номер.
 *
 * Связь может быть не заведена, а отец при этом известен из свидетельства —
 * тогда берём его оттуда. Показать «—» при заполненном `pedigreeText`
 * значило бы сказать «отец неизвестен» там, где он записан, просто
 * не связан с карточкой в книге.
 */
const fatherOf = (a: Animal): { text: string; linked: boolean } => {
  const f = a.father
  if (f && typeof f === 'object') return { text: f.name || String(f.identNumber ?? '—'), linked: true }
  const p = a.pedigreeText
  const text = p?.fatherName || p?.fatherId
  return text ? { text, linked: false } : { text: '—', linked: false }
}

/**
 * Тёлка или телёнок с продуктивностью — противоречие, а не редкость.
 *
 * До первого отёла лактации не бывает. Проверка на это в книге есть
 * (`production-before-calving`, `data-checks.ts`), и формулирует она
 * ровно эту мысль. Но список печатал такую строку наравне со всеми,
 * без единой пометки: книга знала, что число невозможно, и показывала
 * его как достоверное. Это хуже, чем не знать, — число берут в работу.
 *
 * Условие здесь повторяет проверку, а не зовёт её: проверка работает
 * по одной записи с обращениями в базу, а таблица рисует сотню строк
 * уже полученных данных. Повтор узкий и держится на том же поле.
 */
const contradicts = (a: Animal): boolean =>
  (a.ageGroup === 'calf' || a.ageGroup === 'heifer') &&
  (typeof a.summary?.milkYield === 'number' || (a.lactations ?? []).length > 0)

/**
 * Колонки и то, на какой ширине они прячутся.
 *
 * ## Почему порядок именно такой
 *
 * Раньше «Владелец» была видна всегда, а жир и белок прятались до `xl`
 * и `2xl`. В своём кабинете это означало, что колонка с одним и тем же
 * значением на все девяносто пять строк вытеснила те, ради которых
 * список открывают: голштинская селекция тридцать лет считается
 * в килограммах жира и белка, и продают тоже их, а не литры.
 *
 * Теперь владелец скрывается в своём стаде совсем (`ownHerd`), проценты
 * жира и белка видны всегда, а килограммы уходят первыми при нехватке
 * места — процент отвечает на вопрос «какое молоко», килограммы
 * на «сколько его»; второе восстанавливается из удоя, первое ниоткуда.
 *
 * ## Почему отец стоит сразу за кличкой
 *
 * Первый вопрос зоотехника к своему списку — чьи это дочери. Список
 * стада есть результат подбора, и без отца его нельзя прочитать как
 * результат: видно, что получилось, и не видно, от чего.
 */
const BASE_COLUMNS: { key: string; label: string; hide?: string }[] = [
  { key: 'num', label: '№' },
  // Замок относится к конкретному животному, а не к его владельцу: у одного
  // хозяйства часть записей может быть открыта, часть закрыта. Поэтому
  // он стоит рядом с номером, а не в колонке «Владелец»
  { key: 'lock', label: '' },
  { key: 'ident', label: 'Инд.№' },
  { key: 'name', label: 'Кличка' },
  /*
   * Отец не прячется ни на какой ширине. Прочие колонки уступают место
   * по очереди, эта не уступает: список стада читают как результат
   * подбора, и без отца видно, что получилось, но не от чего. Узкому
   * экрану остаётся горизонтальная прокрутка — она у таблицы и так есть.
   */
  { key: 'father', label: 'Отец' },
  { key: 'state', label: 'Состояние', hide: 'hidden 2xl:table-cell' },
  { key: 'sex', label: 'Пол' },
  { key: 'age', label: 'Возраст' },
  { key: 'milk', label: 'Удой, кг' },
  { key: 'fatPercent', label: 'Жир (%)' },
  { key: 'proteinPercent', label: 'Белок (%)' },
  { key: 'fatKg', label: 'Жир (кг)', hide: 'hidden xl:table-cell' },
  { key: 'proteinKg', label: 'Белок (кг)', hide: 'hidden xl:table-cell' },
  { key: 'sum', label: 'СБП (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'ipc', label: 'ИПЦ' },
  { key: 'owner', label: 'Владелец' },
]

const cls = (key: string) => BASE_COLUMNS.find((c) => c.key === key)?.hide ?? ''

/**
 * Колонка профиля встаёт рядом с ИПЦ, а не вместо него.
 *
 * ИПЦ — оценка Ассоциации, единая для всех; индекс по профилю — взгляд
 * конкретного хозяйства на тех же животных. Подменять одно другим значило бы
 * лишить пользователя точки отсчёта: «плюс восемьсот по нашему профилю»
 * говорит что-то только рядом с официальным числом. Так же устроена таблица
 * персонального индекса у Lactanet — своя колонка рядом с официальной.
 */
const columnsFor = (indexLabel?: string, ownHerd = false) => {
  /*
   * В своём стаде владелец у всех строк один, и колонка под него —
   * это девяносто пять повторений одного значения на месте, которого
   * не хватает жиру и белку. Убирается она здесь, а не классом
   * скрытия: колонки, которой в этом разрезе нет вовсе, не должно
   * быть и в шапке.
   */
  const base = ownHerd ? BASE_COLUMNS.filter((c) => c.key !== 'owner') : BASE_COLUMNS
  if (!indexLabel) return base
  const at = base.findIndex((c) => c.key === 'ipc')
  return [...base.slice(0, at + 1), { key: 'profileIndex', label: indexLabel }, ...base.slice(at + 1)]
}

export function AnimalTable({
  animals,
  startIndex = 0,
  viewer = ANONYMOUS,
  emptyText = 'По заданным условиям животных не найдено',
  indexLabel,
  indexValues,
  selectable = false,
  ownHerd = false,
}: {
  animals: Animal[]
  startIndex?: number
  /** Кто смотрит: от этого зависит, какие карточки под замком. */
  viewer?: Viewer
  /** Узел, а не строка: в подсказке об отсутствии записей уместна ссылка. */
  emptyText?: React.ReactNode
  /** Подпись колонки профиля. Пусто — колонки нет. */
  indexLabel?: string
  /** Значение индекса по id животного. */
  indexValues?: Record<number, number>
  /**
   * Показывать колонку с галочками.
   *
   * Сами галочки — обычные `input` без состояния: их считает и обнуляет
   * клиентская обёртка `HerdSelection` обработчиком на форме. Так таблица
   * остаётся серверной. Сделать её клиентской ради отметок значило бы
   * тащить на клиент четырнадцать колонок, справочники и разбор замка —
   * ради того, чтобы посчитать поставленные галочки.
   *
   * В значении — индивидуальный номер, а не идентификатор: отмеченное
   * уходит в форму ссылки на просмотр, а та работает номерами, потому что
   * номерами живёт хозяйство.
   */
  selectable?: boolean
  /**
   * Список своего стада, а не книги.
   *
   * Убирает колонку владельца и включает пометку противоречий. И то,
   * и другое имеет смысл только у себя: в общей книге владелец —
   * содержательная колонка, а тыкать чужое хозяйство в его же
   * противоречия посреди списка книга права не имеет. Свои находки
   * хозяйство разбирает в «Проверить моё стадо», чужие — Ассоциация.
   */
  ownHerd?: boolean
}) {
  const COLUMNS = columnsFor(indexLabel, ownHerd)

  return (
    <TableRowNav className="table-scroll">
      <table className="data-table w-full">
        <thead>
          <tr>
            {selectable && (
              /*
                 Галочка «все» стоит в шапке столбца, а не отдельной кнопкой
                 над таблицей: отмечают взглядом по столбцу, и переключатель
                 всего столбца должен быть его началом.

                 Состояние ей ставит `HerdSelection` — отмечена, когда
                 отмечены все, и в промежуточном виде, когда часть.
                 Промежуточный вид (`indeterminate`) через разметку задать
                 нельзя, только из кода, поэтому здесь стоит только
                 сам переключатель.
              */
              <th className="w-8 pr-0">
                <input
                  type="checkbox"
                  name="pick-all"
                  className="checkbox"
                  aria-label="Отметить все записи на странице"
                />
              </th>
            )}
            {COLUMNS.map((c) => (
              <th key={c.key} className={`whitespace-normal ${c.hide ?? ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {animals.length === 0 && (
            /* is-empty снимает со строки подсветку и курсор-руку:
               нажимать здесь не на что */
            <tr className="is-empty">
              <td colSpan={COLUMNS.length + (selectable ? 1 : 0)} className="py-10 text-center text-ink-500">
                {emptyText}
              </td>
            </tr>
          )}

          {animals.map((a, i) => {
            const owner =
              typeof a.owner === 'object' && a.owner ? a.owner.shortName || a.owner.name : '—'
            const locked = isAnimalLocked(a, viewer)
            const s = a.summary
            const ipc = a.ipc ?? null
            const father = fatherOf(a)
            const flagged = ownHerd && contradicts(a)

            return (
              // Адрес строки читает обработчик таблицы; сама ссылка
              // остаётся в ячейке с номером
              <tr key={a.id} data-href={`/animals/${a.id}`}>
                {selectable && (
                  /* Строка кликабельна целиком, но галочку это не задевает:
                     обработчик `TableRowNav` пропускает клики по `input`
                     мимо себя — там же, где по ссылкам и кнопкам */
                  <td className="w-8 pr-0">
                    {/*
                       Рядом с номером галочка несёт идентификатор записи и пол.

                       Значением её остаётся индивидуальный номер: его принимает
                       форма ссылки на просмотр, и подменять его идентификатором
                       значило бы сломать то, что работает. Но сравнение быков
                       просит `id`, а предложить сравнение можно только зная,
                       что отмечены быки. Оба ответа уже есть в строке, и тащить
                       их вторым запросом из браузера незачем.
                    */}
                    <input
                      type="checkbox"
                      name="pick"
                      value={String(a.identNumber ?? '')}
                      data-id={String(a.id)}
                      data-sex={a.sex ?? ''}
                      className="checkbox"
                      aria-label={`Отметить ${a.name ?? a.identNumber}`}
                    />
                  </td>
                )}
                <td className="tabular-nums">{startIndex + i + 1}</td>
                <td className="w-6 pl-0 pr-0">
                  {locked && <LockHint href={`/animals/${a.id}`} text={LOCK_HINT} />}
                </td>
                {/* Строка закрытого животного тоже кликабельна: на его странице
                    объясняется, кто закрыл доступ, и там же его запрашивают */}
                <td className="tabular-nums">
                  <Link
                    href={`/animals/${a.id}`}
                    className="cell-link"
                    title={
                      locked
                        ? `Доступ закрыт владельцем — открыть запись и запросить доступ: ${a.name ?? a.identNumber}`
                        : `Открыть карточку: ${a.name ?? a.identNumber}`
                    }
                  >
                    {a.identNumber}
                  </Link>
                </td>
                <td className="cell-truncate font-medium" title={a.name ?? undefined}>
                  {a.name ?? '—'}
                </td>
                {/*
                   Отец не связан с книгой — показан бледнее и без ссылки.
                   Разница существенная: связанный отец участвует в расчёте
                   инбридинга и племенной ценности, записанный текстом
                   не участвует ни в чём. Одинаковый вид означал бы, что
                   родословная учтена, когда она только переписана.
                */}
                <td className={`cell-truncate ${cls('father')}`} title={father.text}>
                  {father.linked ? (
                    father.text
                  ) : (
                    <span className="text-ink-500">{father.text}</span>
                  )}
                </td>
                {/* Полное название состояния: сокращения «Ж» у пола и у состояния означали разное */}
                <td className={cls('state')}>
                  {STATES.find((o) => o.value === a.state)?.full ?? '—'}
                </td>
                <td>{SEXES.find((o) => o.value === a.sex)?.label ?? '—'}</td>
                <td
                  title={
                    flagged
                      ? `${AGE_GROUPS.find((o) => o.value === a.ageGroup)?.label}, а продуктивность заполнена. До первого отёла лактации не бывает: либо группа устарела и животное уже отелилось, либо продуктивность приехала от другого животного. Разбор — в «Проверить моё стадо»`
                      : AGE_GROUPS.find((o) => o.value === a.ageGroup)?.label
                  }
                >
                  {flagged ? (
                    <span className="cell-flag">{ageShort(a.ageGroup)}</span>
                  ) : (
                    ageShort(a.ageGroup)
                  )}
                </td>
                <td className="tabular-nums">
                  {flagged ? <span className="cell-flag">{nf(s?.milkYield)}</span> : nf(s?.milkYield)}
                </td>
                <td className={`tabular-nums ${cls('fatPercent')}`}>{nf(s?.fatPercent, 2)}</td>
                <td className={`tabular-nums ${cls('proteinPercent')}`}>
                  {nf(s?.proteinPercent, 2)}
                </td>
                <td className={`tabular-nums ${cls('fatKg')}`}>{nf(s?.fatKg)}</td>
                <td className={`tabular-nums ${cls('proteinKg')}`}>{nf(s?.proteinKg)}</td>
                <td className={`tabular-nums ${cls('sum')}`}>{nf(s?.fatProteinSum)}</td>
                <td className="tabular-nums">
                  <span className={ipc !== null && ipc < 0 ? 'ipc-negative' : 'ipc-positive'}>
                    {signed(ipc)}
                  </span>
                </td>
                {indexLabel && (
                  <td className="tabular-nums font-medium">
                    {(() => {
                      const v = indexValues?.[a.id as number]
                      if (v === undefined) return '—'
                      return (
                        <span className={v < 0 ? 'ipc-negative' : 'ipc-positive'}>
                          {signed(Math.round(v))}
                        </span>
                      )
                    })()}
                  </td>
                )}
                {!ownHerd && (
                  <td className="cell-truncate" title={owner}>
                    {owner}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableRowNav>
  )
}
