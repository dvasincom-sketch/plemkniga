import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { CabinetPage } from '@/components/CabinetPage'
import { InfoTip } from '@/components/InfoTip'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { nf } from '@/lib/format'
import {
  CULL_REASONS,
  DIM_OPEN,
  SERVICES_MAX,
  cullList,
  type CullReason,
} from '@/lib/cull-list'

export const metadata: Metadata = { title: 'Кандидаты на выбраковку' }
export const dynamic = 'force-dynamic'

/**
 * Кандидаты на выбраковку одной таблицей.
 *
 * ## Почему поводы, а не рейтинг
 *
 * Разбор — в `cull-list.ts`. Коротко: веса единого рейтинга пришлось бы
 * выдумать, а страница обязана показывать, из чего решать, а не решать
 * за зоотехника.
 *
 * ## Почему список нельзя пересортировать
 *
 * Порядок задан смыслом: сперва число претензий, потом племенная ценность
 * снизу. Дать здесь сортировку по удою значило бы предложить порядок,
 * в котором список перестаёт быть списком кандидатов и становится просто
 * стадом, отсортированным по колонке, — а это уже есть в «Списке».
 */

/**
 * Плашка претензии.
 *
 * `whitespace-nowrap` не косметика: «Не стельная» переносилась на две
 * строки, плашка становилась вдвое выше соседних, и ряд начинал прыгать.
 * Название претензии — это ярлык, а ярлык не переносят: он либо помещается,
 * либо его надо переименовать.
 */
const Chip = ({ reason }: { reason: CullReason }) => {
  const r = CULL_REASONS[reason]
  return (
    <span
      className="inline-block whitespace-nowrap rounded-md bg-[#fdecea] px-2 py-0.5 text-[12px] leading-snug text-[#8a2d22]"
      title={r.hint}
    >
      {r.label}
    </span>
  )
}

