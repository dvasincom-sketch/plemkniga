import Link from 'next/link'
import type { Animal } from '@/payload-types'
import { AGE_GROUPS, SEXES, STATES } from '@/lib/dictionaries'
import { nf, signed } from '@/lib/format'
import { LockHint } from './LockHint'
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
 * Строка кликабельна целиком: ссылка в первой ячейке растягивается на всю
 * строку невидимым слоем. Раньше кликались только номер и кличка, хотя
 * подсвечивалась вся строка — подсветка обещала больше, чем работало.
 */

const ageShort = (v?: string | null) => AGE_GROUPS.find((o) => o.value === v)?.short ?? '—'

/** `hide` — класс, скрывающий колонку на тесных ширинах. */
const COLUMNS: { key: string; label: string; hide?: string }[] = [
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
  { key: 'milk', label: 'Удой (л)' },
  { key: 'fatPercent', label: 'Жир (%)', hide: 'hidden xl:table-cell' },
  { key: 'proteinPercent', label: 'Белок (%)', hide: 'hidden xl:table-cell' },
  { key: 'fatKg', label: 'Жир (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'proteinKg', label: 'Белок (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'sum', label: 'СБП (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'ipc', label: 'ИПЦ' },
  { key: 'owner', label: 'Владелец' },
]

const cls = (key: string) => COLUMNS.find((c) => c.key === key)?.hide ?? ''

export function AnimalTable({
  animals,
  startIndex = 0,
  viewer = ANONYMOUS,
  emptyText = 'По заданным условиям животных не найдено',
}: {
  animals: Animal[]
  startIndex?: number
  /** Кто смотрит: от этого зависит, какие карточки под замком. */
  viewer?: Viewer
  emptyText?: string
}) {
  return (
    <div className="table-scroll">
      <table className="data-table w-full">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className={`whitespace-normal ${c.hide ?? ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {animals.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="py-10 text-center text-ink-500">
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
              <tr key={a.id}>
                <td className="tabular-nums">{startIndex + i + 1}</td>
                <td className="w-6 pl-0 pr-0">
                  {locked && <LockHint href={`/animals/${a.id}`} text={LOCK_HINT} />}
                </td>
                {/* Строка закрытого животного тоже кликабельна: на его странице
                    объясняется, кто закрыл доступ, и там же его запрашивают */}
                <td className="tabular-nums">
                  <Link
                    href={`/animals/${a.id}`}
                    className="row-link"
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
                <td className="cell-truncate" title={owner}>
                  {owner}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
