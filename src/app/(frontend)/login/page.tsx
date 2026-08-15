import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { LoginForm } from '@/components/LoginForm'
import { ImageSlot } from '@/components/ImageSlot'
import { getCurrentUser } from '@/lib/payload'

export const metadata: Metadata = { title: 'Вход' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/account')

  return (
    <>
      <SiteHeader />

      <main className="container-page pb-8">
        <section className="grid grid-cols-1 gap-8 rounded-card bg-brand-500 p-7 sm:p-10 lg:grid-cols-[1fr_1fr] lg:gap-12">
          <div className="text-white">
            <h1 className="text-[32px] font-medium leading-[1.12] sm:text-[42px]">
              Вход в информационную систему
            </h1>
            <p className="mt-6 max-w-[48ch] text-[15px] leading-[1.55] text-white/95">
              Авторизуйтесь, чтобы работать со своим стадом: загружать данные, отправлять события,
              формировать племенные свидетельства и видеть полные карточки животных.
            </p>

            <ImageSlot
              name="images/login"
              alt="Голштинская порода"
              sizes="(max-width: 1024px) 100vw, 40vw"
              ratio="16 / 9"
              minHeight={200}
              className="mt-8 w-full rounded-2xl"
            />
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
