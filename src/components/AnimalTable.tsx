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

/** `hide` — класс, скрывающий колонку на тесных ширинах. */
const BASE_COLUMNS: { key: string; label: string; hide?: string }[] = [
  { key: 'num', label: '№' },
  // Замок относится к конкретному животному, а не к его владельцу: у одного
  // хозяйства часть записей может быть открыта, часть закрыта. Поэтому
  // он стоит рядом с номером, а не в колонке «Владелец»
  { key: 'lock', label: '' },
  { key: 'ident', label: 'Инд.№' },
  { key: 'name', label: 'Кличка' },
  { key: 'state', label: 'Состояние', hide: 'hidden 2xl:table-cell' },
  { key: 'sex', label: 'Пол' },
  { key: 'age', label: 'Возраст' },
  { key: 'milk', label: 'Удой, кг' },
  { key: 'fatPercent', label: 'Жир (%)', hide: 'hidden xl:table-cell' },
  { key: 'proteinPercent', label: 'Белок (%)', hide: 'hidden xl:table-cell' },
  { key: 'fatKg', label: 'Жир (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'proteinKg', label: 'Белок (кг)', hide: 'hidden 2xl:table-cell' },
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
const columnsFor = (indexLabel?: string) => {
  if (!indexLabel) return BASE_COLUMNS
  const at = BASE_COLUMNS.findIndex((c) => c.key === 'ipc')
  return [
    ...BASE_COLUMNS.slice(0, at + 1),
    { key: 'profileIndex', label: indexLabel },
    ...BASE_COLUMNS.slice(at + 1),
  ]
}

export function AnimalTable({
  animals,
  startIndex = 0,
  viewer = ANONYMOUS,
  emptyText = 'По заданным условиям животных не найдено',
  indexLabel,
  indexValues,
  selectable = false,
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
}) {
  const COLUMNS = columnsFor(indexLabel)

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

            return (
              // Адрес строки читает обработчик таблицы; сама ссылка
              // остаётся в ячейке с номером
              <tr key={a.id} data-href={`/animals/${a.id}`}>
                {selectable && (
                  /* Строка кликабельна целиком, но галочку это не задевает:
                     обработчик `TableRowNav` пропускает клики по `input`
                     мимо себя — там же, где по ссылкам и кнопкам */
                  <td className="w-8 pr-0">
                    <input
                      type="checkbox"
                      name="pick"
                      value={String(a.identNumber ?? '')}
                      /*
                       * Рядом с номером — идентификатор записи и пол.
                       *
                       * Значением галочки остаётся индивидуальный номер: его
                       * принимает форма ссылки на просмотр, и подменять его
                       * идентификатором значило бы сломать то, что работает.
                       * Но сравнение быков просит `id`, а предложить сравнение
                       * можно только зная, что отмечены быки. Оба ответа
                       * лежат в строке, и тащить их вторым запросом
                       * из браузера незачем.
                       */
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
                {/* Полное название состояния: сокращения «Ж» у пола и у состояния означали разное */}
                <td className={cls('state')}>
                  {STATES.find((o) => o.value === a.state)?.full ?? '—'}
                </td>
                <td>{SEXES.find((o) => o.value === a.sex)?.label ?? '—'}</td>
                <td title={AGE_GROUPS.find((o) => o.value === a.ageGroup)?.label}>
                  {ageShort(a.ageGroup)}
                </td>
                <td className="tabular-nums">{nf(s?.milkYield)}</td>
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
                <td className="cell-truncate" title={owner}>
                  {owner}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableRowNav>
  )
}
