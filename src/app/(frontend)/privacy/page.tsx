import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export const metadata: Metadata = { title: 'Политика конфиденциальности' }

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="container-page pt-10 pb-8">
        <h1 className="text-[38px] font-medium sm:text-[46px]">Политика конфиденциальности</h1>
        <div className="card mt-8 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            Оператор — Ассоциация производителей КРС голштинской породы, 443109, Самарская область,
            г. Самара, ул. Металлургическая, 92.
          </p>
          <p>
            Обрабатываются: ФИО, должность, телефон, адрес электронной почты, реквизиты
            организации-члена Ассоциации, а также сведения о животных, вносимые пользователем.
          </p>
          <p>
            Цели обработки: ведение племенной книги, расчёт индексов племенной ценности, выдача
            племенных свидетельств, информирование о работе Ассоциации.
          </p>
          <p>
            Публичность данных о животных регулируется владельцем в разделе «Личный кабинет →
            Настройки». По умолчанию записи закрыты для анонимных посетителей.
          </p>
          <p>Текст размещён в прототипе как заглушка и подлежит согласованию с юристом.</p>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
