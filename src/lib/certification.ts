import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'
import { buildPedigree, flattenPedigree, type PedigreeNode } from '@/lib/pedigree'

/**
 * Готовность животного к выпуску документов.
 *
 * Смысл проверки: зоотехник должен видеть причину отказа **до** того, как
 * нажмёт «Выпустить», а не после. Поэтому проверка возвращает не «да/нет»,
 * а список требований — каждое с отметкой и подсказкой, что именно сделать.
 *
 * Состав требований взят из разбора бланков, docs/sertifikaty-audit.md.
 */

export const CERTIFICATE_KINDS = {
  zootechnical: {
    slug: 'zootechnical',
    title: 'Зоотехнический сертификат',
    subtitle: 'Регламент (ЕС) 2016/1012 — для торговли чистопородными племенными животными',
    short: 'Для торговли, в том числе экспорта. Жёсткая форма из 15 разделов, два ряда предков.',
  },
  pedigree: {
    slug: 'pedigree',
    title: 'Племенное свидетельство',
    subtitle: 'Происхождение и продуктивность, три ряда предков',
    short:
      'Для селекционной работы. Три ряда предков с племенной ценностью каждого и лактациями.',
  },
} as const

export type CertificateKind = keyof typeof CERTIFICATE_KINDS

export type Requirement = {
  key: string
  label: string
  ok: boolean
  /** Что сделать, если требование не выполнено. */
  fix?: string
}

export type Readiness = {
  kind: CertificateKind
  requirements: Requirement[]
  ready: boolean
  /** Сколько требований выполнено. */
  done: number
  total: number
}

/* ------------------------------------------------------------------ */

const filled = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Связь заполнена: это либо id, либо развёрнутый объект. */
const hasRelation = (v: unknown): boolean =>
  typeof v === 'number' || (typeof v === 'object' && v !== null)

/** Сколько узлов заданного ряда родословной заведено карточками. */
const filledAtLevel = (nodes: PedigreeNode[], level: number): number =>
  flattenPedigree(nodes).filter((n) => n.code.length === level && n.animal).length

/* ------------------------------------------------------------------ */

export type PedigreeFacts = {
  parents: number
  grandParents: number
  greatGrandParents: number
}

/** Факты о родословной, нужные обеим проверкам. Считаются один раз. */
export async function collectPedigreeFacts(
  payload: Payload,
  animal: Animal,
): Promise<PedigreeFacts> {
  const roots = await buildPedigree(payload, animal, 3)
  return {
    parents: filledAtLevel(roots, 1),
    grandParents: filledAtLevel(roots, 2),
    greatGrandParents: filledAtLevel(roots, 3),
  }
}

/* ------------------------------------------------------------------ */

const trustRequirement = (animal: Animal): Requirement => ({
  key: 'trust',
  label: 'Данные верифицированы Ассоциацией',
  ok: (animal.trustLevel ?? 0) >= 3,
  fix: 'Отправьте данные на проверку через «События → Загрузка данных». Уровень поднимает сотрудник Ассоциации после сверки документов',
})

const parentageRequirement = (animal: Animal): Requirement => ({
  key: 'dna',
  label: 'Проведён тест на достоверность происхождения',
  ok: filled(animal.dnaTests),
  fix: 'Добавьте результат ДНК-теста во вкладке «Генетика». В сертификате это раздел 8 — метод и результат по каждому родителю',
})

const commonRequirements = (animal: Animal): Requirement[] => [
  trustRequirement(animal),
  {
    key: 'ident',
    label: 'Указан индивидуальный номер',
    ok: filled(animal.identNumber),
    fix: 'Заполните поле «Индивидуальный номер» во вкладке «Общие данные»',
  },
  {
    key: 'breed',
    label: 'Указана порода',
    ok: hasRelation(animal.breed),
    fix: 'Выберите породу во вкладке «Общие данные»',
  },
  {
    key: 'birthDate',
    label: 'Указана дата рождения',
    ok: filled(animal.birthDate),
    fix: 'Заполните дату рождения во вкладке «Общие данные»',
  },
  {
    key: 'owner',
    label: 'Указан владелец',
    ok: hasRelation(animal.owner),
    fix: 'Привяжите животное к организации-владельцу',
  },
]

