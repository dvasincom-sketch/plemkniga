import Link from 'next/link'
import type { PedigreeNode } from '@/lib/pedigree'
import { dateRu } from '@/lib/format'

/**
 * Генеалогическое древо: ряды предков растут слева направо.
 * Ряд 1 — О / М, ряд 2 — ОО / МО / ОМ / ММ, ряд 3 — восемь узлов.
 */

function NodeCard({ node }: { node: PedigreeNode }) {
  const identNumber = node.animal?.identNumber ?? node.text?.identNumber ?? null
  const name = node.animal?.name ?? node.text?.name ?? null
  const date = node.animal?.birthDate ? dateRu(node.animal.birthDate) : '—'

  const body = (
    <div className="flex h-[58px] w-full items-center justify-between gap-3 rounded-lg bg-[#e9e9e9] px-4 text-[13px] leading-tight">
      <div className="min-w-0">
        <div className="font-medium text-ink-900">{node.code}</div>
        <div className="truncate text-ink-700" title={name ?? undefined}>
          {name ?? '—'}
        </div>
      </div>
      <div className="flex-none text-right text-ink-700">
        <div>{date}</div>
        <div className="tabular-nums">№{identNumber ?? '—'}</div>
      </div>
    </div>
  )

  if (node.animal) {
    return (
      <Link
        href={`/animals/${node.animal.id}`}
        className="block w-full transition-colors hover:brightness-95"
        title="Открыть карточку предка"
      >
        {body}
      </Link>
    )
  }
  return body
}

/** Угловой соединитель со стрелкой от родительского узла к паре потомков. */
function Connector() {
  return (
    <div className="relative w-8 flex-none self-stretch" aria-hidden="true">
      <span className="absolute left-0 top-1/2 h-px w-3 bg-ink-900" />
      <span className="absolute left-3 top-1/4 h-1/2 w-px bg-ink-900" />
      <span className="absolute left-3 top-1/4 h-px w-4 bg-ink-900" />
      <span className="absolute bottom-1/4 left-3 h-px w-4 bg-ink-900" />
      <svg className="absolute right-0 top-[calc(25%-4px)]" width="7" height="8" viewBox="0 0 7 8">
        <path d="M0 0l7 4-7 4z" fill="#17181A" />
      </svg>
      <svg
        className="absolute bottom-[calc(25%-4px)] right-0"
        width="7"
        height="8"
        viewBox="0 0 7 8"
      >
        <path d="M0 0l7 4-7 4z" fill="#17181A" />
      </svg>
    </div>
  )
}

function Branch({ node }: { node: PedigreeNode }) {
  const hasChildren = node.children.length > 0

  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <div className="flex min-w-[190px] flex-1 items-center">
        <NodeCard node={node} />
      </div>

      {hasChildren && (
        <>
          <Connector />
          <div className="flex min-w-0 flex-[2] flex-col justify-between gap-3">
            {node.children.map((c) => (
              <Branch key={c.code} node={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function PedigreeTree({
  roots,
  coi,
}: {
  roots: PedigreeNode[]
  coi: number | null | undefined
}) {
  return (
    <div className="card">
      <p className="mb-6 text-[17px] font-medium">
        Коэффициент инбридинга (COI)={' '}
        <span className="tabular-nums">
          {coi === null || coi === undefined ? '—' : coi.toLocaleString('ru-RU')}
        </span>
      </p>

      <div className="overflow-x-auto">
        <div className="flex min-w-[900px] flex-col gap-6">
          {roots.map((r) => (
            <Branch key={r.code} node={r} />
          ))}
        </div>
      </div>

      <p className="mt-6 text-[13px] leading-relaxed text-ink-500">
        Обозначения: О — отец, М — мать; код читается справа налево (ОМ — отец матери, МОО — мать
        отца отца). Предки, заведённые в системе, кликабельны.
      </p>
    </div>
  )
}
