import Link from 'next/link'
import { operationGroup, operationLabel, OPERATION_GROUPS } from '@/lib/operations'
import type { Operation } from '@/payload-types'

/**
 * Лента журнала операций.
 *
 * ## Почему строка, а не карточка
 *
 * Журнал читают, ища глазами одну строку среди сотен: «когда именно
 * закрыли доступ», «кто выпустил ту ссылку». Карточки с отступами
 * помещают на экран десяток записей вместо полусотни и превращают
 * поиск в прокрутку.
 *
 * ## Почему предмет — ссылка не всегда
 *
 * Предмет операции переживает саму операцию не всегда: животное удалили
 * по сроку, приглашение отозвали, хозяйство слили. Ссылка на исчезнувшее
 * хуже отсутствия ссылки — она обещает страницу и приводит на «не найдено».
 * Поэтому ссылками сделаны только животные, и то по идентификатору,
 * который переживает переименование.
 */

const dt = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const GROUP_TONE: Record<string, string> = {
  accounts: 'text-ink-700',
  data: 'text-ink-700',
  access: 'text-amber-700',
  association: 'text-forest-500',
}

export function OperationsTable({
  rows,
  showOrganization = false,
}: {
  rows: Operation[]
  /** Колонка «Хозяйство» нужна только Ассоциации: у хозяйства оно одно. */
  showOrganization?: boolean
}) {
  if (rows.length === 0) {
    return (
      <div className="card">
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Записей нет. Журнал наполняется сам: вход в систему, приглашения и блокировки,
          заведение и архивирование карточек, перемещения, выпуск и отзыв доступа,
          заявки и решения Ассоциации.
        </p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="metric-table min-w-[860px]">
        <thead>
          <tr>
            <th className="whitespace-nowrap">Когда</th>
            <th>Действие</th>
            <th>Кто</th>
            {showOrganization && <th>Хозяйство</th>}
            <th>Предмет</th>
            <th>Подробность</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const group = operationGroup(r.action)
            const org =
              r.organization && typeof r.organization === 'object'
                ? (r.organization.shortName ?? r.organization.name)
                : null

            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-ink-500 tabular-nums">{dt(r.at)}</td>
                <td className={group ? GROUP_TONE[group] : ''}>{operationLabel(r.action)}</td>
                <td>{r.actorName || '—'}</td>
                {showOrganization && <td className="text-ink-500">{org ?? '—'}</td>}
                <td>
                  {r.subjectType === 'animal' && r.subjectId ? (
                    <Link
                      href={`/animals/${r.subjectId}`}
                      className="underline underline-offset-4 hover:text-forest-500"
                    >
                      {r.subject || r.subjectId}
                    </Link>
                  ) : (
                    (r.subject ?? '—')
                  )}
                </td>
                <td className="text-ink-500">{r.summary ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Отбор по разделу журнала.
 *
 * Разделов четыре, и это не украшение: у журнала три разных читателя
 * с разными вопросами. «Кто заходил и что с учётными записями» —
 * вопрос безопасности. «Что стало с данными» — вопрос зоотехника.
 * «Кому что открыли» — вопрос владельца. Одна лента на всех отвечает
 * на каждый из них хуже, чем могла бы.
 */
export function OperationGroups({
  base,
  active,
  counts,
}: {
  base: string
  active: string
  counts?: Record<string, number>
}) {
  const items = [{ value: 'all', label: 'Все' }, ...OPERATION_GROUPS]

  return (
    <div className="mt-6 flex flex-wrap gap-2 text-[14px]">
      {items.map((t) => (
        <Link
          key={t.value}
          href={t.value === 'all' ? base : `${base}?group=${t.value}`}
          className={`rounded-lg px-3 py-2 transition-colors ${
            active === t.value
              ? 'bg-forest-500 text-white'
              : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
          }`}
        >
          {t.label}
          {counts?.[t.value] ? ` · ${counts[t.value]}` : ''}
        </Link>
      ))}
    </div>
  )
}
