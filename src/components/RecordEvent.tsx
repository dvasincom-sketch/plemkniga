'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useActionState } from 'react'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'
import { AnimalPicker } from '@/components/AnimalPicker'
import {
  addCalvingAction,
  addInseminationAction,
  addMilkTestAction,
  type RecordState,
} from '@/actions/reproduction'
import { addEventAction, type EventFormState } from '@/actions/events'

/**
 * Запись события — от события к животному, а не наоборот.
 *
 * ## Почему порядок именно такой
 *
 * Раньше событие можно было записать единственным путём: найти животное
 * в списке стада, открыть карточку, пролистать до блока внизу, нажать
 * «Событие», выбрать тип. Шесть шагов до первого поля.
 *
 * Порядок при этом был перевёрнут относительно того, как событие
 * происходит в голове у зоотехника. Он не думает «животное номер 4821,
 * а что с ним?» — он думает «отелилась Зорька». Сначала событие, потом
 * животное. Здесь так и сделано: сначала плитка, потом поиск по стаду.
 *
 * ## «Записать ещё один такой же»
 *
 * Это не украшение, а главное здесь после порядка полей. Пять отёлов
 * за неделю — самый частый случай в хозяйстве, и раньше для него не годился
 * ни один путь: файл ради пяти строк никто не делает, а пять раз пройти
 * по шесть шагов — двадцать минут. После записи форма остаётся открытой
 * на том же типе, дата сохраняется, животное очищается.
 *
 * ## Чего здесь нет
 *
 * Номера отёла и номера лактации не спрашиваются: их знает система.
 * Спрашивать у человека число, которое можно посчитать, — верный способ
 * получить его неверным.
 */

type Choice = { value: string; label: string }

/*
 * Списки продублированы, а не импортированы из коллекций.
 *
 * `CALVING_RESULTS` лежит в `src/collections/Calvings.ts`, но этот файл
 * тянет за собой правила доступа и хуки — то есть серверный код, которому
 * в клиентской сборке делать нечего. Дублирование здесь дешевле связи:
 * значения меняются вместе с колонкой enum, то есть миграцией, и молча
 * разойтись не могут.
 */
const CALVING_RESULTS: Choice[] = [
  { value: 'heifer', label: 'Тёлка' },
  { value: 'bull', label: 'Бычок' },
  { value: 'twins', label: 'Двойня' },
  { value: 'stillborn', label: 'Мертворождение' },
  { value: 'abortion', label: 'Аборт' },
]

const CALVING_EASE: Choice[] = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'assisted', label: 'С помощью' },
  { value: 'hard', label: 'Тяжёлый' },
]

const DISPOSAL_STATES: Choice[] = [
  { value: 'sold', label: 'Продано' },
  { value: 'culled', label: 'Выбраковано' },
  { value: 'dead', label: 'Пало' },
]

type Kind = 'calving' | 'insemination' | 'milkTest' | 'dryOff' | 'move' | 'disposal'

const TILES: { key: Kind; label: string; hint: string }[] = [
  { key: 'calving', label: 'Отёл', hint: 'Номер отёла посчитается сам' },
  { key: 'insemination', label: 'Осеменение', hint: 'Бык, техник, кратность' },
  { key: 'milkTest', label: 'Контрольная дойка', hint: 'Удой, жир, белок, соматика' },
  { key: 'dryOff', label: 'Запуск', hint: 'Конец лактации' },
  { key: 'move', label: 'Перемещение', hint: 'Смена стада внутри хозяйства' },
  { key: 'disposal', label: 'Выбытие', hint: 'Продажа, выбраковка, падёж' },
]

const today = () => new Date().toISOString().slice(0, 10)

function Result({ state }: { state: { error?: string; message?: string } }) {
  if (state.error) return <p className="mt-4 text-[14px] text-red-700">{state.error}</p>
  if (state.message)
    return (
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
        {state.message}
      </p>
    )
  return null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[14px]">
      <span className="mb-1.5 block text-ink-700">{label}</span>
      {children}
    </label>
  )
}

/**
 * Подпись к списку — `div`, а не `label`, и это не вкусовщина.
 *
 * `Select` у нас свой: триггер — кнопка, варианты — кнопки рядом. Клик
 * по варианту внутри `<label>` браузер переадресует на элемент управления
 * метки, то есть на тот же триггер, и он открывает список обратно сразу
 * после того, как выбор его закрыл. Со стороны это выглядит как «список
 * не закрывается».
 *
 * Для обычных полей `<label>` остаётся: там переадресация клика на поле —
 * ровно то, что нужно.
 */
function SelectField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block text-[14px]">
      <span className="mb-1.5 block text-ink-700">{label}</span>
      {children}
    </div>
  )
}

/**
 * Оболочка формы: заголовок, кнопки, повтор.
 *
 * Повтор устроен сменой `key`: выбранное животное и введённые числа живут
 * внутри полей, и сбросить их иначе как пересозданием нельзя. Дата
 * при этом переносится в новую форму — она у пяти отёлов подряд одна
 * и та же, и заставлять вводить её заново значит не понимать, зачем
 * человек нажал «записать ещё».
 */
