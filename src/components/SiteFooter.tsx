import Link from 'next/link'
import { Logo } from './Logo'

/**
 * Подвал сайта.
 *
 * Тёмная подложка — одна на всех страницах. Раньше подвал был светло-серым
 * и на разных страницах читался по-разному: на бледно-зелёной карточке
 * животного он выглядел случайным пятном, а на серой главной сливался
 * с содержимым, и граница страницы терялась.
 *
 * Тёмная полоса внизу решает обе задачи сразу — она одинакова везде
 * и однозначно говорит, что содержимое закончилось.
 */
export function SiteFooter() {
  // Отступ сверху берётся из общей переменной: та же величина нужна заливке
  // страницы «не своего» животного, чтобы фон доходил до подвала без разрыва
  return (
    <footer
      style={{ marginTop: 'var(--footer-air)' }}
      className="bg-basement py-12 text-white"
    >
      <div className="container-page grid grid-cols-1 gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="flex flex-col items-start gap-4">
          {/* Логотип на тёмном: инверсия подписи, знак остаётся цветным */}
          <Logo onDark />
          <Link
            href="/privacy"
            className="text-sm text-white/75 underline underline-offset-4 transition-colors hover:text-white"
          >
            Политика конфиденциальности
          </Link>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">Адрес</h3>
          <p className="text-sm leading-relaxed text-white/90">
            443109, Россия, Самарская область, город Самара, улица Металлургическая, 92
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">Контакты</h3>
          <p className="text-sm leading-relaxed text-white/90">
            <a href="tel:+78469312595" className="transition-colors hover:text-brand-400">
              +7 846 931 25 95
            </a>
            <br />
            <a href="mailto:info@holstein-russia.ru" className="transition-colors hover:text-brand-400">
              info@holstein-russia.ru
            </a>
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">
            Служба поддержки
          </h3>
          <a
            href="https://t.me/"
            className="inline-flex text-white transition-colors hover:text-brand-400"
            aria-label="Telegram"
          >
            <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
              <path
                d="M28.6 1.3 1.2 11.9c-1.1.4-1.1 1.9 0 2.3l6.7 2.4 2.6 8c.3.9 1.5 1.1 2.1.4l3.7-4 7 5.1c.8.6 2 .2 2.2-.8L30 2.6c.2-1-.5-1.7-1.4-1.3ZM10.8 15.6l12.7-8.9-9.9 10.5-.4 4.5-2.4-6.1Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  )
}
