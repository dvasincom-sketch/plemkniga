import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociation } from '@/access'
import { CHECK_GROUPS } from '@/lib/checks-registry'
import { resolveCheckSettings } from '@/lib/check-settings'
import {
  resolveThresholds,
  thresholdValue,
  thresholdsOfCheck,
} from '@/lib/check-thresholds'

export const metadata: Metadata = { title: 'Что проверяется автоматически' }
export const dynamic = 'force-dynamic'

/**
 * Каталог автоматических проверок — открытый список правил.
 *
 * ## Зачем показывать хозяйству правила проверки
 *
 * Затем же, зачем экзаменатор объявляет программу заранее. Хозяйство,
 * которое знает, что сверяется кровность потомка с родительской, чинит
 * кровность до подачи; хозяйство, которое не знает, узнаёт об этом
 * из замечания через две недели и подаёт заявку заново. Вторая дорога
 * стоит времени обеим сторонам, и дороже она Ассоциации: эксперт
 * разбирает одну и ту же заявку дважды.
 *
 * Отсюда и место: раздел «События», рядом с подачей на верификацию,
 * а не в настройках. Это не параметр, это справка — и читают её именно
 * тогда, когда собираются подавать.
 *
 * ## Почему здесь нет выключателей
 *
 * Соблазн понятный: сделать список настраиваемым, чтобы хозяйство гасило
 * ненужное. Так нельзя, и причина не в недоверии.
 *
 * Проверка — часть процедуры, которой Ассоциация подтверждает записи.
 * Если проверяемый может её отключить, подтверждение перестаёт что-либо
 * значить: оно означало бы «прошло те проверки, которые хозяйство
 * согласилось пройти». Это ровно та ошибка, которую мы уже чинили
 * в правах на заявку (решение №45): подавать может хозяйство, решать —
 * только Ассоциация.
 *
 * Настраивать пороги и существенность нужно — но в кабинете Ассоциации
 * и на всю книгу сразу. Порог, свой у каждого хозяйства, ломает главное
 * свойство книги: сравнимость записей между хозяйствами.
 *
 * Чего хозяйству действительно не хватает — не выключателя, а прогона
 * проверок по своему стаду до подачи. Это отдельная задача.
 */

const SEVERITY = {
  fix: {
    label: 'Требует исправления',
    tone: 'bg-[#fdecea] text-[#8c2f27]',
  },
  note: {
    label: 'На усмотрение',
    tone: 'bg-canvas text-ink-700',
  },
} as const

