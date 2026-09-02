import { currentTenant } from '@/lib/tenant-server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { DataNav } from '@/components/DataNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ImportCard } from '@/components/ImportCard'
import { ExportCard } from '@/components/ExportCard'
import { FgiasExportCard } from '@/components/FgiasExportCard'
import { IntegrationChannels } from '@/components/IntegrationChannels'
import { ColumnReference } from '@/components/ColumnReference'
import { getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { DATASETS } from '@/lib/import-format'

export const metadata: Metadata = { title: 'Загрузка данных' }
export const dynamic = 'force-dynamic'

/**
 * Загрузка и выгрузка данных стада.
 *
 * ## Что здесь было не так
 *
 * Страница предлагала загрузить файл и не говорила, какой. Единственным
 * описанием формата была строка мелким шрифтом внутри свёрнутой карточки —
 * восемь колонок из двадцати с лишним, без указания, какая обязательна,
 * без единого примера значения и без файла, который можно скачать
 * и заполнить.
 *
 * Второе: принимались только животные. Отёлы, осеменения и дойки файлом
 * не грузились никогда — при том что именно их и приходит тысячами строк.
 *
 * ## Как устроено теперь
 *
 * Наборов четыре, вид данных выбирается в самой карточке загрузки, и там же
 * лежит шаблон — свой для каждого набора. Отдельной карточки «начните
 * с шаблона» наверху нет намеренно: она предлагала бы то же действие
 * второй раз, причём без выбора набора, то есть всегда для животных.
 *
 * Ниже — таблицы колонок по наборам, вкладками. Собираются из того же
 * реестра, по которому идёт разбор (`src/lib/import-format.ts`), поэтому
 * разойтись с действительностью не могут.
 */
export default async function ImportPage() {
  const { state } = await currentTenant()
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="data" />
        <DataNav active="write" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Данные', href: '/account?tab=data' },
              { label: 'Загрузка данных' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Загрузка и выгрузка данных
          </h1>

          {/*
             Текст описывает то, что система делает на самом деле.
             Прежняя редакция обещала, что данные появятся только после
             проверки, — животные при этом заводились сразу, и человек
             видел в стаде записи, которых по инструкции быть не должно.
             Проверка меняет не наличие данных, а доверие к ним.
          */}
          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Файлом загружаются животные, отёлы, осеменения и контрольные дойки — по одному
            набору за раз. Записи попадают в стадо сразу, с уровнем достоверности «Черновик»,
            и одновременно заводится пакет данных: он уходит на проверку к сотрудникам
            Ассоциации, и его состояние видно в разделе{' '}
            <Link href="/account?tab=data&sub=check" className="underline underline-offset-4">
              «Данные» → «Проверка»
            </Link>
            . Когда проверка завершится и вы согласитесь с результатом, записи этого пакета
            получат уровень «Верифицировано ассоциацией». Остального стада проверка не касается.
          </p>

          {/*
             `items-start` — от растянутых карточек.

             По умолчанию элемент сетки тянется на высоту своей строки.
             Пока в строке две короткие карточки, этого не видно; стоит
             раскрыть загрузку — и соседняя карточка выгрузки вытягивается
             вместе с ней, показывая под кнопкой пустое белое поле в пол-экрана.
             Со стороны это выглядит не как разметка, а как сломанный
             элемент, который «всплыл» непонятно откуда.

             Карточки здесь самостоятельны и ничего друг о друге не знают:
             ровнять их по высоте нечем и незачем.
          */}
          <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <ImportCard
              datasets={DATASETS.map((d) => ({ value: d.key, label: d.label, hint: d.hint }))}
            />
            <ExportCard />
            {/*
               Выгрузка во ФГИАС ПР — только у книги с государственной
               обязанностью отчитываться. Не «скрыта», а отсутствует:
               карточка с недоступной кнопкой обещает возможность, которой
               нет, и хозяйство будет искать, почему она не работает.
            */}
            {state === 'fgias' && <FgiasExportCard />}
          </div>

          {/* --------------------- Что понимает система --------------------- */}

          <section className="mt-14">
            <h2 className="section-title mb-2">Какие колонки принимаются</h2>
            <p className="mb-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              Порядок колонок любой, лишние не мешают — система назовёт их после загрузки,
              чтобы вы знали, что они не записались. Регистр заголовка не важен. Пустая
              ячейка означает «не менять», а не «стереть».
            </p>
            <p className="max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              Загрузка отёлов, осеменений и доек карточек животных не заводит: животное
              должно уже быть в стаде. Строка с чужим или неизвестным номером отклоняется —
              так событие не попадёт не на ту корову.
            </p>

            {/*
               Наборы разложены по вкладкам, а не идут подряд.
               Подряд они читались как подчинённые первому: сверху крупно
               «Животные», а под ним таблицы, подзаголовки и снова таблицы —
               и человек, доскроллив до отёлов, имел все основания думать,
               что читает колонки животных.

               Данные передаются как есть, из того же реестра, по которому
               идёт разбор файла. Разложить их по вкладкам на сервере
               нельзя: переключение вкладки не должно перерисовывать
               страницу — на ней лежит результат только что выполненной
               загрузки.
            */}
            <ColumnReference
              datasets={DATASETS.map((ds) => ({
                key: ds.key,
                label: ds.label,
                hint: ds.hint,
                groups: ds.groups.map((g) => ({
                  key: g.key,
                  label: g.label,
                  intro: g.intro,
                  columns: g.columns.map((c) => ({
                    key: c.key,
                    title: c.title,
                    aliases: c.aliases,
                    required: c.required,
                    what: c.what,
                    example: c.example,
                    note: c.note,
                  })),
                })),
              }))}
            />
          </section>

          {/* --------------------------- Когда по одному -------------------- */}

          <section className="mt-14">
            <div className="card">
              <h2 className="panel-heading">Когда файла не нужно</h2>
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Ради пяти отёлов файл собирать незачем. Отдельные события вводятся по одному
                на странице{' '}
                <Link href="/account/events/new" className="underline underline-offset-4">
                  «Записать событие»
                </Link>
                : номера отёла и лактации там проставляются сами, а после записи форма
                остаётся открытой — пять подряд вводятся подряд. Одиночное животное так же
                заводится{' '}
                <Link href="/account/animals/new" className="underline underline-offset-4">
                  вручную
                </Link>
                , и у телёнка своей коровы родители там выбираются из стада, а не
                переписываются номерами.
              </p>
            </div>
          </section>

          <IntegrationChannels />
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
