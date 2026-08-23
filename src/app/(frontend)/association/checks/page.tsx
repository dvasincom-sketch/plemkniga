import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ThresholdForm } from '@/components/ThresholdForm'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { THRESHOLDS, resolveThresholds, type ThresholdKey } from '@/lib/check-thresholds'
import { checkSpec } from '@/lib/checks-registry'

export const metadata: Metadata = { title: 'Пороги проверок' }
export const dynamic = 'force-dynamic'

/**
 * Пороги автоматических проверок — кабинет Ассоциации.
 *
 * ## Зачем это отдельная страница, а не админка Payload
 *
 * В админке эти числа были доступны и раньше — как строки таблицы с полем
 * `key` и полем `value`. Формально настройка существовала; на деле ею
 * нельзя было пользоваться, не зная наизусть имён порогов и того, какие
 * правила от какого числа зависят.
 *
 * Здесь у каждого числа есть имя на человеческом языке, объяснение, откуда
 * взято заложенное значение, границы допустимого и список правил, которые
 * изменятся вместе с ним. Настройка, требующая знать реестр наизусть, —
 * не настройка, а разрешение.
 *
 * ## Почему пороги на всю книгу, а не на хозяйство
 *
 * Порог, свой у каждого хозяйства, ломает главное свойство книги —
 * сравнимость записей между хозяйствами. «Проверено ассоциацией» должно
 * означать одно и то же во всех стадах, иначе оно не означает ничего.
 *
 * ## Чего здесь нет
 *
 * Потолков расчёта: глубины обхода родословной, числа сверяемых записей,
 * размеров выборок. Это цена вычисления, а не мера нарушения. Отдать их
 * в настройку значило бы предложить Ассоциации управлять
 * производительностью, ничего о ней не зная, — и получить разбор,
 * который однажды думает минуту.
 */

const GROUPS: { title: string; intro: string; keys: ThresholdKey[] }[] = [
  {
    title: 'Продуктивность',
    intro:
      'Рамки правдоподобия, а не нормативы: за ними начинается «так не бывает». Ошибку в единицах измерения они ловят, хорошее животное — нет.',
    keys: ['milkMin', 'milkMax', 'fatMin', 'fatMax', 'proteinMin', 'proteinMax'],
  },
  {
    title: 'Происхождение',
    intro: 'Кровность, инбридинг и возраст родителей на момент рождения потомка.',
    keys: [
      'bloodNote',
      'bloodFix',
      'inbreedingTolerance',
      'inbreedingHigh',
      'parentAgeMinMonths',
      'parentAgeMaxYears',
    ],
  },
  {
    title: 'Воспроизводство',
    intro: 'Сроки, за которыми события становятся физически невозможными.',
    keys: ['gestationMinDays', 'voluntaryWaitDays', 'afcMin', 'afcMax'],
  },
  {
    title: 'Сопоставимость по стаду',
    intro:
      'Здесь пороги — про долю, а не про величину. Одна корова, рождённая первого января, — совпадение; четверть стада первого января — способ ведения учёта.',
    keys: [
      'herdMin',
      'herdUnitsFactor',
      'herdJan1Share',
      'herdFirstOfMonthShare',
      'herdRoundedShare',
      'herdOutlierFactor',
    ],
  },
  {
    title: 'Состояние и выбытие',
    intro: 'Возраст, выше которого «в стаде» означает скорее неотмеченное выбытие.',
    keys: ['ageMaxYears'],
  },
]

export default async function AssociationChecksPage() {
  await requireAssociation()
  const payload = await getClient()

  const [values, notes] = await Promise.all([
    resolveThresholds(payload),
    payload
      .find({ collection: 'check-thresholds', limit: THRESHOLDS.length, depth: 0, overrideAccess: true })
      .then((r) => new Map(r.docs.map((d) => [String(d.key), (d.note as string) ?? null])))
      .catch(() => new Map<string, string | null>()),
  ])

  const specOf = (key: ThresholdKey) =>
    THRESHOLDS.find((t) => t.key === key) as (typeof THRESHOLDS)[number]

  const changed = THRESHOLDS.filter((t) => values[t.key as ThresholdKey] !== t.default).length

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="quality" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Кабинет Ассоциации', href: '/association' },
              { label: 'Качество книги', href: '/association/quality' },
              { label: 'Пороги проверок' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Пороги проверок</h1>

          <div className="mt-4 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
            <p>
              Числа, по которым срабатывают автоматические проверки. Действуют на всю книгу:
              порог, свой у каждого хозяйства, ломает сравнимость записей между хозяйствами,
              а значит и смысл знака «Проверено ассоциацией».
            </p>
            <p>
              Каждое изменение видно хозяйствам в{' '}
              <Link href="/account/checks" className="underline underline-offset-4">
                каталоге проверок
              </Link>{' '}
              вместе с объяснением. Правило, изменённое молча, читается как ошибка в коде.
            </p>
          </div>

          <div className="card mt-6">
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              {changed === 0 ? (
                <>
                  Все пороги — заложенные. Ни одно число пока не менялось.
                </>
              ) : (
                <>
                  Изменено порогов: <span className="font-medium">{changed}</span>. Рядом
                  с изменёнными показано заложенное значение — и его можно вернуть одним
                  нажатием.
                </>
              )}
            </p>
            <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              Выключить проверку или поменять её существенность — другая настройка, она
              в админке, коллекция «Настройки проверок». Здесь только числа.
            </p>
          </div>

          <div className="mt-10 space-y-12">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h2 className="section-title mb-2">{g.title}</h2>
                <p className="mb-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                  {g.intro}
                </p>

                <div className="space-y-4">
                  {g.keys.map((key) => {
                    const spec = specOf(key)
                    return (
                      <ThresholdForm
                        key={key}
                        spec={{
                          key: spec.key,
                          label: spec.label,
                          unit: spec.unit,
                          value: values[key],
                          default: spec.default,
                          min: spec.min,
                          max: spec.max,
                          step: spec.step,
                          why: spec.why,
                          /*
                             Правила названы по-человечески, а не кодами.
                             Код проверки — наш внутренний язык; эксперт,
                             меняющий число, должен видеть, что изменится
                             в его работе, а не в нашем реестре.
                          */
                          used: spec.used.map((c) => checkSpec(c)?.label ?? c),
                          note: notes.get(spec.key) ?? null,
                        }}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
