import type { Metadata } from 'next'
import type { Where } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { checkAnimals, type Issue } from '@/lib/data-checks'
import { checkSpec, type CheckCode } from '@/lib/checks-registry'
import type { Animal } from '@/payload-types'

export const metadata: Metadata = { title: 'Проверка моего стада' }
export const dynamic = 'force-dynamic'

/**
 * Прогон автоматических проверок по своему стаду — до подачи, а не после.
 *
 * ## Зачем это хозяйству и зачем Ассоциации
 *
 * До сих пор хозяйство узнавало о замечаниях единственным способом: подать
 * заявку, подождать две недели, прочитать заключение, починить, подать
 * заново. Эксперт при этом разбирал одну и ту же заявку дважды — и второй
 * раз ради ошибок, которые машина нашла бы за секунду ещё до подачи.
 *
 * Здесь те же самые правила, тот же код `checkAnimals`, тот же список.
 * Разница одна: запускает их хозяйство, когда захочет, и по своим записям.
 * Это не поблажка проверяемому — наоборот, единственный способ сделать так,
 * чтобы до эксперта доходило то, ради чего он нужен: спорные случаи,
 * а не опечатки в датах.
 *
 * ## Почему не все записи сразу
 *
 * Проверки ходят в базу за родителями, отёлами и родословной. У хозяйства
 * с тремя тысячами животных полный прогон занял бы минуты, и страница
 * выглядела бы сломанной. Поэтому берётся та часть стада, ради которой
 * всё и затевается, — записи, ещё не подтверждённые Ассоциацией. Сколько
 * осталось за потолком, страница говорит прямо: «замечаний не найдено»
 * и «замечаний не искали» не должны выглядеть одинаково.
 */

/**
 * Потолок разбора.
 *
 * Пятьсот — столько же, сколько в типичном пакете загрузки, то есть
 * порция работы, к которой хозяйство привыкло. Больше делает страницу
 * медленной, меньше — заставляет ходить сюда по десять раз.
 */
const SCAN_LIMIT = 500

const SEVERITY_TONE = {
  fix: 'bg-[#fdecea] text-[#8c2f27]',
  note: 'bg-canvas text-ink-700',
} as const

/** Сколько животных показывать под одной находкой, прежде чем свернуть остаток. */
const SHOWN_PER_GROUP = 12

type Group = {
  code: CheckCode
  label: string
  why: string
  severity: 'fix' | 'note'
  issues: Issue[]
}

