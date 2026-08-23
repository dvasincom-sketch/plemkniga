'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { requestVerificationAction, type VerificationState } from '@/actions/verification'
import { VERIFICATION_LIMIT } from '@/lib/verification-limit'
import { trustLabel } from '@/lib/dictionaries'
import { Select } from '@/components/Select'

type Row = {
  id: number
  identNumber: string
  name?: string | null
  birthDate?: string | null
  trustLevel?: number | null
  ready: boolean
  missing: string[]
  /** Номер и состояние неразобранной заявки, в которой запись уже лежит. */
  openRequest?: { number: string; status: string } | null
}

/**
 * Подача животных на верификацию.
 *
 * Список не «все мои животные», а те, которым есть куда расти: уже
 * подтверждённые сюда не попадают — подавать их незачем, а в длинном списке
 * они мешают.
 *
 * Рядом с каждой записью — готова ли она. Готовность считается тем же
 * расчётом, что и для свидетельства: если у животного нет даты рождения
 * и породы, эксперт всё равно вернёт заявку, и лучше это увидеть здесь,
 * чем через неделю ожидания. Подать неготовое можно — запрета нет: бывает,
 * что хозяйство знает про свои данные больше, чем система.
 */
export function VerificationForm({ rows }: { rows: Row[] }) {
  const [state, formAction, pending] = useActionState<VerificationState, FormData>(
    requestVerificationAction,
    {},
  )
  const [picked, setPicked] = useState<Set<number>>(new Set())
  /* Согласие отозвать прежние заявки — только явное, галочкой. */
  const [supersede, setSupersede] = useState(false)

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /*
   * «Отметить все готовые» больше не отмечает записи, уже лежащие
   * в неразобранной заявке. Иначе кнопка одним нажатием заводит дубль
   * по всему стаду — то есть ровно то, от чего вся эта возня.
   */
  const pickReady = () =>
    setPicked(new Set(rows.filter((r) => r.ready && !r.openRequest).map((r) => r.id)))

  /* Выбранные записи, которые уже ждут решения в другой заявке. */
  const clashing = rows.filter((r) => picked.has(r.id) && r.openRequest)

  const clashNumbers = [...new Set(clashing.map((r) => r.openRequest!.number))]

  const dropClashing = () =>
    setPicked((prev) => {
      const next = new Set(prev)
      for (const r of clashing) next.delete(r.id)
      return next
    })

  if (state.createdId) {
    return (
      <div className="card">
        <h2 className="panel-heading">Заявка подана</h2>
        <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Ассоциация разберёт её и вынесет заключение. Записи, по которым будут замечания
          «требует исправления», останутся с прежним уровнем достоверности — вы увидите список
          с причинами. Остальные получат уровень «Верифицировано ассоциацией».
        </p>
        {/*
           Ссылка ведёт на эту же страницу, а не в раздел данных: список
           «Ваши заявки» лежит прямо под формой, и переход просто заменяет
           карточку успеха обновлённым списком. Раньше она уводила
           в раздел, где заявок нет вовсе — там пакеты загрузок.
        */}
        <Link href="/account/verification" className="btn btn-accent">
          К списку заявок
        </Link>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="card">
        <h2 className="panel-heading">Подавать нечего</h2>
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Все записи вашего стада уже имеют уровень «Верифицировано ассоциацией» — либо
          в стаде пока нет животных.
        </p>
      </div>
    )
  }

  const overLimit = picked.size > VERIFICATION_LIMIT

  return (
    <form action={formAction} className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="panel-heading">Выберите записи</h2>
        <button
          type="button"
          onClick={pickReady}
          className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
        >
          отметить все готовые
        </button>
      </div>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Выбрано: {picked.size} из {rows.length}. За раз можно подать до {VERIFICATION_LIMIT}{' '}
        записей — заявку разбирает человек, и слишком длинная просто встанет в очереди.
      </p>

      <div className="max-h-[32rem] overflow-auto">
        <table className="metric-table">
          <thead>
            <tr>
              <th className="w-10"> </th>
              <th>Индивидуальный №</th>
              <th>Кличка</th>
              <th>Достоверность</th>
              <th>Готовность</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    name="animals"
                    value={r.id}
                    checked={picked.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Подать ${r.identNumber}`}
                  />
                </td>
                <td>
                  <Link
                    href={`/animals/${r.id}`}
                    className="underline underline-offset-4 hover:text-forest-500"
                  >
                    {r.identNumber}
                  </Link>
                </td>
                <td>{r.name || '—'}</td>
                <td className="text-ink-500">{trustLabel(r.trustLevel)}</td>
                <td className={r.ready ? 'text-forest-500' : 'text-amber-700'}>
                  {r.ready ? 'готова' : `не хватает: ${r.missing.join(', ')}`}
                  {/*
                     Отметка стоит в той же ячейке, что и готовность,
                     а не отдельной колонкой: колонка, пустая у всех
                     записей кроме двух, съедает ширину у таблицы,
                     которую и так листают.
                  */}
                  {r.openRequest && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-amber-700">
                      уже в заявке {r.openRequest.number}
                      {r.openRequest.status === 'checking' && ' — её уже разбирают'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/*
           `div`, а не `label`, и это не вкусовщина. `Select` у нас свой:
           триггер — кнопка, варианты — кнопки рядом. Клик по варианту
           внутри метки браузер переадресует на её элемент управления,
           то есть на тот же триггер, и он открывает список обратно сразу
           после того, как выбор его закрыл. Со стороны это выглядит как
           «список не закрывается». Та же беда была в карточке загрузки
           и вылечена там же и так же.
        */}
        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Зачем подаёте</span>
          <Select
            name="purpose"
            options={[
              { value: 'trust', label: 'Повысить достоверность записей' },
              { value: 'certificate', label: 'Подготовить к выпуску свидетельства' },
              { value: 'membership', label: 'Подтвердить племенной статус хозяйства' },
            ]}
            defaultValue="trust"
            placeholder=""
            onLight
            ariaLabel="Цель заявки"
          />
        </div>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">
            Сообщение Ассоциации <span className="text-ink-500">— необязательно</span>
          </span>
          <textarea name="comment" rows={2} className="field field-on-light" />
        </label>
      </div>

      {/*
         Повторная подача — не отказ и не разрешение по умолчанию,
         а требование выбрать.

         Молча пропустить нельзя: Ассоциация получает то же стадо второй
         раз и не знает, какая заявка отражает нынешние данные. Молча
         отозвать прежнюю тоже нельзя: её могли уже взять в работу,
         и хозяйство должно понимать, что отменяет чужой труд. Поэтому
         кнопка подачи заблокирована, пока выбор не сделан — любой
         из двух.
      */}
      {clashing.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] leading-relaxed text-ink-700">
          <p className="font-medium">
            {clashing.length === 1
              ? 'Одна из выбранных записей уже ждёт решения'
              : `Выбранных записей, которые уже ждут решения: ${clashing.length}`}
          </p>
          <p className="mt-1">
            {clashNumbers.length === 1
              ? `Они поданы заявкой ${clashNumbers[0]}`
              : `Они поданы заявками ${clashNumbers.join(', ')}`}
            . Подать их второй раз — значит попросить Ассоциацию разобрать одно и то же
            дважды, а решения по двум заявкам могут разойтись: каждое будет верным
            для того, что видел эксперт.
          </p>

          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              name="supersede"
              value="1"
              checked={supersede}
              onChange={(e) => setSupersede(e.target.checked)}
              className="mt-1"
            />
            <span>
              Отозвать {clashNumbers.length === 1 ? 'прежнюю заявку' : 'прежние заявки'} и подать
              эту — нынешние данные точнее.
              {clashing.some((r) => r.openRequest?.status === 'checking') && (
                <span className="mt-0.5 block text-ink-500">
                  Часть из них уже разбирают: работа эксперта по ним прекратится.
                </span>
              )}
            </span>
          </label>

          <button
            type="button"
            onClick={dropClashing}
            className="mt-2 underline underline-offset-4 hover:text-forest-500"
          >
            или снять эти записи из выбора и подать остальные
          </button>
        </div>
      )}

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      {/*
         Дубли, найденные сервером. Форма показывает своё предупреждение
         заранее, но полагаться на неё нельзя: список приходит из браузера,
         а заявку могли подать со второго окна, пока это было открыто.
      */}
      {!!state.duplicates?.length && (
        <ul className="mt-2 space-y-1 text-[14px] text-red-700">
          {state.duplicates.map((d) => (
            <li key={d.number}>
              Заявка {d.number}: {d.idents.join(', ')}
            </li>
          ))}
        </ul>
      )}
      {overLimit && (
        <p className="mt-4 text-[14px] text-red-700">
          Отмечено {picked.size} — это больше {VERIFICATION_LIMIT}. Снимите лишние или подайте
          двумя заявками.
        </p>
      )}

      <button
        type="submit"
        className="btn btn-accent mt-6"
        disabled={pending || picked.size === 0 || overLimit || (clashing.length > 0 && !supersede)}
      >
        {pending ? 'Отправляем…' : `Подать на верификацию${picked.size ? ` · ${picked.size}` : ''}`}
      </button>
    </form>
  )
}
