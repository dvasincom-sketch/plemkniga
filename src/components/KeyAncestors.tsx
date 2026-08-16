'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { AncestryReport } from '@/lib/ancestry'
import { InfoTip } from './InfoTip'
import { TableRowNav } from './TableRowNav'
import { nf } from '@/lib/format'

/**
 * Ключевые предки — родословная вглубь, без дерева.
 *
 * Дерево отвечает на вопрос «кто родители». Начиная примерно с пятого колена
 * спрашивают другое: чья кровь в животном и откуда взялся инбридинг. Ответ
 * на это — не картинка, а упорядоченный список: девятое колено даёт 512 клеток,
 * и разглядывать их бессмысленно, а сорок строк с числами читаются за минуту.
 *
 * Сортировка по доле крови, а не по колену. Предок из третьего колена,
 * встреченный однажды, даёт 12,5 %; предок из седьмого, повторённый двадцать
 * раз, — больше. Второй случай и есть то, ради чего смотрят вглубь.
 */

const SHOW_STEP = 15

/**
 * Плотность заполнения колена.
 *
 * Высота столбика — доля заполненных клеток, а не число предков. Число
 * вглубь растёт всегда (клеток-то вдвое больше), и столбики по нему рисовали
 * картину «чем глубже, тем полнее» — прямо обратную правде. Доля показывает
 * то, что есть: родословная сходит на нет, и видно, на каком колене.
 */
function CoverageBar({ report }: { report: AncestryReport }) {
  return (
    <div className="mt-6">
      <p className="mb-3 text-[13px] text-ink-500">
        Заполненность родословной по коленам — какая доля клеток известна системе
      </p>

      <div className="flex items-end gap-1.5">
        {report.coverage.map((c) => {
          const share = c.known / c.possible
          return (
            <div key={c.generation} className="min-w-0 flex-1">
              <div
                className="relative h-16 overflow-hidden rounded-md bg-[#f0f0f0]"
                title={`${c.generation}-е колено: известно ${c.known} из ${c.possible} возможных`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 bg-forest-500"
                  style={{ height: `${Math.max(c.known > 0 ? 4 : 0, share * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-center text-[12px] tabular-nums text-ink-900">
                {share >= 0.995 ? '100 %' : `${nf(share * 100, 0)} %`}
              </p>
              <p className="text-center text-[11px] tabular-nums text-ink-500">
                {c.known} из {c.possible}
              </p>
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {report.coverage.map((c) => (
          <p key={c.generation} className="min-w-0 flex-1 text-center text-[11px] text-ink-500">
            {c.generation}-е
          </p>
        ))}
      </div>
    </div>
  )
}

export function KeyAncestors({ report }: { report: AncestryReport }) {
  const [shown, setShown] = useState(SHOW_STEP)

  if (report.totalDistinct === 0) {
    return (
      <div className="card">
        <p className="text-[15px] leading-relaxed text-ink-500">
          Предки не связаны карточками — родословная ведётся текстом. Разбор вглубь появится,
          когда предки будут заведены записями: только тогда систему можно спросить, чья кровь
          в животном.
        </p>
      </div>
    )
  }

  const rows = report.ancestors.slice(0, shown)
  const common = report.ancestors.filter((a) => a.onBothSides)

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h3 className="panel-heading mb-1">Ключевые предки</h3>
          <p className="max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Родословная разобрана до {report.depth}-го колена. Известно{' '}
            <span className="text-ink-900">{report.totalDistinct}</span>{' '}
            {plural(report.totalDistinct, 'предок', 'предка', 'предков')}, самое дальнее
            заполненное колено — {report.deepest}-е.
          </p>
        </div>

        {common.length > 0 && (
          <p className="rounded-xl bg-[#fff6e5] px-4 py-2.5 text-[14px] leading-snug">
            <span className="font-medium">{common.length}</span>{' '}
            {plural(common.length, 'предок', 'предка', 'предков')} с обеих сторон — они и дают
            инбридинг {nf(report.coi, 2)} %
          </p>
        )}
      </div>

      <CoverageBar report={report} />

      <TableRowNav className="table-scroll mt-7">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Предок</th>
              <th>Инд.№</th>
              <th className="whitespace-normal">Колена</th>
              <th className="text-right">Вхождений</th>
              <th className="whitespace-normal text-right">
                <span className="inline-flex items-center gap-1.5">
                  Доля крови
                  <InfoTip label="Как считается доля крови">
                    <p className="mb-2 font-medium text-ink-900">Доля крови</p>
                    <p>
                      Каждое родительское звено делит вклад пополам: родитель даёт 50 %, дед —
                      25 %, предок девятого колена — 0,195 %. Если предок встречается в
                      родословной несколько раз, доли складываются. Поэтому дальний, но
                      многократно повторённый бык может весить больше близкого.
                    </p>
                  </InfoTip>
                </span>
              </th>
              <th className="whitespace-normal text-right">
                <span className="inline-flex items-center gap-1.5">
                  Вклад в инбридинг
                  <InfoTip label="Как считается вклад в инбридинг">
                    <p className="mb-2 font-medium text-ink-900">Вклад в инбридинг</p>
                    <p>
                      Инбридинг создают только предки, встречающиеся и со стороны отца, и со
                      стороны матери: именно они могут передать животному две копии одного гена.
                      Вклад считается по формуле Райта с учётом собственного инбридинга самого
                      предка. Сумма по столбцу и есть коэффициент инбридинга животного.
                    </p>
                  </InfoTip>
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                data-href={`/animals/${a.id}`}
                className={a.onBothSides ? 'bg-[#fffaf0]' : undefined}
              >
                <td className="cell-truncate font-medium" title={a.name ?? undefined}>
                  <Link href={`/animals/${a.id}`} className="cell-link">
                    {a.name ?? '—'}
                  </Link>
                  {a.onBothSides && (
                    <span
                      className="ml-2 whitespace-nowrap rounded-md bg-[#e08a1e] px-1.5 py-0.5 text-[11px] font-normal text-white"
                      title="Встречается и со стороны отца, и со стороны матери"
                    >
                      с обеих сторон
                    </span>
                  )}
                </td>
                <td className="tabular-nums">{a.identNumber}</td>
                <td className="tabular-nums">{a.generations.join(', ')}</td>
                <td className="text-right tabular-nums">{a.occurrences}</td>
                <td className="text-right tabular-nums">{nf(a.bloodShare, 2)} %</td>
                <td className="text-right tabular-nums">
                  {a.coiContribution > 0 ? `${nf(a.coiContribution, 3)} %` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRowNav>

      {shown < report.ancestors.length && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShown((v) => v + SHOW_STEP * 2)}
            className="rounded-lg bg-white px-5 py-2.5 text-[15px] shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
          >
            Показать ещё · {report.ancestors.length - shown}
          </button>
        </div>
      )}
    </div>
  )
}

/** Русское склонение числительных — три формы. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
