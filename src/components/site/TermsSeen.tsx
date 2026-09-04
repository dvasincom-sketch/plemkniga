import Link from 'next/link'
import { termHref } from '@/lib/terms'
import { termsOf } from '@/lib/term-links'

/**
 * «Слова этой страницы» — блок со ссылками в словарь.
 *
 * Стоит на разборах, исследованиях и страницах пород, и стоит внизу:
 * читатель, споткнувшийся о слово в середине текста, дочитывает абзац,
 * а не уходит по ссылке немедленно. Ссылка в середине абзаца уводит
 * с середины абзаца — тот же довод, по которому источники разбора
 * лежат в конце.
 *
 * Адрес считается (`termHref`): у термина со статьёй он свой,
 * у остальных — якорь на строку указателя. Писать его руками значило бы
 * повторить десять ссылок в «страницу не найдено», которые уже
 * приходилось чинить.
 */
export function TermsSeen({ slugs }: { slugs?: string[] }) {
  const terms = termsOf(slugs)
  if (terms.length === 0) return null

  return (
    <section className="mt-14 max-w-[75ch]">
      <h2 className="text-[20px] font-medium leading-tight">Слова этой страницы</h2>

      <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
        Определения с нашими числами и с тем, чего каждое слово не означает.
      </p>

      <dl className="mt-5 space-y-4">
        {terms.map((t) => (
          <div key={t.slug} className="border-t border-ink-100 pt-4">
            <dt className="text-[16px] font-medium">
              <Link
                href={termHref(t.slug)}
                className="underline underline-offset-4 hover:text-forest-500"
              >
                {t.title}
              </Link>
            </dt>
            <dd className="mt-1 text-[15px] leading-relaxed text-ink-700">{t.short}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
