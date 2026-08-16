import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ImportCard } from '@/components/ImportCard'
import { ExportCard } from '@/components/ExportCard'
import { IntegrationChannels } from '@/components/IntegrationChannels'
import { getCurrentUser } from '@/lib/payload'

export const metadata: Metadata = { title: 'Загрузка данных' }
export const dynamic = 'force-dynamic'

/**
 * Загрузка и выгрузка данных стада — отдельная страница.
 *
 * На «Моих животных» эти действия соседствовали с поиском и спорили с ним
 * за внимание: одна страница отвечала сразу на два вопроса — «что у меня есть»
 * и «как добавить новое». Теперь каждый сценарий занимает своё место.
 */
export default async function ImportPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="animals" />

        <div>
          <div className="min-w-0">
            <Breadcrumbs
              items={[
                { label: 'Личный кабинет', href: '/account' },
                { label: 'Мои животные', href: '/account?tab=animals' },
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
              Записи из файла попадают в ваше стадо сразу — с уровнем достоверности «Черновик».
              Одновременно заводится пакет данных: он уходит на проверку к сотрудникам
              Ассоциации, и его состояние видно в разделе{' '}
              <Link href="/account?tab=events" className="underline underline-offset-4">
                «События»
              </Link>
              . Когда проверка завершится и вы согласитесь с результатом, записи этого пакета
              получат уровень «Верифицировано ассоциацией». Остального стада проверка не касается.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ImportCard />
              <ExportCard />
            </div>

            <IntegrationChannels />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
