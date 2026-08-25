'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  deleteSearchAction,
  saveSearchAction,
  updateSearchAction,
  type SavedSearchState,
} from '@/actions/saved-searches'

/**
 * Именованные отборы: сохранить текущий, открыть сохранённый.
 *
 * ## Почему ряд ссылок, а не выпадающий список
 *
 * Отборов у человека единицы, а не десятки: их заводят под повторяющуюся
 * работу, и повторяющейся работы столько же, сколько её видов. Список,
 * который надо раскрыть, чтобы узнать, есть ли в нём что-нибудь, отвечает
 * на вопрос «что у меня сохранено» лишним нажатием — а вопрос этот задают
 * каждый раз, заходя на страницу.
 *
 * Ряд стоит рядом с плашками быстрого отбора намеренно: и то и другое —
 * готовый отбор в одно нажатие, разница лишь в том, кто его придумал.
 * Разводить их по разным углам значило бы делать вид, что это разные
 * действия.
 *
 * ## Почему «Сохранить» появляется только при заданных условиях
 *
 * Отбор без условий — это «все животные», то есть страница, на которую
 * ведёт первая же ссылка. Кнопка, предлагающая сохранить пустоту,
 * обещает работу, которой нет; нажавший заведёт в списке строку,
 * которая ничего не делает, и решит, что сохранение сломано.
 */

export type SavedSearchItem = {
  id: number | string
  name: string
  query: string
  scope: 'private' | 'organization'
  /** Отбор завёл кто-то другой и открыл хозяйству — переименовать его нельзя. */
  mine: boolean
}

const SharedIcon = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="7" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="13.6" cy="6.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M2.6 15.4c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4M13 11.6c2.2.1 3.9 1.6 3.9 3.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export function SavedSearches({
  items,
  place,
  currentQuery,
  hasActive,
  basePath,
}: {
  items: SavedSearchItem[]
  place: 'book' | 'herd'
  /** Строка запроса текущей страницы — её и сохраняем. */
  currentQuery: string
  hasActive: boolean
  /**
   * Куда вести ссылку отбора.
   *
   * В книге это корень, в кабинете — `/account?tab=herd`: раздел стада
   * своего маршрута не имеет и живёт вкладкой на общей странице. Отсюда
   * и склейка через `&` там, где вопросительный знак в адресе уже есть, —
   * без неё ссылка получалась бы с двумя `?` и вела в никуда.
   */
  basePath: string
}) {
  const hrefOf = (query: string) => `${basePath}${basePath.includes('?') ? '&' : '?'}${query}`
  const [open, setOpen] = useState(false)
  const [managed, setManaged] = useState<SavedSearchItem | null>(null)

  const [saveState, save, saving] = useActionState<SavedSearchState, FormData>(
    saveSearchAction,
    {},
  )

  if (!items.length && !hasActive) return null

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {!!items.length && <span className="text-[13px] text-ink-500">Мои отборы:</span>}

        {items.map((s) => (
          <span key={s.id} className="inline-flex items-center">
            <Link
              href={hrefOf(s.query)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[14px] leading-6 text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
            >
              {/*
                 Значок общего отбора стоит у названия, а не подписью рядом.
                 Разница между «мой черновик» и «то, чем пользуется всё
                 хозяйство» важна в тот момент, когда отбор переименовывают
                 или удаляют, — то есть при взгляде на список, а не при
                 наведении.
              */}
              {s.scope === 'organization' && (
                <span className="text-ink-400" title="Виден всему хозяйству">
                  <SharedIcon />
                </span>
              )}
              {s.name}
            </Link>

            {s.mine && (
              <button
                type="button"
                onClick={() => setManaged(s)}
                aria-label={`Настроить отбор «${s.name}»`}
                className="ml-1 rounded-full px-1.5 py-1 text-ink-400 transition-colors hover:text-ink-700"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="4.5" r="1.4" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.4" fill="currentColor" />
                  <circle cx="10" cy="15.5" r="1.4" fill="currentColor" />
                </svg>
              </button>
            )}
          </span>
        ))}

        {hasActive && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-full border border-dashed border-ink-300 px-3.5 py-1.5 text-[14px] leading-6 text-ink-700 transition-colors hover:border-brand-400"
          >
            + Сохранить отбор
          </button>
        )}
      </div>

      {open && (
        <form action={save} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="query" value={currentQuery} />
          <input type="hidden" name="place" value={place} />

          <label className="text-[13px]">
            <span className="mb-1.5 block text-ink-700">Название отбора</span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Коровы на выбраковку"
              className="w-64 rounded-lg border border-ink-200 px-3 py-2 text-[14px]"
            />
          </label>

          <label className="flex items-center gap-2 pb-2.5 text-[13px] text-ink-700">
            <input type="checkbox" name="scope" value="organization" />
            Виден всему хозяйству
          </label>

          <button type="submit" disabled={saving} className="btn btn-brand mb-0.5">
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>

          {saveState.error && (
            <p className="w-full text-[13px] text-red-700">{saveState.error}</p>
          )}
          {saveState.ok && (
            <p className="w-full text-[13px] text-forest-600">
              Отбор сохранён — он появится в ряду после обновления страницы.
            </p>
          )}
        </form>
      )}

      {managed && <ManageForm item={managed} onDone={() => setManaged(null)} />}
    </div>
  )
}

