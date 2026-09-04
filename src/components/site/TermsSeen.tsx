import Link from 'next/link'
import { termHref } from '@/lib/terms'
import { termsOf } from '@/lib/term-links'

/**
 * «Слова этой страницы» — блок со ссылками в словарь.
 *
 * ## Почему это таблица, а не продолжение текста
 *
 * Блок стоит под статьёй и по виду от неё не отличался: те же абзацы,
 * та же ширина, тот же кегль. Читатель, дочитавший разбор, не понимал,
 * что текст кончился, — и либо читал справку как продолжение мысли,
 * либо пролистывал вместе с ней подписи и источники.
 *
 * Таблица на белом поле решает это без единого слова: две колонки —
 * термин и что он значит — читаются как справка с первого взгляда,
 * и перепутать её с прозой нельзя. Заодно она вдвое короче: тот же
 * список абзацами занимал экран.
 *
 * ## Почему шире колонки текста
 *
 * Проза набрана в семьдесят пять знаков, потому что длинную строку
 * тяжело читать подряд. Справку подряд не читают — в ней ищут своё
 * слово, — и узкая колонка тут только добавляет строк.
 *
 * ## Почему адрес считается
 *
 * `termHref`: у термина со статьёй он свой, у остальных — якорь
 * на строку указателя. Писать его руками значило бы повторить десять
 * ссылок в «страницу не найдено», которые уже приходилось чинить.
 */
export function TermsSeen({ slugs }: { slugs?: string[] }) {
  const terms = termsOf(slugs)
  if (terms.length === 0) return null

  return (
    <section className="mt-16 border-t border-ink-100 pt-10">
      <h2 className="text-[20px] font-medium leading-tight">Слова этой страницы</h2>

      <p className="mt-2 max-w-[75ch] text-[15px] leading-relaxed text-ink-500">
        Определения с нашими числами и с тем, чего каждое слово не означает.
      </p>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-ink-100 bg-white">
        <table className="w-full min-w-[640px] text-[15px]">
          <tbody>
            {terms.map((t, i) => (
              <tr key={t.slug} className={i > 0 ? 'border-t border-ink-100' : ''}>
                <th
                  scope="row"
                  className="w-[26%] px-5 py-3.5 text-left align-top font-medium"
                >
                  <Link
                    href={termHref(t.slug)}
                    className="underline underline-offset-4 hover:text-forest-500"
                  >
                    {t.title}
                  </Link>
                </th>
                <td className="px-5 py-3.5 align-top leading-relaxed text-ink-700">
                  {t.short}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
