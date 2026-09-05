import type { Metadata } from 'next'
import type { Where } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { DataNav } from '@/components/DataNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { checkAnimals, type Issue } from '@/lib/data-checks'
import { herdIssues } from '@/lib/checks-herd'
import { checkSpec, type AnimalCheckCode } from '@/lib/checks-registry'
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
 * ## Почему разбор идёт по всему стаду, включая подтверждённое
 *
 * Раньше подтверждённые записи в разбор не шли: их «уже смотрел эксперт».
 * Рассуждение выглядело разумным и оказалось неверным, а обошлось дорого.
 * Полоса дел в кабинете считала по всему стаду и писала «2 записи
 * неполны»; разбор считал по неподтверждённым и отвечал «замечаний
 * не найдено». Два механизма смотрели на одно стадо и говорили
 * противоположное — а хозяйство верит тому, что увидело последним,
 * и ошибается в любом случае.
 *
 * Причина, по которой подтверждённую запись всё-таки надо проверять,
 * та же, что у списка «подтверждено, но есть замечания» в кабинете
 * Ассоциации: подпись стоит на данных, которые с тех пор могли измениться.
 * Запись перезаписывает загрузка файлом, правила добавляются после
 * подтверждения, пороги меняются. Знак Ассоциации — утверждение о прошлом,
 * а противоречие живёт в настоящем.
 *
 * Поэтому разбор идёт по всему стаду, а находки на подтверждённых записях
 * помечены отдельно: чинить их хозяйство не может молча — знак придётся
 * подтверждать заново.
 *
 * Потолок остаётся: проверки ходят в базу за родителями, отёлами
 * и родословной, и полный прогон трёхтысячного стада занял бы минуты.
 * Сколько осталось за потолком, страница говорит прямо: «замечаний
 * не найдено» и «замечаний не искали» не должны выглядеть одинаково.
 *
 * ## Два разбора на одной странице
 *
 * Проверки по стаду идут **по всему стаду**, включая подтверждённые
 * записи и без всякого потолка. Это не непоследовательность: они считают
 * доли — сколько записей из скольких, — а доля по выборке в пятьсот
 * из трёх тысяч называлась бы долей по стаду и врала бы. Стоят они при
 * этом шесть агрегатов, а не обход родословных, и потолка не требуют.
 *
 * Показаны они первыми, и это тоже решение. Смешанные единицы измерения
 * порождают полсотни находок «удой неправдоподобен» ниже по странице;
 * прочитав сначала причину, хозяйство чинит одно место вместо пятидесяти.
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
  code: AnimalCheckCode
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
   * Всё стадо, включая подтверждённое. Сортировка по номеру, а не по дате
   * правки, — чтобы повторный прогон брал те же записи и хозяйство видело,
   * что починенное ушло из списка, а не что список перетасовался.
   */
  const where: Where = {
    and: [{ owner: { equals: orgId } }, { archived: { not_equals: true } }],
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

  /*
   * Два разбора идут разом: они друг о друге не знают и ждать друг друга
   * не должны. Проверки по стаду — шесть агрегатов, проверки по записям —
   * обход родословных; последовательный запуск сложил бы их время
   * без всякой на то причины.
   */
  const [perAnimal, herd] = await Promise.all([
    animals.length
      ? checkAnimals(payload, animals)
      : Promise.resolve({ issues: [] as Issue[], limits: [] as string[] }),
    herdIssues(payload, orgId),
  ])

  const { issues } = perAnimal
  const limits = [...perAnimal.limits, ...herd.limits]

  if (found.totalDocs > SCAN_LIMIT) {
    limits.unshift(
      `Проверено ${SCAN_LIMIT} записей из ${found.totalDocs}. ` +
        'Исправьте найденное — и следующий прогон возьмёт следующие.',
    )
  }

  /* Находки собираются по правилам: чинят их пачками, а не по одной. */
  const byCode = new Map<AnimalCheckCode, Issue[]>()
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

  /*
   * Находки на записях со знаком Ассоциации считаются отдельно.
   *
   * Разница не в тяжести замечания, а в том, что с ним делать. Замечание
   * на черновике хозяйство чинит и подаёт. Замечание на подтверждённой
   * записи означает, что подпись Ассоциации стоит на данных, которые
   * с тех пор разошлись сами с собой, — и починка потребует подтверждать
   * заново. Смешать их в одном счётчике значило бы предложить чинить
   * второе так же, как первое.
   */
  const verifiedIds = new Set(
    animals.filter((a) => (a.trustLevel ?? 0) >= 3).map((a) => a.id as number),
  )
  const verifiedTouched = new Set(
    issues.filter((i) => verifiedIds.has(i.animalId)).map((i) => i.animalId),
  ).size

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="data" />
        <DataNav active="check" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Данные', href: '/account?tab=data' },
              { label: 'Проверка моего стада' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Проверка моего стада
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Те же правила, по которым Ассоциация разбирает заявки, — прогнаны сейчас
            по всем вашим записям. Что это за правила и почему они такие,
            написано в{' '}
            <Link href="/account/checks" className="underline underline-offset-4">
              списке проверок
            </Link>
            .
          </p>

          {/*
             Находки по стаду — выше находок по записям, и это не вопрос
             важности. Смешанные единицы измерения порождают внизу полсотни
             замечаний «удой неправдоподобен»; прочитав сначала причину,
             хозяйство чинит одно место вместо пятидесяти.
          */}
          {herd.issues.length > 0 && (
            <section className="mt-8">
              <h2 className="section-title mb-2">Сопоставимость данных по стаду</h2>
              <p className="mb-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                Здесь каждая запись по отдельности в порядке. Не в порядке то, что вместе
                они получены по-разному, и сравнивать их между собой нельзя. Считалось
                по всему стаду — {herd.scanned.toLocaleString('ru-RU')} записей, — а не
                по выборке ниже.
              </p>

              <div className="space-y-4">
                {herd.issues.map((h) => {
                  const spec = checkSpec(h.code)
                  return (
                    <div key={h.code + h.text} className="card">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                        <h3 className="text-[17px] font-medium">{spec?.label ?? h.code}</h3>
                        <span
                          className={`flex-none rounded px-2 py-0.5 text-[12px] ${SEVERITY_TONE[h.severity]}`}
                        >
                          {h.severity === 'fix' ? 'Требует исправления' : 'На усмотрение'}
                        </span>
                      </div>

                      <p className="mt-2 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                        {h.text}
                      </p>

                      {spec?.why && (
                        <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                          {spec.why}
                        </p>
                      )}

                      {!!h.examples?.length && (
                        <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-[14px]">
                          {h.examples.map((e) => (
                            <li key={e.label} className="text-ink-700">
                              {e.animalId ? (
                                <Link
                                  href={`/animals/${e.animalId}`}
                                  className="tabular-nums underline underline-offset-4"
                                >
                                  {e.label}
                                </Link>
                              ) : (
                                e.label
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {animals.length === 0 ? (
            <div className="card mt-8">
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Проверять нечего: записей в стаде нет.
                {herd.issues.length > 0 &&
                  ' Замечания по стаду выше относятся ко всем записям сразу, включая уже подтверждённые.'}
              </p>
            </div>
          ) : (
            <>
              <section className="mt-8">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {/*
                     «Проверено 17», когда в хозяйстве 31 животное, читается
                     как «часть стада потерялась». Знаменатель обязателен:
                     он отвечает на вопрос раньше, чем тот успевает
                     возникнуть.
                  */}
                  <div className="card">
                    <p className="text-[13px] text-ink-500">Проверено записей</p>
                    <p className="mt-1 stat-value text-[28px] leading-none">
                      {animals.length}
                      {found.totalDocs > animals.length && (
                        <span className="text-[18px] text-ink-500"> из {found.totalDocs}</span>
                      )}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-[13px] text-ink-500">Требуют исправления</p>
                    <p className="mt-1 stat-value text-[28px] leading-none">
                      {fixCount}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-[13px] text-ink-500">На усмотрение</p>
                    <p className="mt-1 stat-value text-[28px] leading-none">
                      {noteCount}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-[13px] text-ink-500">Записей с замечаниями</p>
                    <p className="mt-1 stat-value text-[28px] leading-none">
                      {touched}
                    </p>
                    {verifiedTouched > 0 && (
                      <p className="mt-1.5 text-[13px] leading-snug text-amber-700">
                        из них {verifiedTouched} со знаком Ассоциации — починка потребует
                        подтвердить запись заново
                      </p>
                    )}
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
                                {/*
                                   Пометка у записи со знаком Ассоциации.
                                   Без неё строка выглядит как обычный
                                   черновик, а починка тут дороже: подпись
                                   придётся получать заново.
                                */}
                                {verifiedIds.has(i.animalId) && (
                                  <span className="flex-none rounded bg-[#fdf3e3] px-2 py-0.5 text-[12px] text-amber-700">
                                    подтверждена
                                  </span>
                                )}
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
