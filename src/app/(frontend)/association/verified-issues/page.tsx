import type { Metadata } from 'next'
import type { Where } from 'payload'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { checkAnimals, type Issue } from '@/lib/data-checks'
import { checkSpec } from '@/lib/checks-registry'
import { dateRu } from '@/lib/format'
import type { Animal } from '@/payload-types'

export const metadata: Metadata = { title: 'Подтверждено, но есть замечания' }
export const dynamic = 'force-dynamic'

/**
 * Подтверждённые записи, по которым сейчас срабатывает существенная проверка.
 *
 * ## Откуда они берутся
 *
 * Не от небрежности эксперта. С момента подтверждения проходит время,
 * и за это время меняются обе стороны сравнения: данные правят — хозяйство
 * дописывает отёлы, меняет родителей, — а список правил пополняется. Запись,
 * безупречная в мае, в августе может перестать быть таковой просто потому,
 * что в августе завели проверку, которой в мае не было.
 *
 * ## Почему статус не снимается сам
 *
 * Соблазн понятен: находка появилась — знак убрать, и он всегда честен.
 * Отвергнуто по двум причинам, и обе важнее удобства.
 *
 * Первая: цена ошибки в проверке. Новое правило с неудачным порогом
 * за одну ночь обесценило бы работу эксперта над тысячей записей, причём
 * молча и без чьего-либо решения. Проверки мы пишем сами и ошибаемся в них
 * регулярно — сегодняшняя ревизия нашла ложное срабатывание на половине
 * книги.
 *
 * Вторая: хозяйство увидело бы пропавший статус, не совершив ни одного
 * действия. Знак, который исчезает сам по себе, перестаёт что-либо значить
 * ещё быстрее, чем знак, который стоит не по праву.
 *
 * Поэтому здесь список, а не автоматическое снятие. Решение — за человеком,
 * и след у него остаётся: заявка, заключение, замечание.
 *
 * ## Потолок
 *
 * Разбор ходит в базу за родителями и родословной, и прогнать его по всей
 * книге значило бы отдать страницу на минуты. Берётся порция; сколько
 * осталось за потолком, страница говорит вслух.
 */

/** Сколько подтверждённых записей разбирается за один заход. */
const SCAN_LIMIT = 400

type Row = {
  animalId: number
  ident: string
  name?: string | null
  farm: string
  checkedAt?: string | null
  issues: Issue[]
}

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

export default async function VerifiedIssuesPage() {
  await requireAssociation()
  const payload = await getClient()

  /*
   * Сортировка по дате подтверждения, от старых к новым. Старые записи
   * подтверждались по самому короткому списку правил, и вероятность,
   * что с тех пор что-то разошлось, у них выше.
   */
  const where: Where = {
    and: [{ trustLevel: { equals: 3 } }, { archived: { not_equals: true } }],
  }

  const found = await payload.find({
    collection: 'animals',
    where,
    limit: SCAN_LIMIT,
    sort: 'trustCheckedAt',
    depth: 1,
    overrideAccess: true,
  })

  const animals = found.docs as Animal[]
  const { issues, limits } = animals.length
    ? await checkAnimals(payload, animals)
    : { issues: [], limits: [] as string[] }

  if (found.totalDocs > SCAN_LIMIT) {
    limits.unshift(
      `Просмотрено ${SCAN_LIMIT} подтверждённых записей из ${found.totalDocs}, ` +
        'начиная с подтверждённых раньше всех.',
    )
  }

  const byAnimal = new Map<number, Issue[]>()
  for (const i of issues) {
    if (i.severity !== 'fix') continue
    byAnimal.set(i.animalId, [...(byAnimal.get(i.animalId) ?? []), i])
  }

  const rows: Row[] = animals
    .filter((a) => byAnimal.has(a.id as number))
    .map((a) => ({
      animalId: a.id as number,
      ident: a.identNumber,
      name: a.name,
      farm: nameOf(a.owner),
      checkedAt: a.trustCheckedAt,
      issues: byAnimal.get(a.id as number) ?? [],
    }))

  /* Хозяйства сверху: чинить это будут они, и разговор идёт с ними. */
  const byFarm = new Map<string, Row[]>()
  for (const r of rows) byFarm.set(r.farm, [...(byFarm.get(r.farm) ?? []), r])

  const farms = [...byFarm.entries()].sort((a, b) => b[1].length - a[1].length)

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
              { label: 'Подтверждено, но есть замечания' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Подтверждено, но есть замечания
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Записи со статусом «Проверено ассоциацией», по которым сейчас срабатывает
            существенная проверка. Знак система не снимает: ошибка в пороге новой проверки
            не должна за ночь обесценить работу эксперта, а хозяйство не должно видеть
            пропавший статус, не совершив ни одного действия. Решение — за человеком.
          </p>

          <section className="mt-8">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="card">
                <p className="text-[13px] text-ink-500">Просмотрено записей</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {animals.length}
                </p>
              </div>
              <div className="card">
                <p className="text-[13px] text-ink-500">С замечаниями</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {rows.length}
                </p>
              </div>
              <div className="card">
                <p className="text-[13px] text-ink-500">Хозяйств затронуто</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {farms.length}
                </p>
              </div>
              <div className="card">
                <p className="text-[13px] text-ink-500">Всего подтверждено</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {found.totalDocs}
                </p>
              </div>
            </div>
          </section>

          {limits.length > 0 && (
            <section className="mt-6">
              <div className="card">
                <h2 className="panel-heading">Что проверено не полностью</h2>
                <ul className="space-y-2">
                  {limits.map((l) => (
                    <li key={l} className="text-[14px] leading-relaxed text-ink-700">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {rows.length === 0 ? (
            <div className="card mt-8">
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Ни по одной просмотренной записи существенных находок нет: подпись Ассоциации
                и текущие правила не расходятся.
              </p>
            </div>
          ) : (
            <section className="mt-8 space-y-4">
              {farms.map(([farm, list]) => (
                <div key={farm} className="card">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <h2 className="text-[17px] font-medium">{farm}</h2>
                    <span className="flex-none text-[14px] tabular-nums text-ink-500">
                      {list.length}
                    </span>
                  </div>

                  <ul className="mt-4 space-y-3 border-t border-ink-100 pt-4">
                    {list.map((r) => (
                      <li key={r.animalId} className="text-[14px]">
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <Link
                            href={`/animals/${r.animalId}`}
                            className="tabular-nums underline underline-offset-4"
                          >
                            {r.ident}
                          </Link>
                          {r.name && <span className="text-ink-700">{r.name}</span>}
                          <span className="text-[13px] text-ink-500">
                            подтверждено {dateRu(r.checkedAt)}
                          </span>
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {r.issues.map((i) => (
                            <li key={i.code + i.text} className="leading-snug text-ink-700">
                              <span className="mr-2 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[12px] text-red-700">
                                {checkSpec(i.code)?.label ?? i.code}
                              </span>
                              {i.text}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