/**
 * Переименование, видимость и удаление — одной формой.
 *
 * Условия отбора здесь не правятся, и это не упущение: изменить их можно
 * только пересохранив отбор с той страницы, где видно, что он находит.
 * Правка порогов вслепую, из списка, меняет смысл набора — а тот, кто
 * на него опирался, узнаёт об этом последним.
 */
function ManageForm({ item, onDone }: { item: SavedSearchItem; onDone: () => void }) {
  const [renameState, rename, renaming] = useActionState<SavedSearchState, FormData>(
    updateSearchAction,
    {},
  )
  const [removeState, remove, removing] = useActionState<SavedSearchState, FormData>(
    deleteSearchAction,
    {},
  )

  return (
    <div className="mt-3 rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[15px] font-medium">Отбор «{item.name}»</p>
        <button type="button" onClick={onDone} className="text-[13px] text-ink-500 underline">
          Закрыть
        </button>
      </div>

      <form action={rename} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={String(item.id)} />

        <label className="text-[13px]">
          <span className="mb-1.5 block text-ink-700">Название</span>
          <input
            name="name"
            defaultValue={item.name}
            required
            maxLength={80}
            className="w-64 rounded-lg border border-ink-200 px-3 py-2 text-[14px]"
          />
        </label>

        <label className="flex items-center gap-2 pb-2.5 text-[13px] text-ink-700">
          <input
            type="checkbox"
            name="scope"
            value="organization"
            defaultChecked={item.scope === 'organization'}
          />
          Виден всему хозяйству
        </label>

        <button type="submit" disabled={renaming} className="btn btn-forest mb-0.5">
          {renaming ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>

      {renameState.error && <p className="mt-2 text-[13px] text-red-700">{renameState.error}</p>}
      {renameState.ok && <p className="mt-2 text-[13px] text-forest-600">Изменено.</p>}

      {/*
         Удаление отдельной формой, а не кнопкой в той же: иначе оно
         делило бы с переименованием одно состояние, и ответ «изменено»
         показывался бы после удаления. Заслона подтверждения здесь нет
         намеренно — удалён отбор, а не данные, и собрать его заново
         стоит одного нажатия на плашки.
      */}
      <form action={remove} className="mt-4 border-t border-ink-100 pt-3">
        <input type="hidden" name="id" value={String(item.id)} />
        <button
          type="submit"
          disabled={removing}
          className="text-[13px] text-red-700 underline underline-offset-4"
        >
          {removing ? 'Удаляем…' : 'Удалить отбор'}
        </button>
        {removeState.error && <p className="mt-2 text-[13px] text-red-700">{removeState.error}</p>}
        {removeState.ok && (
          <p className="mt-2 text-[13px] text-ink-500">
            Удалён — из ряда он исчезнет после обновления страницы.
          </p>
        )}
      </form>
    </div>
  )
}
