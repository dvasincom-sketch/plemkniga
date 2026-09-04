import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'
import { buildPedigree, type PedigreeNode } from '@/lib/pedigree'
import { analyzeAncestry } from '@/lib/ancestry'
import { AGE_GROUPS, SEXES, labelOf } from '@/lib/dictionaries'
import { carrierLabel } from '@/lib/carrier'
import type { CertificateKind } from '@/lib/certification'

/**
 * Данные бланка, отделённые от того, где их взяли.
 *
 * Раньше печатная форма собиралась прямо из живой записи в момент открытия.
 * Бланк от этого всегда актуален — и это было названо решением, — но у него
 * есть оборотная сторона, которую называли реже: **выданный документ ничем
 * не подкреплён**. Свидетельство выпущено с ИПЦ +812, через месяц пересчёт,
 * и объяснить число в бумаге, на которую сослались в сделке, нечем.
 *
 * Рядом эта задача давно решена: у значения индекса хранится снимок весов
 * и версия базы сравнения — иначе через полгода число нечем объяснить
 * (решение №21). У документа не хранилось ничего.
 *
 * Отсюда устройство: один сборщик, два места вызова.
 *
 *  - **выпуск** (`issueDocumentAction`) собирает вид и кладёт его
 *    в `documents.snapshot` — это и есть снимок на дату;
 *  - **страница бланка** либо показывает снимок выданного документа,
 *    либо собирает вид заново, если документа ещё нет.
 *
 * Два независимых сборщика одного бланка разошлись бы, и расхождение
 * обнаружилось бы на бумаге, которую уже отдали покупателю. Поэтому
 * сборщик один.
 *
 * Вид — плоские готовые строки, а не ссылки на записи. Снимок, который
 * ссылается на живые данные, снимком не является: перечитав связь, мы снова
 * получим сегодняшнее значение. Здесь всё уже разрешено в текст и числа.
 */

/** Версия формы снимка. */
export const SNAPSHOT_VERSION = 1

export type CertificateNode = {
  code: string
  name: string
  identNumber: string
}

export type CertificateLactation = {
  number: number | null
  calvingDate: string | null
  dd: number | null
  milk: number | null
  fat: number | null
  protein: number | null
  fatKg: number | null
  proteinKg: number | null
}

export type CertificateView = {
  version: number
  kind: CertificateKind
  /** Когда собран вид. У выданного документа — дата выпуска. */
  builtAt: string

  animalId: number
  trustLevel: number

  name: string
  identNumber: string
  breed: string
  sex: string
  ageGroup: string
  birthDate: string | null
  tag: string

  owner: string
  ownerAddress: string

  nodes: CertificateNode[]
  coi: number | null
  line: string

  dnaTests: { label: string; value: string }[]
  markers: string

  ipc: number | null
  evaluationDate: string | null
  reliability: number | null
  percentile: number | null

  lactations: CertificateLactation[]
}

const relName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = o.name ?? o.fullName ?? o.shortName
    if (typeof n === 'string' && n) return n
  }
  return '—'
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Плоский список узлов родословной по коду. */
const flatten = (roots: PedigreeNode[]): CertificateNode[] => {
  const out: CertificateNode[] = []
  const walk = (nodes: PedigreeNode[]) => {
    for (const n of nodes) {
      out.push({
        code: n.code,
        name: n.animal?.name ?? n.text?.name ?? '—',
        identNumber: n.animal?.identNumber ?? n.text?.identNumber ?? '—',
      })
      walk(n.children)
    }
  }
  walk(roots)
  return out
}

/**
 * Собрать вид бланка из живой записи.
 *
 * Глубина родословной зависит от вида документа: в племенном свидетельстве
 * три ряда предков, в зоотехническом — два. Собираем три всегда и лишнее
 * не показываем: снимок дешевле сделать полным, чем потом объяснять, почему
 * у выданного зоотехнического сертификата нельзя достроить ряд.
 */
export async function buildCertificateView(
  payload: Payload,
  animal: Animal,
  kind: CertificateKind,
  builtAt: string = new Date().toISOString(),
): Promise<CertificateView> {
  const [roots, ancestry] = await Promise.all([
    buildPedigree(payload, animal, 3),
    analyzeAncestry(payload, animal),
  ])

  const ownerAddress =
    typeof animal.owner === 'object' && animal.owner ? (animal.owner.address ?? '') : ''

  const markers =
    [
      /*
         Подпись, а не значение. Печаталось `CVM: carrier` — машинное
         слово в документе, который предъявляют покупателю; на экране
         при этом всё было правильно, и потому никто не замечал.
      */
      animal.genetics?.cvm ? `CVM: ${carrierLabel(animal.genetics.cvm)}` : null,
      animal.genetics?.blad ? `BLAD: ${carrierLabel(animal.genetics.blad)}` : null,
      animal.genetics?.dumps ? `DUMPS: ${carrierLabel(animal.genetics.dumps)}` : null,
      animal.genetics?.kappaCasein ? `κ-казеин: ${animal.genetics.kappaCasein}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—'

  return {
    version: SNAPSHOT_VERSION,
    kind,
    builtAt,

    animalId: animal.id as number,
    trustLevel: animal.trustLevel ?? 0,

    name: animal.name ?? '—',
    identNumber: String(animal.identNumber ?? '—'),
    breed: relName(animal.breed),
    sex: SEXES.find((s) => s.value === animal.sex)?.full ?? '—',
    ageGroup: labelOf(AGE_GROUPS, animal.ageGroup),
    birthDate: animal.birthDate ?? null,
    tag: animal.altIds?.earTag || animal.altIds?.chipNumber || '—',

    owner: relName(animal.owner),
    ownerAddress,

    nodes: flatten(roots),
    coi: num(ancestry.coi),
    line: relName(animal.line),

    dnaTests: (animal.dnaTests ?? []).map((t) => ({
      label: `${t.type ?? 'ДНК-тест'} · ${t.date ?? '—'}`,
      value: `${t.result ?? '—'}${t.laboratory ? ` · ${relName(t.laboratory)}` : ''}`,
    })),
    markers,

    ipc: num(animal.ipc),
    evaluationDate: animal.evaluationDate ?? null,
    reliability: num(animal.ipcDetails?.r),
    percentile: num(animal.ipcDetails?.percentile),

    lactations: (animal.lactations ?? []).map((l, i) => ({
      number: num(l.number) ?? i + 1,
      calvingDate: l.calvingDate ?? null,
      dd: num(l.dd),
      milk: num(l.milk305) ?? num(l.milkYield),
      fat: num(l.fat305),
      protein: num(l.protein305),
      fatKg: num(l.fatKg),
      proteinKg: num(l.proteinKg),
    })),
  }
}

/**
 * Прочитать снимок из документа.
 *
 * Возвращает `null`, если снимка нет или он другой версии. Показывать чужую
 * версию «как получится» нельзя: бланк — юридически значимая бумага,
 * и молчаливое несовпадение полей там дороже отказа. Документы, выпущенные
 * до появления снимка, честно показываются как живой предпросмотр
 * с отметкой об этом.
 */
export const readSnapshot = (raw: unknown): CertificateView | null => {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Partial<CertificateView>
  if (v.version !== SNAPSHOT_VERSION) return null
  if (!v.identNumber || !Array.isArray(v.nodes)) return null
  return v as CertificateView
}
