import Link from 'next/link'
import { Logo } from './Logo'
import { currentTenant } from '@/lib/tenant-server'
import { PLATFORM } from '@/lib/platform'
import { SITE_HOSTS } from '@/lib/hosts'

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
export async function SiteFooter() {
  /*
   * Реквизиты берутся у книги, а не вписаны сюда.
   *
   * Адрес, телефон и правовые документы называют конкретное юридическое
   * лицо. У показательной книги этого лица нет, и выдумывать его нельзя:
   * страница, которая показывает, как ведут учёт племенных животных,
   * держится на доверии — придуманный адрес в подвале рушит ровно то,
   * ради чего её открыли.
   *
   * Поэтому колонки не заменяются заглушками, а исчезают. Пустая колонка
   * «Адрес» без адреса выглядит поломкой; отсутствующая — просто говорит,
   * что адреса нет.
   */
  const { org, legal } = await currentTenant()
  const columns = [org.address, org.phone ?? org.mail, org.telegram].filter(Boolean).length

  // Отступ сверху берётся из общей переменной: та же величина нужна заливке
  // страницы «не своего» животного, чтобы фон доходил до подвала без разрыва
  return (
    <footer
      style={{ marginTop: 'var(--footer-air)' }}
      className="bg-basement py-12 text-white"
    >
      <div
        className="container-page grid grid-cols-1 gap-10"
        /*
           Сетка считается по числу непустых колонок: жёсткие
           `md:grid-cols-[1.2fr_1fr_1fr_1fr]` растянули бы знак на
           три четверти ширины, когда колонок осталась одна.
        */
        style={{
          gridTemplateColumns: `1.2fr ${'1fr '.repeat(columns)}`.trim(),
        }}
      >
        <div className="flex flex-col items-start gap-4">
          {/*
             Под логотипом раньше висела ссылка на политику конфиденциальности.
             Она переехала в нижнюю строку, к её соседке по смыслу: два
             правовых документа стоят рядом и читаются как пара, а не как
             случайная ссылка под знаком Ассоциации.
          */}
          <Logo onDark />
        </div>

        {org.address && (
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">Адрес</h3>
            <p className="text-sm leading-relaxed text-white/90">{org.address}</p>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">Контакты</h3>
          <p className="text-sm leading-relaxed text-white/90">
            {org.phone && (
              <>
                <a
                  href={`tel:${org.phone.href}`}
                  className="transition-colors hover:text-brand-400"
                >
                  {org.phone.text}
                </a>
                <br />
              </>
            )}
            <a href={`mailto:${org.mail}`} className="transition-colors hover:text-brand-400">
              {org.mail}
            </a>
          </p>
        </div>

        {org.telegram && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">
            Служба поддержки
          </h3>
          <a
            href={org.telegram}
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
        )}
      </div>

      {/*
         Нижняя строка отделена чертой и приглушена: это не раздел подвала,
         а подпись под ним. Ставить её пятой колонкой значило бы уравнять
         оператора платформы с адресом и телефоном Ассоциации, а это разные
         по весу сведения — контакты нужны каждый день, а кто содержит
         систему, спрашивают один раз.
      */}
      <div className="container-page mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        {/*
           Здесь стояла подпись разработчика со ссылкой на личный Telegram.
           Пока платформа была работой одного человека, это было честно;
           с появлением юридического лица подпись физического лица в том же
           месте начала называть не того, кто за платформу отвечает. Книга
           утверждает, что её записи прослеживаемы, — такое утверждение
           делает организация, а не автор кода.

           Ссылка ведёт на витрину, а не на страницу внутри книги: организация
           содержит систему целиком, и рассказ о ней принадлежит домену
           системы. Внутри книги Ассоциации ему пришлось бы соседствовать
           с реквизитами Ассоциации, и читатель складывал бы два лица в одно.
        */}
        <p className="text-[13px] text-white/50">
          © {PLATFORM.since}{' '}
          <a
            href={`https://${SITE_HOSTS[0]}/org`}
            className="text-white/75 underline underline-offset-4 transition-colors hover:text-brand-400"
          >
            {PLATFORM.legalShort}
          </a>
        </p>

        {/*
           Правовые документы — справа, той же приглушённостью, что и подпись
           слева. На узком экране строка разворачивается в столбец.

           Отсюда ушли «Эволюция продукта», API, «Соответствие», «О продукте»
           и «Аукционы». Первые четыре рассказывают о системе, а не о книге
           Ассоциации: показывать их в подвале конкретной книги значило
           приписывать Ассоциации авторство платформы. Теперь они стоят
           на витрине, где им и место, — а здесь остаётся только то,
           что принадлежит хозяину этой книги.

           «Аукционы» ушли иначе: раздел открывается словами «в разработке»,
           и обещать несуществующее на каждой странице не стоит даже мелким
           шрифтом. Адрес работает, ссылки на него нет.
        */}
        {legal && (
          <nav aria-label="Правовые документы" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link
              href="/privacy"
              className="text-[13px] text-white/50 underline underline-offset-4 transition-colors hover:text-white"
            >
              Политика конфиденциальности
            </Link>
            <Link
              href="/data-policy"
              className="text-[13px] text-white/50 underline underline-offset-4 transition-colors hover:text-white"
            >
              Политика обработки
            </Link>
          </nav>
        )}
      </div>

    </footer>
  )
}