function FormShell({
  title,
  hint,
  pending,
  state,
  onBack,
  onRepeat,
  children,
}: {
  title: string
  hint?: string
  pending: boolean
  state: { error?: string; message?: string }
  onBack: () => void
  onRepeat: () => void
  children: React.ReactNode
}) {
  const done = Boolean(state.message)

  return (
    <div className="card">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="panel-heading !mb-0">{title}</h2>
        <button
          type="button"
          onClick={onBack}
          className="text-[14px] text-ink-500 underline underline-offset-4"
        >
          другое событие
        </button>
      </div>

      {hint && <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">{hint}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>

      <Result state={state} />

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Записываем…' : 'Записать'}
        </button>
        {done && (
          <button type="button" className="btn" onClick={onRepeat}>
            Записать ещё один такой же
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function RecordEvent({
  herds,
  disposalReasons,
  technicians,
}: {
  herds: Choice[]
  disposalReasons: Choice[]
  technicians: Choice[]
}) {
  const [kind, setKind] = useState<Kind | null>(null)
  /** Смена значения пересоздаёт форму — так очищаются поля после записи. */
  const [round, setRound] = useState(0)
  const [date, setDate] = useState(today())

  if (!kind) {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setKind(t.key)}
              className="card text-left transition-colors hover:bg-[#fafafa]"
            >
              <span className="block text-[18px] font-medium">{t.label}</span>
              <span className="mt-1 block text-[13px] leading-snug text-ink-500">{t.hint}</span>
            </button>
          ))}
        </div>

        {/*
           Рождение телёнка — тоже событие, но заканчивается оно новой
           карточкой, а не строкой в таблице. Вести его отсюда правильнее,
           чем делать вид, что заведение животного к событиям отношения
           не имеет: человек ищет его здесь.
        */}
        <div className="card mt-6">
          <h2 className="panel-heading">Родился телёнок</h2>
          <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
            Это не запись в таблицу, а новая карточка. Мать и отца выберете из своего
            стада — переписывать номера со свидетельства не придётся.
          </p>
          <Link href="/account/animals/new?scenario=born" className="btn btn-accent mt-5">
            Завести карточку телёнка
          </Link>
        </div>
      </>
    )
  }

  const back = () => {
    setKind(null)
    setRound((r) => r + 1)
  }
  const repeat = () => setRound((r) => r + 1)
  const common = { key: `${kind}-${round}`, date, setDate, onBack: back, onRepeat: repeat }

  switch (kind) {
    case 'calving':
      return <CalvingForm {...common} />
    case 'insemination':
      return <InseminationForm {...common} technicians={technicians} />
    case 'milkTest':
      return <MilkTestForm {...common} />
    default:
      return (
        <SimpleEventForm
          {...common}
          kind={kind}
          herds={herds}
          disposalReasons={disposalReasons}
        />
      )
  }
}

type FormProps = {
  date: string
  setDate: (v: string) => void
  onBack: () => void
  onRepeat: () => void
}

/** Дата запоминается на будущий повтор до того, как уйдёт действие. */
const keepDate = (fd: FormData, setDate: (v: string) => void) => {
  const v = String(fd.get('date') ?? '')
  if (v) setDate(v.slice(0, 10))
}

/* ----------------------------- Отёл ------------------------------- */

function CalvingForm({ date, setDate, onBack, onRepeat }: FormProps) {
  const [state, formAction, pending] = useActionState<RecordState, FormData>(addCalvingAction, {})

  return (
    <form
      action={(fd) => {
        keepDate(fd, setDate)
        formAction(fd)
      }}
    >
      <FormShell
        title="Отёл"
        hint="Номер отёла проставится сам — следующий за последним записанным."
        pending={pending}
        state={state}
        onBack={onBack}
        onRepeat={onRepeat}
      >
        <AnimalPicker name="animal" label="Корова" sex="female" required />
        <Field label="Дата отёла">
          <DateField name="date" defaultValue={date} required max={today()} />
        </Field>
        <SelectField label="Результат">
          <Select name="result" options={CALVING_RESULTS} placeholder="Не указан" onLight />
        </SelectField>
        <SelectField label="Лёгкость отёла">
          <Select name="ease" options={CALVING_EASE} placeholder="Не указана" onLight />
        </SelectField>
        <Field label="Масса телёнка, кг">
          <input name="calfWeight" inputMode="decimal" className="field field-on-light" />
        </Field>
        <Field label="Дата запуска">
          <DateField name="dryOffDate" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Комментарий">
            <textarea name="comment" rows={2} className="field field-on-light" />
          </Field>
        </div>
      </FormShell>
    </form>
  )
}

/* -------------------------- Осеменение ---------------------------- */

