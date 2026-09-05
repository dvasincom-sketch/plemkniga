import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { afcStats } from '@/lib/afc-stats'
import { AFC_REFERENCE_META, referenceShare } from '@/lib/afc-reference'
import { SITE_URL } from '@/lib/hosts'

export const metadata: Metadata = { title: 'Возраст первого отёла' }
export const dynamic = 'force-dynamic'

/**
 * Возраст первого отёла по стаду хозяйства.
 *
 * ## Что эта страница делает и чего не делает
 *
 * Она показывает хозяйству его собственные данные в разрезе, в котором оно
 * их никогда не видело, — и не советует возраст. Разница принципиальная.
 *
 * Литературы по теме много, и она расходится: британские и американские
 * работы называют оптимумом 22–25 месяцев, часть российских — 26–28.
 * Расхождение объясняется не породой и не климатом, а интенсивностью
 * выращивания: при 360 кг к пятнадцати месяцам ранний отёл приходится
 * на недоразвитую тёлку, и поздний действительно оказывается лучше.
 * Разбор с источниками — `docs/vozrast-pervogo-otela.md`.
 *
 * Живой массы тёлок в модели нет вовсе. Значит назвать хозяйству целевой
 * возраст мы можем только вслепую — и половине хозяйств посоветуем
 * неверное. Поэтому здесь факт и связь, но не цель.
 *
 * ## Почему разрез по быкам стоит первым по значимости
 *
 * Возраст первого отёла — не только зоотехния. У CDCB под него есть
 * отдельная племенная оценка EFC (Early First Calving), то есть у признака
 * выделена наследуемая составляющая. Сгруппировать возраст отёла дочерей
 * по отцу может только тот, у кого есть и родословная, и отёлы, — и это
 * единственное на странице, чего не скажет система управления стадом.
 */

const pct = (v: number | null): string => (v === null ? '—' : `${v} %`)
const mo = (v: number | null): string => (v === null ? '—' : `${v}`)

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card">
      <p className="text-[13px] text-ink-500">{label}</p>
      <p className="mt-1 stat-value text-[28px] leading-none">{value}</p>
      {note && <p className="mt-2 text-[12px] leading-snug text-ink-500">{note}</p>}
    </div>
  )
}

