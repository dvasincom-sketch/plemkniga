'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { NodeMark, PedigreeAnalysis, PedigreeNode } from '@/lib/pedigree'
import { dateRu } from '@/lib/format'

/**
 * Генеалогическое древо: ряды предков растут слева направо.
 * Ряд 1 — О / М, ряд 2 — ОО / МО / ОМ / ММ, ряд 3 — восемь узлов.
 *
 * Цветовое маркирование помогает увидеть источник инбридинга:
 *  — общий предок отца и матери подсвечивается заливкой (даёт вклад в COI);
 *  — повтор внутри одной стороны отмечается пунктирной рамкой;
 *  — узлы на пути к повторяющемуся предку получают цветную рамку — это и есть
 *    «петля» инбридинга;
 *  — обрыв ветви и неподтверждённые данные отмечаются отдельно.
 * При наведении на узел все вхождения того же животного и путь к нему
 * выделяются, остальное древо приглушается.
 */

/** Палитра для повторяющихся предков — вне фирменной зелёной гаммы, чтобы не путать со статусами. */
const GROUP_COLORS = [
  { fill: '#e0e7ff', border: '#4f46e5', dot: '#4f46e5' },
  { fill: '#f3e8ff', border: '#a855f7', dot: '#a855f7' },
  { fill: '#ccfbf1', border: '#0d9488', dot: '#0d9488' },
  { fill: '#ffedd5', border: '#ea580c', dot: '#ea580c' },
  { fill: '#fce7f3', border: '#db2777', dot: '#db2777' },
]

const colorOf = (group?: number) =>
  group === undefined ? null : GROUP_COLORS[group % GROUP_COLORS.length]