/** Готовность к зоотехническому сертификату (ЕС 2016/1012): нужны два ряда предков. */
export function zootechnicalReadiness(animal: Animal, p: PedigreeFacts): Readiness {
  const requirements: Requirement[] = [
    ...commonRequirements(animal),
    {
      key: 'parents',
      label: 'Оба родителя заведены карточками',
      ok: p.parents >= 2,
      fix: 'Укажите отца и мать во вкладке «Происхождение». Текстовой записи недостаточно — в сертификате печатается номер каждого предка',
    },
    {
      key: 'grandParents',
      label: 'Заведены все четыре деда и бабки',
      ok: p.grandParents >= 4,
      fix: 'Раздел 12 сертификата требует два ряда предков. Заведите родителей отца и матери',
    },
    parentageRequirement(animal),
    {
      key: 'ipc',
      label: 'Есть племенная ценность и дата оценки',
      ok: filled(animal.ipc) && filled(animal.evaluationDate),
      fix: 'Разделы 13.1 и 13.2: заполните ИПЦ и дату генетической оценки во вкладке «Оценка»',
    },
  ]

  return summarize('zootechnical', requirements)
}

/** Готовность к племенному свидетельству: три ряда предков и продуктивность. */
export function pedigreeReadiness(animal: Animal, p: PedigreeFacts): Readiness {
  const isBull = animal.sex === 'male'

  const requirements: Requirement[] = [
    ...commonRequirements(animal),
    {
      key: 'line',
      label: 'Указана линия',
      ok: hasRelation(animal.line),
      fix: 'Выберите линию во вкладке «Происхождение»',
    },
    {
      key: 'parents',
      label: 'Оба родителя заведены карточками',
      ok: p.parents >= 2,
      fix: 'Укажите отца и мать во вкладке «Происхождение»',
    },
    {
      key: 'grandParents',
      label: 'Заведены все четыре деда и бабки',
      ok: p.grandParents >= 4,
      fix: 'Свидетельство печатает три ряда предков — второй ряд должен быть полным',
    },
    {
      key: 'greatGrandParents',
      label: 'Заведён хотя бы один предок третьего ряда',
      ok: p.greatGrandParents >= 1,
      fix: 'Третий ряд родословной пуст. Заведите прадедов хотя бы по одной линии',
    },
    parentageRequirement(animal),
    isBull
      ? {
          key: 'ipc',
          label: 'Есть племенная ценность быка',
          ok: filled(animal.ipc),
          fix: 'Заполните ИПЦ во вкладке «Оценка» — для быка это основной показатель свидетельства',
        }
      : {
          key: 'lactations',
          label: 'Есть данные хотя бы об одной лактации',
          ok: filled(animal.lactations),
          fix: 'Загрузите лактации через импорт данных или заполните их во вкладке «События»',
        },
  ]

  return summarize('pedigree', requirements)
}

function summarize(kind: CertificateKind, requirements: Requirement[]): Readiness {
  const done = requirements.filter((r) => r.ok).length
  return {
    kind,
    requirements,
    done,
    total: requirements.length,
    ready: done === requirements.length,
  }
}

/** Обе проверки сразу — родословная считается один раз на обе. */
export async function certificateReadiness(
  payload: Payload,
  animal: Animal,
): Promise<{ zootechnical: Readiness; pedigree: Readiness }> {
  const facts = await collectPedigreeFacts(payload, animal)
  return {
    zootechnical: zootechnicalReadiness(animal, facts),
    pedigree: pedigreeReadiness(animal, facts),
  }
}