export default async function CullPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: выбраковка её не касается
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()
  const data = orgId ? await cullList(payload, orgId) : null

  return (
    <>
      <SiteHeader active="/account" />

      <CabinetPage
        nav={
          <>
            <AccountNav active="herd" />
            <HerdNav active="reports" />
          </>
        }
        crumbs={[
          { label: 'Личный кабинет', href: '/account' },
          { label: 'Стадо', href: '/account?tab=herd' },
          { label: 'Отчёты', href: '/account?tab=herd&sub=reports' },
          { label: 'Выбраковка' },
        ]}
        title="Кандидаты на выбраковку"
        intro={
          <>
            Список не решает за вас и не считает рейтинг: у каждой коровы перечислено,
            чем именно она сюда попала. Порядок — по числу претензий, а при равном числе
            выше стоит та, что хуже передаёт потомству: остальное поправимо кормлением
            и лечением, генетика нет.
          </>
        }
      >
        {!data || data.cows === 0 ? (
          <div className="card mt-8">
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Считать пока не по чему: в стаде нет живых коров. Список собирается сам,
              как только появятся отёлы, осеменения и контрольные дойки.
            </p>
            <Link href="/account?tab=herd" className="btn btn-accent mt-5">
              Перейти к стаду
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[15px] text-ink-700">
              Хотя бы одна претензия у{' '}
              <b className="tabular-nums">{nf(data.flagged, 0)}</b> коров из{' '}
              <span className="tabular-nums">{nf(data.cows, 0)}</span>
              {data.flagged > data.rows.length && (
                <> · показаны первые {nf(data.rows.length, 0)}</>
              )}
            </p>

            {/*
               Пороги названы над таблицей, а не спрятаны в подсказках.
               Список, который отбирает по неназванному правилу, читается
               как приговор; названное правило можно оспорить — и это
               единственный способ им пользоваться.
            */}
            <div className="card mt-6">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="panel-heading mb-0">По каким правилам отобрано</h2>
                <InfoTip label="Откуда взяты пороги">
                  <p className="mb-2 font-medium text-ink-900">Откуда пороги</p>
                  <p className="mb-2">
                    {DIM_OPEN} дней без стельности — к этому дню прошли и период
                    ожидания, и три-четыре половых цикла; межотельный период такой
                    коровы уже перевалит за 480 дней при норме 380–400. В североамериканской
                    практике это типовой повод к выбраковке.
                  </p>
                  <p className="mb-2">
                    Индекс осеменения 1,5–2 — обычное дело, три означает проблему.
                    {' '}{SERVICES_MAX} попытки — уже не невезение, а вопрос к самой корове.
                  </p>
                  <p>
                    Индекс и удой сравниваются внутри вашего стада, а не с абсолютной
                    планкой: «плохой удой» разный у хозяйства с семью тысячами
                    и у хозяйства с одиннадцатью. Удой — ещё и внутри своей группы
                    лактаций, иначе половина первотёлок попала бы в список за то,
                    что они первотёлки.
                  </p>
                </InfoTip>
              </div>

              {/*
                 Пояснения выровнены по левому краю в своей колонке,
                 а не начинаются сразу за плашкой.

                 Плашки разной длины, и текст, приклеенный к каждой,
                 начинался в пяти разных местах: глаз возвращается
                 к началу строки заново на каждой строке, и список
                 из пяти пунктов читается дольше таблицы из двадцати.
                 Столбец фиксированной ширины стоит того — это тот же
                 приём, что в любой таблице: колонка задаёт край,
                 а не содержимое ячейки.
              */}
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[14px] leading-snug text-ink-700 sm:grid-cols-2">
                {(Object.keys(CULL_REASONS) as CullReason[]).map((k) => (
                  <li key={k} className="grid grid-cols-[10rem_1fr] items-baseline gap-3">
                    <span>
                      <Chip reason={k} />
                    </span>
                    <span className="text-ink-500">{CULL_REASONS[k].hint}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                Отдельно, серым, стоит пометка <b>«Не осеменялась»</b>: после отёла
                прошло больше {DIM_OPEN} дней, а записей об осеменении нет ни одной.
                В счёт претензий она не идёт и сама по себе в список не приводит —
                это вопрос не к корове, а к записям: её либо не осеменяли, либо
                осеменяли и не записали, и различить одно от другого книга не может.
              </p>
            </div>

            <div className="card mt-6">
              <div className="overflow-x-auto">
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>Инд.№</th>
                      <th>Кличка</th>
                      <th className="text-right">Лакт.</th>
                      <th className="text-right">Дней после отёла</th>
                      <th className="text-right">Осем.</th>
                      <th className="text-right">ССК</th>
                      <th className="text-right">Удой 305</th>
                      <th className="text-right">ИПЦ</th>
                      <th>Претензии</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-ink-500">
                          Ни одна корова не набрала претензий. Это хорошая новость,
                          но проверьте, заполнены ли осеменения и контрольные дойки:
                          по пустым полям претензий не бывает.
                        </td>
                      </tr>
                    )}

                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link
                            href={`/animals/${r.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {r.identNumber}
                          </Link>
                        </td>
                        <td className="font-medium">{r.name || '—'}</td>
                        <td className="text-right tabular-nums">{r.lactation}</td>
                        {/*
                           Число всегда у правого края, подпись — слева от него.

                           Стояло наоборот, и «стельная» отодвигала число
                           влево: колонка переставала быть колонкой,
                           а сравнить дни у соседних строк можно было
                           только по одной. Число в числовой колонке
                           держит край, что бы рядом ни стояло.

                           Сама подпись нужна: 250 дней после отёла
                           у стельной коровы — норма, у нестельной — повод.
                        */}
                        <td className="text-right tabular-nums">
                          <span className="inline-flex items-baseline justify-end gap-2">
                            {r.pregnant && (
                              <span className="text-[12px] text-forest-600">стельная</span>
                            )}
                            <span>{r.dim === null ? '—' : nf(r.dim, 0)}</span>
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{r.services}</td>
                        <td className="text-right tabular-nums">
                          {r.scc === null ? '—' : nf(r.scc, 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {r.milk305 === null ? '—' : nf(r.milk305, 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {r.ipc === null ? '—' : nf(r.ipc, 0)}
                        </td>
                        <td>
                          <span className="flex flex-wrap gap-1">
                            {r.reasons.map((x) => (
                              <Chip key={x} reason={x} />
                            ))}
                            {/*
                               Серым, а не красным, и без счёта: это
                               не претензия к корове, а вопрос к записям.
                               «Осеменяли четыре раза без результата» —
                               про корову; «записей нет» — про то, что
                               их не вели.
                            */}
                            {r.notBred && (
                              <span
                                className="inline-block rounded-md bg-canvas px-2 py-0.5 text-[12px] leading-snug text-ink-500"
                                title="После отёла нет ни одной записи об осеменении: либо не осеменяли, либо не записали. В счёт претензий не идёт"
                              >
                                Не осеменялась
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/*
                 Пробел в данных не равен благополучию — и об этом надо
                 сказать прямо. Корова без единой контрольной дойки
                 не получит претензии «соматика» никогда, и список
                 покажет её чистой.
              */}
              <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                Прочерк в колонке — не «хорошо», а «не измерено»: претензии по этому
                показателю у такой коровы не будет никогда. Соматика берётся из
                контрольных доек, удой за 305 дней — из законченных лактаций,
                стельность — из результата осеменения. Чем полнее эти три,
                тем меньше в списке случайных.
              </p>
            </div>

            <p className="mt-5 text-[14px]">
              <Link
                href="/account?tab=herd&sub=reports"
                className="underline underline-offset-4 hover:text-forest-500"
              >
                Вернуться к отчётам
              </Link>
            </p>
          </>
        )}
      </CabinetPage>

      <SiteFooter />
    </>
  )
}