function NodeCard({
  node,
  mark,
  dim,
  highlight,
  onHover,
}: {
  node: PedigreeNode
  mark: NodeMark
  dim: boolean
  highlight: boolean
  onHover: (animalId?: number) => void
}) {
  const identNumber = node.animal?.identNumber ?? node.text?.identNumber ?? null
  const name = node.animal?.name ?? node.text?.name ?? null
  const date = node.animal?.birthDate ? dateRu(node.animal.birthDate) : '—'
  const color = colorOf(mark.group)

  const style: React.CSSProperties = {}
  if (color && (mark.state === 'common' || mark.state === 'repeated')) {
    style.background = color.fill
    style.borderColor = color.border
    style.borderStyle = mark.state === 'common' ? 'solid' : 'dashed'
  } else if (mark.onPath && color) {
    style.borderColor = color.border
  }
  if (highlight) {
    style.boxShadow = `0 0 0 2px ${color?.border ?? '#17181a'}`
  }

  const stateTitle =
    mark.state === 'common'
      ? 'Общий предок отца и матери — даёт вклад в коэффициент инбридинга'
      : mark.state === 'repeated'
        ? 'Предок повторяется внутри одной стороны родословной — инбредным является родитель'
        : mark.state === 'missing'
          ? 'Ветвь обрывается: предок не заведён в системе'
          : mark.state === 'unverified'
            ? 'Данные предка не подтверждены лабораторией или Ассоциацией'
            : undefined

  const body = (
    <div
      data-code={node.code}
      data-state={mark.state}
      data-group={mark.group ?? ''}
      className={`flex h-[58px] w-full items-center justify-between gap-3 rounded-lg border px-4 text-[13px] leading-tight transition-opacity ${
        mark.state === 'missing'
          ? 'border-dashed border-ink-300 bg-transparent text-ink-300'
          : 'border-transparent bg-[#e9e9e9]'
      } ${dim ? 'opacity-30' : 'opacity-100'}`}
      style={style}
      title={stateTitle}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium text-ink-900">
          {node.code}
          {mark.state === 'unverified' && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500"
              aria-label="данные не подтверждены"
            />
          )}
        </div>
        <div className="truncate text-ink-700" title={name ?? undefined}>
          {name ?? '—'}
        </div>
      </div>

      <div className="flex flex-none items-center gap-2 text-right text-ink-700">
        <div>
          <div>{date}</div>
          <div className="tabular-nums">№{identNumber ?? '—'}</div>
        </div>
        {color && (mark.state === 'common' || mark.state === 'repeated') && (
          <span
            className="h-2.5 w-2.5 flex-none rounded-full"
            style={{ background: color.dot }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )

  const wrapper = (children: React.ReactNode) => (
    <div
      className="w-full"
      onMouseEnter={() => onHover(mark.animalId)}
      onMouseLeave={() => onHover(undefined)}
    >
      {children}
    </div>
  )

  if (node.animal) {
    return wrapper(
      <Link
        href={`/animals/${node.animal.id}`}
        className="block w-full transition-[filter] hover:brightness-95"
      >
        {body}
      </Link>,
    )
  }
  return wrapper(body)
}

function Connector({ color }: { color?: string }) {
  const c = color ?? '#17181A'
  return (
    <div className="relative w-8 flex-none self-stretch" aria-hidden="true">
      <span className="absolute left-0 top-1/2 h-px w-3" style={{ background: c }} />
      <span className="absolute left-3 top-1/4 h-1/2 w-px" style={{ background: c }} />
      <span className="absolute left-3 top-1/4 h-px w-4" style={{ background: c }} />
      <span className="absolute bottom-1/4 left-3 h-px w-4" style={{ background: c }} />
      <svg className="absolute right-0 top-[calc(25%-4px)]" width="7" height="8" viewBox="0 0 7 8">
        <path d="M0 0l7 4-7 4z" fill={c} />
      </svg>
      <svg className="absolute bottom-[calc(25%-4px)] right-0" width="7" height="8" viewBox="0 0 7 8">
        <path d="M0 0l7 4-7 4z" fill={c} />
      </svg>
    </div>
  )
}

function Branch({
  node,
  analysis,
  hovered,
  hoveredCodes,
  onHover,
}: {
  node: PedigreeNode
  analysis: PedigreeAnalysis
  hovered?: number
  hoveredCodes: Set<string>
  onHover: (animalId?: number) => void
}) {
  const mark = analysis.marks[node.code] ?? { state: 'normal' as const }
  const hasChildren = node.children.length > 0
  const dim = hovered !== undefined && !hoveredCodes.has(node.code)
  const highlight = hovered !== undefined && mark.animalId === hovered

  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <div className="flex min-w-[190px] flex-1 items-center">
        <NodeCard node={node} mark={mark} dim={dim} highlight={highlight} onHover={onHover} />
      </div>

      {hasChildren && (
        <>
          <Connector color={mark.onPath ? colorOf(mark.group)?.border : undefined} />
          <div className="flex min-w-0 flex-[2] flex-col justify-between gap-3">
            {node.children.map((c) => (
              <Branch
                key={c.code}
                node={c}
                analysis={analysis}
                hovered={hovered}
                hoveredCodes={hoveredCodes}
                onHover={onHover}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const LEGEND: { state: string; label: string }[] = [
  { state: 'common', label: 'Общий предок отца и матери — источник инбридинга' },
  { state: 'repeated', label: 'Повтор внутри одной стороны — инбредным является родитель' },
  { state: 'unverified', label: 'Данные предка не подтверждены' },
  { state: 'missing', label: 'Ветвь обрывается — предка нет в системе' },
]

export function PedigreeTree({
  roots,
  coi,
  analysis,
}: {
  roots: PedigreeNode[]
  coi: number | null | undefined
  analysis: PedigreeAnalysis
}) {
  const [hovered, setHovered] = useState<number | undefined>(undefined)

  // Коды, которые остаются яркими при наведении: все вхождения животного и пути к ним
  const hoveredCodes = new Set<string>()
  if (hovered !== undefined) {
    for (const [code, m] of Object.entries(analysis.marks)) {
      if (m.animalId !== hovered) continue
      for (let i = code.length - 1; i >= 0; i--) hoveredCodes.add(code.slice(i))
    }
  }

  const states = new Set(Object.values(analysis.marks).map((m) => m.state))

  return (
    <div className="card">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[17px] font-medium">
          Коэффициент инбридинга (COI) ={' '}
          <span className="tabular-nums">
            {coi === null || coi === undefined ? '—' : `${coi.toLocaleString('ru-RU')} %`}
          </span>
        </p>
        {analysis.groups.length > 0 && (
          <p className="text-sm text-ink-500">
            Повторяющихся предков: {analysis.groups.length} — наведите на карточку, чтобы увидеть
            все вхождения
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[900px] flex-col gap-6">
          {roots.map((r) => (
            <Branch
              key={r.code}
              node={r}
              analysis={analysis}
              hovered={hovered}
              hoveredCodes={hoveredCodes}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>

      {/* ------------------------------ Легенда ------------------------------ */}
      <div className="mt-7 border-t border-ink-100 pt-5">
        <div className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] text-ink-700">
          {LEGEND.filter((l) => states.has(l.state as never)).map((l) => (
            <span key={l.state} className="flex items-center gap-2">
              {l.state === 'common' && (
                <span
                  className="h-3.5 w-6 rounded border"
                  style={{ background: GROUP_COLORS[0].fill, borderColor: GROUP_COLORS[0].border }}
                />
              )}
              {l.state === 'repeated' && (
                <span
                  className="h-3.5 w-6 rounded border border-dashed"
                  style={{ background: GROUP_COLORS[1].fill, borderColor: GROUP_COLORS[1].border }}
                />
              )}
              {l.state === 'unverified' && (
                <span className="h-2 w-2 rounded-full bg-accent-500" />
              )}
              {l.state === 'missing' && (
                <span className="h-3.5 w-6 rounded border border-dashed border-ink-300" />
              )}
              {l.label}
            </span>
          ))}
        </div>

        {analysis.groups.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {analysis.groups.map((g) => {
              const c = GROUP_COLORS[g.group % GROUP_COLORS.length]
              return (
                <li
                  key={g.animalId}
                  className="flex cursor-default items-center gap-2"
                  onMouseEnter={() => setHovered(g.animalId)}
                  onMouseLeave={() => setHovered(undefined)}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.dot }} />
                  <span className="text-ink-900">{g.name ?? g.identNumber}</span>
                  <span className="text-ink-500">
                    {g.codes.join(', ')} ·{' '}
                    {g.kind === 'common' ? 'общий предок' : 'повтор в одной стороне'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
          Обозначения: О — отец, М — мать; код читается справа налево (ОМ — отец матери, МОО — мать
          отца отца). Предки, заведённые в системе, кликабельны.
        </p>
      </div>
    </div>
  )
}
