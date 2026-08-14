import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { LoginForm } from '@/components/LoginForm'
import { getCurrentUser } from '@/lib/payload'

export const metadata: Metadata = { title: 'Вход' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/account')

  return (
    <>
      <SiteHeader />

      <main className="container-page">
        <section className="grid grid-cols-1 gap-8 rounded-card bg-brand-500 p-7 sm:p-10 lg:grid-cols-[1fr_1fr] lg:gap-12">
          <div className="text-white">
            <h1 className="text-[32px] font-medium leading-[1.12] sm:text-[42px]">
              Вход в информационную систему
            </h1>
            <p className="mt-6 max-w-[48ch] text-[15px] leading-[1.55] text-white/95">
              Авторизуйтесь, чтобы работать со своим стадом: загружать данные, отправлять события,
              формировать племенные свидетельства и видеть полные карточки животных.
            </p>

            <ul className="mt-9 space-y-3 border-t border-white/25 pt-7 text-[15px] leading-snug text-white/95">
              {[
                'Полные карточки животных своего стада',
                'Загрузка событий и документов на проверку',
                'История проверки каждого пакета данных',
                'Племенные свидетельства и выгрузки',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[20px] bg-white p-7 sm:p-10">
            <h2 className="mb-7 text-[30px] font-medium leading-none">Авторизация</h2>
            <LoginForm />

            <p className="mt-6 text-sm text-ink-700">
              Ещё нет учётной записи?{' '}
              <Link href="/register" className="font-medium underline underline-offset-4">
                Зарегистрироваться
              </Link>
            </p>

            <div className="mt-7 rounded-xl bg-canvas p-4 text-[13px] leading-relaxed text-ink-700">
              <p className="mb-1 font-medium text-ink-900">Демо-доступы прототипа</p>
              <p>
                Фермер: <code>farmer@nazarovskoe.ru</code> / <code>plemkniga123</code>
                <br />
                Администратор: <code>admin@holstein-russia.ru</code> / <code>plemkniga123</code>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
