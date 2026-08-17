import { getClient } from '@/lib/payload'
import type { User } from '@/payload-types'

/**
 * История правок карточки.
 *
 * Показывается всем, кому видна сама карточка, а не только владельцу.
 * Это осознанно: покупатель, который смотрит животное, вправе знать, что
 * дату рождения поправили позавчера. Скрывать правки от того, кому открыты
 * сами данные, значит предлагать верить цифрам, не показывая их происхождения,
 * — а вся книга держится ровно на обратном.
 *
 * Загрузка файлом сюда не попадает: у неё свой след — пакет данных
 * с исходным файлом и протоколом приёмки.
 */

const SOURCE_LABEL: Record<string, string> = {
  manual: 'вручную',
  admin: 'из админки',
  system: 'системой',
}

const who = (user: unknown): string => {
  if (!user || typeof user !== 'object') return '—'
  const u = user as Partial<User>
  const name = [u.lastName, u.firstName].filter(Boolean).join(' ')
  return name || u.email || '—'
}

const when = (v?: string | null): string => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export async function AnimalRevisionsPanel({ animalId }: { animalId: number }) {
  const payload = await getClient()

  const { docs, totalDocs } = await payload.find({
    collection: 'animal-revisions',
    where: { animal: { equals: animalId } },
    sort: '-at',
    limit: 30,
    depth: 1,
    overrideAccess: true,
  })

  if (!totalDocs) return null

  return (
    <div className="card">
      <h3 className="panel-heading">История правок</h3>

      <p className="mb-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        Что меняли в карточке руками. Данные, пришедшие загрузкой файлом, сюда не попадают —
        их источник виден в пакете данных, вместе с исходным файлом.
      </p>

      <div className="overflow-x-auto">
        <table className="metric-table">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Поле</th>
              <th>Было</th>
              <th>Стало</th>
              <th>Кто</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-ink-500">{when(r.at)}</td>
                <td>{r.label || r.path}</td>
                <td className="text-ink-500">{r.before || '—'}</td>
                <td>{r.after || '—'}</td>
                <td className="whitespace-nowrap text-ink-500">
                  {who(r.user)}
                  {r.source && r.source !== 'manual' ? `, ${SOURCE_LABEL[r.source]}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalDocs > docs.length && (
        <p className="mt-3 text-[13px] text-ink-500">
          Показаны последние {docs.length} из {totalDocs.toLocaleString('ru-RU')}.
        </p>
      )}
    </div>
  )
}
