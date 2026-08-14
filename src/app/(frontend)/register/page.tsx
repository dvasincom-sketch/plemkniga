import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { RegisterWizard } from '@/components/RegisterWizard'
import { CowFullIllustration } from '@/components/CowIllustration'
import { Picture } from '@/components/Picture'
import { getCurrentUser } from '@/lib/payload'

export const metadata: Metadata = { title: 'Регистрация' }
export const dynamic = 'force-dynamic'

const BENEFITS = [
  'Доступ к базе племенных животных',
  'Формирование племенных сертификатов',
  'Участие в аукционах и продажах',
  'Аналитические инструменты для селекции',
  'Обмен данными',
  'Экспорт данных в различные форматы',
]

const Check = () => (
  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m4 10.5 4 4 8-9"
        stroke="#17181A"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
)

export default async function RegisterPage() {
  const user = await getCurrentUser()
  if (user) redirect('/account')

  return (
    <>
      <SiteHeader />

      <main className="container-page">
        <section className="grid grid-cols-1 gap-8 rounded-card bg-brand-500 p-7 sm:p-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          <div className="text-white">
            <h1 className="text-[32px] font-medium leading-[1.12] sm:text-[42px]">
              Добро пожаловать в информационную систему учета племенной ценности животных!
            </h1>
            <p className="mt-6 max-w-[52ch] text-[15px] leading-[1.55] text-white/95">
              Для получения доступа к полному функционалу системы необходимо зарегистрироваться.
              Выберите подходящую роль, соответствующую вашему статусу в отрасли.
            </p>

            <h2 className="mt-9 text-[22px] font-medium">Преимущества регистрации:</h2>
            <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {BENEFITS.map((b) => (
                <li key={b} className="rounded-xl bg-white/15 p-4">
                  <Check />
                  <p className="mt-4 text-[13px] leading-snug">{b}</p>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-[15px] text-white/95">
              Уже зарегистрированы?{' '}
              <Link href="/login" className="font-medium underline underline-offset-4">
                Войти в систему
              </Link>
            </p>
          </div>

          <RegisterWizard />
        </section>

        {/* --------------------------- Обратная связь -------------------------- */}
        <section className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div className="overflow-hidden rounded-card">
            <Picture
              name="images/contacts"
              alt="Корова голштинской породы на пастбище"
              className="h-full min-h-[300px] w-full"
              fallback={<CowFullIllustration className="h-full min-h-[300px] w-full object-cover" />}
            />
          </div>

          <div>
            <h2 className="text-[32px] font-medium leading-[1.15] sm:text-[40px]">
              Если возникнут какие-либо вопросы, вы всегда можете связаться с нами
            </h2>
            <form className="mt-8 space-y-4" action="/register">
              <input name="contactName" placeholder="Ваше имя" className="field field-on-light" />
              <input
                name="contactEmail"
                type="email"
                placeholder="E-mail или телефон"
                className="field field-on-light"
              />
              <textarea
                name="contactMessage"
                placeholder="Вопрос"
                rows={3}
                className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <button type="submit" className="btn btn-brand">
                Отправить
              </button>
            </form>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
