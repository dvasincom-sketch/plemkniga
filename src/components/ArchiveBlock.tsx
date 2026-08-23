'use client'

import { useActionState } from 'react'
import { archiveAnimalAction, type AnimalFormState } from '@/actions/animals'
import { ARCHIVE_RETENTION_DAYS } from '@/lib/archive-retention'

/**
 * Отправить запись в архив — и вернуть.
 *
 * ## Почему здесь нет кнопки «удалить»
 *
 * Ошибочно загруженную запись убрать было нечем: она оставалась в кабинете
 * навсегда. Кнопка «удалить» решила бы это одним нажатием — и одним же
 * нажатием стирала бы то, чего стирать не хотели. Поэтому убирает архив,
 * а удаляет время: тридцать дней запись возвращается одним нажатием,
 * потом уходит из книги, и в реестре остаётся строка о том, что она была.
 *
 * ## Почему сказано, что удалится вместе с ней
 *
 * Правило книги — потолки называются до нажатия, а не после
 * (docs/interfeys.md). «Вместе с карточкой уйдут 128 доек и 3 отёла» —
 * это то, чего человек не держит в голове, нажимая «в архив» на записи,
 * которую считает пустой ошибкой.
 *
 * ## Почему предупреждение о том, что запись не удалится, — не ошибка
 *
 * Запись, на которую опираются другие (мать живых потомков, выданное
 * свидетельство, открытая заявка), не уйдёт и по сроку. Сказать об этом
 * надо при отправке в архив, а не через месяц: иначе хозяйство будет
 * ждать исчезновения, которого не случится, и решит, что система сломана.
 */
export function ArchiveBlock({
  animalId,
  archived,
  archivedAt,
  archiveReason,
  dependents,
  blockers,
}: {
  animalId: number
  archived: boolean
  archivedAt: string | null
  archiveReason: string | null
  /** Сколько связанных записей уйдёт вместе с карточкой */
  dependents: number
  /** Почему запись не удалится даже по сроку */
  blockers: string[]
}) {
  const [state, formAction, pending] = useActionState<AnimalFormState, FormData>(
    archiveAnimalAction,
    {},
  )

  const due = archivedAt
    ? new Date(new Date(archivedAt).getTime() + ARCHIVE_RETENTION_DAYS * 86_400_000)
    : null

  if (archived) {
    return (
      <form action={formAction} className="card mt-6">
        <h2 className="panel-heading">Запись в архиве</h2>

        <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
          {archiveReason ? `Причина: ${archiveReason}. ` : ''}
          Карточки нет ни в книге, ни в списке стада.{' '}
          {blockers.length ? (
            <>
              Из книги она не уйдёт и после срока — на неё опираются другие записи.
            </>
          ) : due ? (
            <>
              <span className="font-medium">{due.toLocaleDateString('ru-RU')}</span> она будет
              удалена из книги вместе со всеми событиями. В реестре удалённых записей останется
              строка: номер, кличка, хозяйство и дата.
            </>
          ) : (
            <>Срок хранения не начат — дата архивации не проставлена.</>
          )}
        </p>

        {blockers.length > 0 && (
          <ul className="mt-3 space-y-1 text-[13px] leading-snug text-ink-500">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        )}

        <input type="hidden" name="id" value={animalId} />
        <input type="hidden" name="restore" value="1" />

        {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
        {state.message && <p className="mt-4 text-[14px] text-forest-600">{state.message}</p>}

        <button type="submit" className="btn btn-brand mt-6" disabled={pending}>
          {pending ? 'Возвращаем…' : 'Вернуть из архива'}
        </button>
      </form>
    )
  }

  return (
    <form action={formAction} className="card mt-6">
      <h2 className="panel-heading">Убрать запись из книги</h2>

      <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        Запись уходит в архив: пропадает из книги и из вашего списка стада, но{' '}
        {ARCHIVE_RETENTION_DAYS} дней возвращается одним нажатием. После этого срока карточка
        удаляется из книги, а в реестре удалённых записей остаётся строка о ней — номер, кличка,
        хозяйство и дата. Так отвечают через год на вопрос «что было под этим номером».
      </p>

      {dependents > 0 && (
        <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
          Вместе с карточкой уйдут связанные с ней записи —{' '}
          <span className="font-medium">{dependents}</span>: отёлы, дойки, осеменения, оценки.
        </p>
      )}

      {blockers.length > 0 && (
        <div className="mt-3 max-w-[70ch] rounded-md bg-[#f6f6f6] p-4">
          <p className="text-[14px] font-medium">Из книги эта запись не удалится</p>
          <ul className="mt-2 space-y-1 text-[13px] leading-snug text-ink-700">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-snug text-ink-500">
            В архив отправить можно — она пропадёт из книги и из списка стада. Но удаление
            по сроку не тронет запись, на которую опираются другие: чужая родословная не должна
            рваться от вашей уборки.
          </p>
        </div>
      )}

      <input type="hidden" name="id" value={animalId} />

      <label className="mt-5 block text-[14px]">
        Причина
        <input
          name="archiveReason"
          required
          minLength={3}
          placeholder="Например: загружено по ошибке из файла за март"
          className="field field-on-light mt-1.5 block w-full max-w-[52ch]"
        />
        <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
          По ней через месяц отличат ошибочную запись от выбывшего животного.
        </span>
      </label>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
      {state.message && <p className="mt-4 text-[14px] text-forest-600">{state.message}</p>}

      {/*
         Кнопка не красная. Красный в этой книге обозначает необратимое
         (docs/interfeys.md), а архив обратим все тридцать дней —
         красная кнопка обещала бы больше, чем делает, и человек
         не нажал бы её там, где нажать безопасно.
      */}
      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Отправляем…' : 'Отправить в архив'}
      </button>
    </form>
  )
}