export default async function ChecksPage() {
  // Каталог — справка без единой цифры из чьих-либо данных, поэтому
  // открыт и хозяйству, и сотруднику Ассоциации. Закрыт только от гостей.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  /*
   * Показываются действующие правила, а не заложенные в код. Разница
   * существенна ровно тогда, когда Ассоциация что-то изменила: каталог,
   * показывающий умолчания при изменённой настройке, вводит в заблуждение
   * именно в том случае, ради которого его читают.
   */
  const payload = await getClient()
  const [settings, thresholds] = await Promise.all([
    resolveCheckSettings(payload),
    resolveThresholds(payload),
  ])

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="data" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Данные', href: '/account?tab=data' },
              { label: 'Что проверяется автоматически' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Что проверяется автоматически
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Когда вы подаёте записи на верификацию, система прогоняет по ним правила
            из этого списка и показывает эксперту, куда посмотреть. Список открытый
            намеренно: проще починить данные до подачи, чем узнать о том же
            из замечания через две недели.
          </p>

          {/*
             Кнопка прогона стоит рядом с объяснением, а не в конце страницы.
             Каталог читают целиком один раз, а возвращаются сюда ради
             прогона — и заставлять ради него пролистывать двадцать шесть
             правил значит прятать главное действие за справкой.

             Сотруднику Ассоциации кнопка не показывается: разбор чужого
             стада у него свой, а этот прогон идёт по своим записям,
             которых у него нет.
          */}
          {!isAssociation(user) && (
            <div className="card mt-6">
              <h2 className="panel-heading">Прогнать эти правила по своему стаду</h2>
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Те же проверки можно запустить самому и починить данные до подачи —
                тогда заявку не придётся подавать второй раз.
              </p>
              <Link href="/account/checks/herd" className="btn btn-accent mt-5">
                Проверить моё стадо
              </Link>
            </div>
          )}

          <div className="card mt-6">
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              <span className="font-medium">Проверки не выносят решения.</span> Они говорят
              «посмотрите сюда», а решение принимает эксперт Ассоциации — и вправе
              счесть находку несущественной. Правило написано программистом, а не
              зоотехником, и жизнь богаче правила.
            </p>
            <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Замечание <span className="font-medium">«требует исправления»</span> оставляет
              запись на прежнем уровне достоверности: подтверждение получат остальные
              животные заявки. Замечание{' '}
              <span className="font-medium">«на усмотрение»</span> подтверждению не мешает —
              это повод уточнить данные, а не препятствие.
            </p>
          </div>

          {/*
             Отступ между группами задан и внешним промежутком, и внутренним
             отступом секции. Второе кажется лишним, но margin заголовка
             схлопывается с margin секции, а padding — нет: без него величина
             промежутка зависит от того, что задано в `.section-title`,
             а не от того, что написано здесь.
          */}
          <div className="mt-10 space-y-14">
            {CHECK_GROUPS.map((group) => {
              /* Выключенные Ассоциацией в каталог не идут: список должен
                 отвечать на вопрос «что проверяется», а не «что могло бы». */
              const checks = [...settings.values()].filter(
                (c) => c.group === group.key && c.enabled,
              )
              if (!checks.length) return null

              return (
                <section key={group.key} className="pt-2">
                  <h2 className="section-title mb-2">{group.label}</h2>
                  <p className="mb-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                    {group.intro}
                  </p>

                  <div className="space-y-3">
                    {checks.map((c) => {
                      const sev = SEVERITY[c.severity]
                      return (
                        <div key={c.code} className="card">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                            <h3 className="text-[17px] font-medium">{c.label}</h3>
                            <span
                              className={`flex-none rounded px-2 py-0.5 text-[12px] ${sev.tone}`}
                            >
                              {sev.label}
                            </span>
                          </div>

                          <p className="mt-2 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                            {c.what}
                          </p>
                          <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                            {c.why}
                          </p>

                          {/*
                             Границы показываются действующие, а не описанные
                             словами в реестре. Раньше здесь стояла строка,
                             написанная руками: «удой вне 500…25 000 кг».
                             Пока числа менять было нельзя, она не могла
                             разойтись с кодом. Теперь может — и первым,
                             кто прочтёт устаревшую границу, будет хозяйство,
                             пришедшее сюда починить данные до подачи.
                          */}
                          {(() => {
                            const knobs = thresholdsOfCheck(c.code)
                            if (!knobs.length) {
                              return c.threshold ? (
                                <p className="mt-3 text-[13px] text-ink-500">
                                  <span className="text-ink-700">Граница:</span> {c.threshold}
                                </p>
                              ) : null
                            }
                            return (
                              <dl className="mt-3 space-y-1 text-[13px] text-ink-500">
                                {knobs.map((k) => (
                                  <div key={k.key} className="flex flex-wrap gap-x-2">
                                    <dt className="text-ink-700">{k.label}:</dt>
                                    <dd className="tabular-nums">
                                      {thresholdValue(k, thresholds[k.key as keyof typeof thresholds])}
                                      {thresholds[k.key as keyof typeof thresholds] !== k.default && (
                                        <span className="ml-2">
                                          (заложено {thresholdValue(k, k.default)})
                                        </span>
                                      )}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )
                          })()}

                          {/* Правку Ассоциации видно вместе с причиной: правило,
                              изменённое молча, читается как ошибка в коде. */}
                          {c.overridden && (
                            <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                              <span className="text-ink-700">Изменено Ассоциацией.</span>{' '}
                              {c.note ?? 'Причина не указана.'}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="card mt-10">
            <h2 className="panel-heading">Почему этот список нельзя настроить под себя</h2>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Проверка — часть процедуры, которой Ассоциация подтверждает записи.
              Если проверяемый может её отключить, подтверждение перестаёт что-либо
              значить: оно означало бы «прошло те проверки, которые хозяйство
              согласилось пройти».
            </p>
            <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Пороги и существенность настраиваются — но Ассоциацией и сразу на всю
              книгу. Своя граница у каждого хозяйства сломала бы главное свойство
              книги: сравнимость записей между хозяйствами. Если какое-то правило
              кажется вам неверным по существу, напишите в Ассоциацию: менять его
              надо для всех или ни для кого.
            </p>
            <Link href="/account/verification" className="btn btn-accent mt-5">
              Подать записи на верификацию
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