export default async function HerdCheckPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой разбор
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()

  /*
   * В разбор идут неподтверждённые записи: подтверждённые проверять незачем,
   * их уже смотрел эксперт. Сортировка по номеру, а не по дате правки, —
   * чтобы повторный прогон брал те же записи и хозяйство видело, что
   * починенное ушло из списка, а не что список перетасовался.
   */
  const where: Where = {
    and: [
      { owner: { equals: orgId } },
      { trustLevel: { less_than: 3 } },
      { archived: { not_equals: true } },
    ],
  }

  const found = orgId
    ? await payload.find({
        collection: 'animals',
        where,
        limit: SCAN_LIMIT,
        sort: 'identNumber',
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [], totalDocs: 0 }

  const animals = found.docs as Animal[]
  const { issues, limits } = animals.length
    ? await checkAnimals(payload, animals)
    : { issues: [], limits: [] as string[] }

  if (found.totalDocs > SCAN_LIMIT) {
    limits.unshift(
      `Проверено ${SCAN_LIMIT} записей из ${found.totalDocs} неподтверждённых. ` +
        'Исправьте найденное — и следующий прогон возьмёт следующие: подтверждённые записи в разбор не идут.',
    )
  }

  /* Находки собираются по правилам: чинят их пачками, а не по одной. */
  const byCode = new Map<CheckCode, Issue[]>()
  for (const i of issues) {
    byCode.set(i.code, [...(byCode.get(i.code) ?? []), i])
  }

  const groups: Group[] = [...byCode.entries()]
    .map(([code, list]) => {
      const spec = checkSpec(code)
      return {
        code,
        label: spec?.label ?? code,
        why: spec?.why ?? '',
        severity: (list[0]?.severity ?? 'note') as 'fix' | 'note',
        issues: list,
      }
    })
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'fix' ? -1 : 1
      return b.issues.length - a.issues.length
    })

  const fixCount = issues.filter((i) => i.severity === 'fix').length
  const noteCount = issues.length - fixCount
  const touched = new Set(issues.map((i) => i.animalId)).size

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="events" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'События', href: '/account?tab=events' },
              { label: 'Проверка моего стада' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Проверка моего стада
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Те же правила, по которым Ассоциация разбирает заявки, — прогнаны сейчас
            по вашим неподтверждённым записям. Что это за правила и почему они такие,
            написано в{' '}
            <Link href="/account/checks" className="underline underline-offset-4">
              списке проверок
            </Link>
            .
          </p>

          {animals.length === 0 ? (
            <div className="card mt-8">
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Проверять нечего: неподтверждённых записей в стаде нет.
              </p>
            </div>
          ) : (
            <>
              <section className="mt-8">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="card">
                    <p className="text-[13px] text-ink-500">Проверено записей</p>
                    <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                      {animals.length}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-[13px] text-ink-500">Требуют исправления</p>
                    <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                      {fixCount}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-[13px] text-ink-500">На усмотрение</p>
                    <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                      {noteCount}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-[13px] text-ink-500">Записей с замечаниями</p>
                    <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                      {touched}
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

              {groups.length === 0 ? (
                <div className="card mt-8">
                  <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                    Замечаний не найдено. Это не значит, что данные заведомо верны:
                    машина проверяет согласованность, а не соответствие документам —
                    сверку с бумагами делает эксперт Ассоциации.
                  </p>
                  <Link href="/account/verification" className="btn btn-accent mt-5">
                    Подать на верификацию
                  </Link>
                </div>
              ) : (
                <>
                  <section className="mt-10 space-y-4">
                    {groups.map((g) => {
                      const shown = g.issues.slice(0, SHOWN_PER_GROUP)
                      const rest = g.issues.length - shown.length

                      return (
                        <div key={g.code} className="card">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                            <h2 className="text-[17px] font-medium">{g.label}</h2>
                            <div className="flex flex-none items-baseline gap-3">
                              <span className="text-[14px] tabular-nums text-ink-500">
                                {g.issues.length}
                              </span>
                              <span
                                className={`rounded px-2 py-0.5 text-[12px] ${SEVERITY_TONE[g.severity]}`}
                              >
                                {g.severity === 'fix' ? 'Требует исправления' : 'На усмотрение'}
                              </span>
                            </div>
                          </div>

                          {g.why && (
                            <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                              {g.why}
                            </p>
                          )}

                          <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4">
                            {shown.map((i) => (
                              <li
                                key={`${i.code}-${i.animalId}-${i.text}`}
                                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]"
                              >
                                <Link
                                  href={`/animals/${i.animalId}`}
                                  className="w-[150px] flex-none tabular-nums underline underline-offset-4"
                                >
                                  {i.ident}
                                </Link>
                                <span className="min-w-0 text-ink-700">{i.text}</span>
                              </li>
                            ))}
                          </ul>

                          {rest > 0 && (
                            <p className="mt-3 text-[13px] text-ink-500">
                              и ещё {rest} — показаны первые {SHOWN_PER_GROUP}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </section>

                  <div className="card mt-8">
                    <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                      Замечания <span className="font-medium">«на усмотрение»</span> подавать
                      не мешают. Записи с пометкой{' '}
                      <span className="font-medium">«требует исправления»</span> эксперт
                      подтверждать не станет — их стоит починить до подачи, иначе заявку
                      придётся подавать второй раз.
                    </p>
                    <Link href="/account/verification" className="btn btn-accent mt-5">
                      Подать на верификацию
                    </Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