export default async function AfcPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()
  const stats = orgId ? await afcStats(payload, orgId) : null

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="herd" />
        <HerdNav active="reports" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Стадо', href: '/account?tab=herd' },
              { label: 'Отчёты', href: '/account?tab=herd&sub=reports' },
              { label: 'Возраст первого отёла' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Возраст первого отёла
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Считается по тому, что вы уже внесли: дата рождения животного и дата отёла
            с номером&nbsp;1. Ничего вводить дополнительно не нужно. Возраст первого
            отёла связан с продуктивностью, здоровьем вымени и тем, доживёт ли корова
            до второй лактации, — и остаётся заметным годы спустя.
          </p>

          {!stats || stats.cows === 0 ? (
            <div className="card mt-8">
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Пока считать не по чему. Возраст первого отёла складывается из даты
                рождения животного и записи об отёле с номером&nbsp;1 — как только
                в стаде появятся коровы, у которых заполнено и то и другое, отчёт
                соберётся сам.
              </p>
              <Link href="/account?tab=herd" className="btn btn-accent mt-5">
                Перейти к стаду
              </Link>
            </div>
          ) : (
            <>
              {/* ------------------------------ Свод ------------------------------ */}
              <section className="mt-8">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Stat
                    label="Коров с известным возрастом"
                    value={String(stats.cows)}
                    note="Учтены только записи, где заполнены и дата рождения, и первый отёл"
                  />
                  <Stat
                    label="Средний возраст, мес."
                    value={mo(stats.meanAfc)}
                    note={`В наборе Истхэма ${AFC_REFERENCE_META.meanAfc}`}
                  />
                  <Stat
                    label="Медиана, мес."
                    value={mo(stats.medianAfc)}
                    note={`В наборе Истхэма ${AFC_REFERENCE_META.medianAfc}`}
                  />
                  <Stat
                    label="Отелились до 24 мес."
                    value={pct(stats.shareEarly)}
                    /*
                       «30 месяцев и старше», а не «старше 30»: доля
                       считается от тридцати включительно, и то же самое
                       написано в наборе Истхэма, с которым она сравнивается.
                       Полоса «старше 30 мес.» рядом начинается с тридцать
                       первого — это другое число, и подпись их путала.
                    */
                    note={`30 месяцев и старше — ${pct(stats.shareLate)}. В наборе Истхэма 12,2 % и 40,9 %`}
                  />
                </div>
              </section>

              {/* ---------------------------- По группам --------------------------- */}
              <section className="mt-10">
                <h2 className="section-title mb-6">Что было дальше</h2>

                <div className="card overflow-x-auto">
                  <table className="metric-table min-w-[620px]">
                    <thead>
                      <tr>
                        <th>Возраст первого отёла</th>
                        <th className="text-right">Коров</th>
                        <th className="text-right">Доля</th>
                        {/*
                           Колонка названа набором, а не страной.

                           «В Великобритании» обещало сравнение с целой
                           популяцией — а это одно исследование: 396 471
                           корова 2006–2008 годов, средние сырые,
                           не скорректированные на хозяйство, сезон
                           и быка. Имя набора не даёт спутать выборку
                           со страной и заодно не тянет за собой вопрос
                           «а почему мы сравниваемся именно с ней».
                        */}
                        <th className="text-right">В наборе Истхэма</th>
                        <th className="text-right">Дожили до 2-го отёла</th>
                        <th className="text-right">Межотельный, дней</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.bands.map((b) => (
                        <tr key={b.key}>
                          <td>{b.label}</td>
                          <td className="text-right tabular-nums">{b.cows}</td>
                          <td className="text-right tabular-nums">{b.share} %</td>
                          <td className="text-right tabular-nums text-ink-500">
                            {pct(referenceShare(b.key))}
                          </td>
                          <td className="text-right tabular-nums">{pct(b.survived2)}</td>
                          <td className="text-right tabular-nums">{mo(b.interval)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                  Колонка «В наборе Истхэма» — распределение 396 471 коровы
                  (2006–2008, {AFC_REFERENCE_META.herds} хозяйств, лицензия CC0),
                  посчитанное нами по исходным данным. Это распределение, а не норматив:
                  оно говорит, как телились там, а не как надо телить здесь. Исходы
                  в соседних колонках — ваши собственные; исходы набора сюда не вынесены
                  намеренно, потому что они смешаны с качеством хозяйств и читались бы
                  как обещание.{' '}
                  Это ваши коровы, а не средние по породе. Группы шире, чем помесячная
                  кривая в исследованиях, намеренно: там сотни тысяч животных и в каждом
                  месяце тысячи, здесь — сотни, и помесячная разбивка показывала бы шум
                  вместо разницы. «Дожили до 2-го отёла» считается по факту наличия
                  второго отёла в системе: у коров, отелившихся недавно, второго ещё
                  не было, и доля по свежим группам занижена.{' '}
                  {/*
                     Ссылка на разбор стоит под таблицей, а не в шапке отчёта:
                     сомнение в справочной колонке возникает после того,
                     как человек сравнил себя с ней, а не до.
                  */}
                  <a
                    href={`${SITE_URL}/ru/razbory/nabor-isthema`}
                    className="underline underline-offset-4 hover:text-forest-500"
                  >
                    Разбор набора: откуда он, что сошлось с публикацией и что нет
                  </a>
                  .
                </p>
              </section>

              {/* ----------------------------- По быкам ---------------------------- */}
              <section className="mt-10">
                <h2 className="section-title mb-6">Дочери каких быков телятся раньше</h2>

                {stats.sires.length === 0 ? (
                  <div className="card">
                    <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                      Ни у одного быка в стаде пока нет трёх дочерей с известным возрастом
                      первого отёла. По одной-двум дочерям среднее показывать нельзя:
                      оно скачет от одного животного и сравнивать по нему быков — значит
                      сравнивать случайности.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="card overflow-x-auto">
                      <table className="metric-table min-w-[720px]">
                        <thead>
                          <tr>
                            <th>Бык</th>
                            <th className="text-right">Дочерей</th>
                            <th className="text-right">Средний возраст</th>
                            <th className="text-right">Медиана</th>
                            <th className="text-right">Разброс</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.sires.map((s) => (
                            <tr key={s.sireId}>
                              <td>
                                <Link
                                  href={`/animals/${s.sireId}`}
                                  className="underline underline-offset-4"
                                >
                                  {s.name || s.identNumber}
                                </Link>
                                {s.name && (
                                  <span className="ml-2 text-[13px] text-ink-500 tabular-nums">
                                    {s.identNumber}
                                  </span>
                                )}
                              </td>
                              <td className="text-right tabular-nums">{s.daughters}</td>
                              <td className="text-right tabular-nums">{s.meanAfc}</td>
                              <td className="text-right tabular-nums">{s.medianAfc}</td>
                              <td className="text-right tabular-nums text-ink-500">
                                {s.minAfc}–{s.maxAfc}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                      Показаны быки, у которых в вашем стаде не меньше трёх дочерей
                      с известным возрастом первого отёла.
                      {stats.siresHidden > 0 && (
                        <>
                          {' '}
                          Ещё {stats.siresHidden}{' '}
                          {stats.siresHidden % 10 === 1 && stats.siresHidden % 100 !== 11
                            ? 'бык не попал'
                            : 'быков не попало'}{' '}
                          в таблицу: дочерей меньше трёх.
                        </>
                      )}{' '}
                      Считается только по вашему стаду. Смешивать с дочерьми того же быка
                      в других хозяйствах нельзя: у них другое выращивание, и среднее
                      по несопоставимым условиям не сравнивает быков, а сравнивает
                      хозяйства.
                    </p>
                  </>
                )}
              </section>

              {/* ------------------------- Чего мы не знаем ------------------------ */}
              <section className="mt-10">
                <div className="card">
                  <h2 className="panel-heading">Почему здесь нет рекомендации</h2>
                  <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                    Оптимальный возраст первого отёла зависит не от возраста, а от живой
                    массы: британские и американские работы называют 22–25 месяцев,
                    часть российских — 26–28, и расходятся они не по породе, а по тому,
                    как выращены тёлки. При 360 кг к пятнадцати месяцам ранний отёл
                    приходится на недоразвитое животное, и поздний оказывается лучше —
                    но это компенсация низких приростов, а не цель.
                  </p>
                  <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                    Живой массы тёлок система пока не хранит. Пока её нет, назвать
                    целевой возраст значило бы назвать его наугад, поэтому здесь только
                    факт и связь.
                  </p>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
