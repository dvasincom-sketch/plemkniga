import { ACCESS_SCOPES, type AccessScope } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'

/**
 * Как выглядит карточка, открытая не целиком.
 *
 * Главное правило здесь одно, и оно ради него всё и написано: **закрытый
 * раздел не показывает прочерки**. Прочерк в карточке означает «данных нет»,
 * и человек, увидев его, уйдёт искать животное в другом месте — хотя данные
 * есть, их просто не открыли. Разница между «нет» и «вам не показали»
 * решает, состоится сделка или нет.
 *
 * Разбор — `docs/tochechnyy-dostup.md`, раздел 6.2.
 */

const labelOfScope = (scope: AccessScope): string =>
  ACCESS_SCOPES.find((s) => s.value === scope)?.label ?? scope

const hintOfScope = (scope: AccessScope): string =>
  ACCESS_SCOPES.find((s) => s.value === scope)?.hint ?? ''

/** Перечисление областей человеческим языком: «происхождение и оценку». */
export const listScopes = (scopes: AccessScope[]): string =>
  scopes.map((s) => labelOfScope(s).toLowerCase()).join(', ')

/**
 * Шапка: что именно вам открыли и до какого числа.
 *
 * Стоит выше вкладок, потому что отвечает на вопрос, который возникает
 * раньше остальных: почему часть карточки заперта, если запись открылась.
 */
export function GrantBanner({
  ownerName,
  scopes,
  expiresAt,
  wholeHerd,
}: {
  ownerName: string
  scopes: AccessScope[]
  expiresAt?: string | null
  wholeHerd: boolean
}) {
  return (
    <section className="mb-5 rounded-xl bg-brand-50 px-5 py-4">
      <p className="text-[15px] leading-relaxed text-ink-900">
        <span className="font-medium">Хозяйство {ownerName} открыло вам доступ</span> —{' '}
        {listScopes(scopes)}
        {wholeHerd ? ' по всему своему стаду' : ' по этой записи'}.
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-ink-500">
        {expiresAt ? `Доступ действует до ${dateRu(expiresAt)}. ` : 'Срок не ограничен. '}
        Владелец может закрыть его в любой момент. Остальным посетителям книги запись
        не видна.
      </p>
    </section>
  )
}

/**
 * Плашка вместо содержимого закрытого раздела.
 *
 * Отвечает на три вопроса подряд — что закрыто, кем, что с этим делать, —
 * той же логикой, что и страница полностью закрытой записи
 * (`ClosedAnimal.tsx`), и по той же причине: тупик вреден обеим сторонам.
 */
export function ScopeLocked({
  scope,
  ownerName,
  canAsk,
}: {
  scope: AccessScope
  ownerName: string
  /** Есть ли внизу страницы форма запроса, на которую можно послать. */
  canAsk: boolean
}) {
  return (
    <section className="card">
      <h2 className="panel-heading">{labelOfScope(scope)} вам не открыта</h2>

      <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Данные есть — хозяйство {ownerName} их не открывало. Здесь были бы:{' '}
        {hintOfScope(scope)}.
      </p>

      {canAsk && (
        <>
          <div className="mt-6">
            <a href="#request" className="btn btn-brand">
              Попросить этот раздел
            </a>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
            Запрос уйдёт владельцу — решение принимает он, а не Ассоциация.
          </p>
        </>
      )}
    </section>
  )
}