function InseminationForm({
  date,
  setDate,
  onBack,
  onRepeat,
  technicians,
}: FormProps & { technicians: Choice[] }) {
  const [state, formAction, pending] = useActionState<RecordState, FormData>(
    addInseminationAction,
    {},
  )

  return (
    <form
      action={(fd) => {
        keepDate(fd, setDate)
        formAction(fd)
      }}
    >
      <FormShell
        title="Осеменение"
        hint="Номер отёла, к которому относится осеменение, проставится сам."
        pending={pending}
        state={state}
        onBack={onBack}
        onRepeat={onRepeat}
      >
        <AnimalPicker name="animal" label="Корова или тёлка" sex="female" required />
        <Field label="Дата осеменения">
          <DateField name="date" defaultValue={date} required max={today()} />
        </Field>
        <AnimalPicker
          name="bull"
          label="Бык-производитель"
          sex="male"
          hint="Из своего стада; привозное семя записывается загрузкой"
        />
        <SelectField label="Техник-осеменатор">
          <Select name="technician" options={technicians} placeholder="Не указан" onLight />
        </SelectField>
        <Field label="Кратность">
          <input name="attemptNumber" inputMode="numeric" className="field field-on-light" />
        </Field>
        <Field label="Доз семени">
          <input name="doses" inputMode="numeric" defaultValue="1" className="field field-on-light" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Комментарий">
            <textarea name="comment" rows={2} className="field field-on-light" />
          </Field>
        </div>
      </FormShell>
    </form>
  )
}

/* ----------------------- Контрольная дойка ------------------------ */

function MilkTestForm({ date, setDate, onBack, onRepeat }: FormProps) {
  const [state, formAction, pending] = useActionState<RecordState, FormData>(addMilkTestAction, {})

  return (
    <form
      action={(fd) => {
        keepDate(fd, setDate)
        formAction(fd)
      }}
    >
      <FormShell
        title="Контрольная дойка"
        hint="Запись отметится как собственный замер, а не лабораторный: у них разный вес."
        pending={pending}
        state={state}
        onBack={onBack}
        onRepeat={onRepeat}
      >
        <AnimalPicker name="animal" label="Животное" required />
        <Field label="Дата замера">
          <DateField name="date" defaultValue={date} required max={today()} />
        </Field>
        <Field label="Удой за день, кг">
          <input name="dailyYield" inputMode="decimal" required className="field field-on-light" />
        </Field>
        <Field label="Жир, %">
          <input name="fatPercent" inputMode="decimal" className="field field-on-light" />
        </Field>
        <Field label="Белок, %">
          <input name="proteinPercent" inputMode="decimal" className="field field-on-light" />
        </Field>
        <Field label="Соматические клетки, тыс./мл">
          <input name="somaticCells" inputMode="decimal" className="field field-on-light" />
        </Field>
      </FormShell>
    </form>
  )
}

/* ------------- Запуск, перемещение, выбытие (лента) --------------- */

function SimpleEventForm({
  kind,
  date,
  setDate,
  onBack,
  onRepeat,
  herds,
  disposalReasons,
}: FormProps & { kind: 'dryOff' | 'move' | 'disposal'; herds: Choice[]; disposalReasons: Choice[] }) {
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(addEventAction, {})

  const title = kind === 'dryOff' ? 'Запуск' : kind === 'move' ? 'Перемещение' : 'Выбытие'
  const hint =
    kind === 'disposal'
      ? 'Выбытие меняет и состояние в карточке: «выбыло» в ленте при «в стаде» в карточке — не два мнения, а поломка.'
      : kind === 'move'
        ? 'Перемещение меняет стадо в карточке.'
        : undefined

  return (
    <form
      action={(fd) => {
        keepDate(fd, setDate)
        formAction(fd)
      }}
    >
      <input type="hidden" name="type" value={kind} />

      <FormShell
        title={title}
        hint={hint}
        pending={pending}
        state={state}
        onBack={onBack}
        onRepeat={onRepeat}
      >
        <AnimalPicker
          name="animal"
          label="Животное"
          sex={kind === 'dryOff' ? 'female' : undefined}
          required
        />
        <Field label="Дата">
          <DateField name="date" defaultValue={date} required max={today()} />
        </Field>

        {kind === 'move' && (
          <SelectField label="Новое стадо">
            <Select name="herd" options={herds} placeholder="Выберите стадо" onLight />
          </SelectField>
        )}

        {kind === 'disposal' && (
          <>
            <SelectField label="Что произошло">
              <Select name="state" options={DISPOSAL_STATES} placeholder="Продано" onLight />
            </SelectField>
            <SelectField label="Причина выбытия">
              <Select name="disposalReason" options={disposalReasons} placeholder="Не указана" onLight />
            </SelectField>
          </>
        )}

        <div className="sm:col-span-2">
          <Field label="Комментарий">
            <textarea name="comment" rows={2} className="field field-on-light" />
          </Field>
        </div>
      </FormShell>
    </form>
  )
}
