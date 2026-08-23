'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useActionState } from 'react'
import { createAnimalAction, type AnimalFormState } from '@/actions/animals'
import { AGE_GROUPS, ANIMAL_KINDS, ID_FORMATS, SEXES } from '@/lib/dictionaries'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'
import { ParentNumber } from '@/components/ParentNumber'
import { AnimalPicker } from '@/components/AnimalPicker'

type Opt = { id: number; name: string }

/**
 * Заведение животного — сначала вопрос «кто это».
 *
 * ## Почему одной формы было мало
 *
 * Форма была одна на все случаи: пятнадцать полей паспорта и происхождения.
 * Но случая три, и они несопоставимы по тому, что человек про животное
 * знает.
 *
 * Телёнок родился здесь: мать стоит в этом же стаде, отец — тот, кем её
 * осеменяли, и оба уже есть в книге. Купленная нетель приехала со
 * свидетельством, и о её родителях известно ровно то, что на бумаге.
 * Бык-производитель — третий случай со своим набором.
 *
 * Одна форма на троих означала худший из вариантов для каждого.
 *
 * ## Что это чинит помимо удобства
 *
 * Главное здесь не число полей, а происхождение телёнка. Раньше мать,
 * которая стоит в соседнем деннике и лежит в нашей же базе, приходилось
 * **переписывать номером в текстовое поле**, и настоящая связь возникала
 * потом, отдельным скриптом (решение №11). То есть система своими руками
 * порождала ровно тот класс ошибок, который потом ловит проверка
 * `pedigree-text-mismatch`: две записи об одном факте, которые могут
 * разойтись.
 *
 * Теперь у случая «родился у меня» родители выбираются из стада, и в базу
 * идёт связь, а не строка. Переписывать номера остаётся только там, где
 * иначе нельзя, — у купленного животного, чьи родители в чужом хозяйстве.
 *
 * ## Почему форма всё равно короткая
 *
 * Полная карточка — под две сотни полей. Предъявить их человеку, который
 * заводит одно животное, значит гарантированно получить пустую карточку
 * и брошенную форму. Остальное дозаполняется на самой карточке по блокам,
 * когда появится, чем заполнять.
 */

const asOptions = (list: readonly { value: string; label: string }[]) =>
  list.map((o) => ({ value: o.value, label: o.label }))

const fromRefs = (list: Opt[]) => list.map((o) => ({ value: String(o.id), label: o.name }))

export type Scenario = 'born' | 'bought' | 'bull'

const SCENARIOS: { key: Scenario; label: string; hint: string }[] = [
  {
    key: 'born',
    label: 'Родился у меня',
    hint: 'Мать и отца выберете из стада — переписывать номера не придётся',
  },
  {
    key: 'bought',
    label: 'Купил или получил',
    hint: 'Паспорт и происхождение переписываются со свидетельства',
  },
  {
    key: 'bull',
    label: 'Бык-производитель',
    hint: 'Отдельный случай: своё стадо он не пополняет, а обслуживает',
  },
]

/** Поля, которые форма отправляет. По ним действие понимает, что пришло. */
const FIELDS: Record<Scenario, string[]> = {
  born: [
    'name',
    'sex',
    'kind',
    'ageGroup',
    'birthDate',
    'breed',
    'herd',
    'bloodPercent',
    'altIds.earTag',
    'father',
    'mother',
    'notes',
  ],
  bought: [
    'idFormat',
    'name',
    'sex',
    'kind',
    'ageGroup',
    'birthDate',
    'breed',
    'herd',
    'bloodPercent',
    'altIds.earTag',
    'pedigreeText.fatherId',
    'pedigreeText.fatherName',
    'pedigreeText.motherId',
    'pedigreeText.motherName',
    'notes',
  ],
  bull: [
    'idFormat',
    'name',
    'sex',
    'kind',
    'birthDate',
    'breed',
    'bloodPercent',
    'altIds.earTag',
    'pedigreeText.fatherId',
    'pedigreeText.fatherName',
    'pedigreeText.motherId',
    'pedigreeText.motherName',
    'notes',
  ],
}

const today = () => new Date().toISOString().slice(0, 10)

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

export function NewAnimalForm({
  breeds,
  herds,
  initialScenario,
}: {
  breeds: Opt[]
  herds: Opt[]
  initialScenario?: Scenario
}) {
  const [scenario, setScenario] = useState<Scenario | null>(initialScenario ?? null)
  const [state, formAction, pending] = useActionState<AnimalFormState, FormData>(
    createAnimalAction,
    {},
  )

  /* ------------------------- Уже завели ------------------------- */

  if (state.createdId) {
    return (
      <div className="card">
        <h2 className="panel-heading">Карточка создана</h2>
        <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Уровень достоверности — «черновик»: подтверждают данные проверкой пакета или
          решением ассоциации, а не самим фактом ввода.
        </p>
        {/*
           Продолжений три, и они названы делами, а не разделами. «Открыть
           карточку» — не ответ на вопрос «что дальше»: человек завёл животное
           не ради карточки, а чтобы книга о нём знала, и следующий шаг —
           проверить и подтвердить.
        */}
        <div className="flex flex-wrap gap-3">
          <Link href={`/animals/${state.createdId}`} className="btn btn-accent">
            Открыть карточку
          </Link>
          <Link href="/account/animals/new" className="btn">
            Завести ещё одно
          </Link>
          <Link href="/account/checks/herd" className="btn">
            Проверить записи
          </Link>
          <Link href="/account/verification" className="btn">
            Подать на верификацию
          </Link>
        </div>
      </div>
    )
  }

  /* --------------------------- Дубль ---------------------------- */

  if (state.duplicate) {
    const d = state.duplicate
    return (
      <div className="card">
        <h2 className="panel-heading">Такое животное уже есть в книге</h2>
        <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Номер {d.identNumber} записан за {d.mine ? 'вашим хозяйством' : d.owner}. Одно
          животное — одна карточка: у неё меняется владелец, а не заводится вторая с той же
          биркой.{' '}
          {d.mine
            ? 'Откройте существующую и поправьте, что нужно.'
            : 'Если животное перешло к вам, запросите доступ у владельца — передача оформляется на его стороне.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/animals/${d.id}`} className="btn btn-accent">
            {d.mine ? 'Открыть карточку' : 'Посмотреть запись и запросить доступ'}
          </Link>
          <Link href="/account/animals/new" className="btn">
            Ввести другой номер
          </Link>
        </div>
      </div>
    )
  }

  /* ---------------------- Выбор сценария ------------------------ */

  if (!scenario) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScenario(s.key)}
            className="card text-left transition-colors hover:bg-[#fafafa]"
          >
            <span className="block text-[18px] font-medium">{s.label}</span>
            <span className="mt-1 block text-[13px] leading-snug text-ink-500">{s.hint}</span>
          </button>
        ))}
      </div>
    )
  }

  const spec = SCENARIOS.find((s) => s.key === scenario)!
  const isBull = scenario === 'bull'
  const isBorn = scenario === 'born'

  return (
    <form action={formAction} className="card">
      <input type="hidden" name="fields" value={FIELDS[scenario].join(',')} />
      {isBull && <input type="hidden" name="sex" value="male" />}
      {isBorn && <input type="hidden" name="ageGroup" value="calf" />}

      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="panel-heading !mb-0">{spec.label}</h2>
        <button
          type="button"
          onClick={() => setScenario(null)}
          className="text-[14px] text-ink-500 underline underline-offset-4"
        >
          другой случай
        </button>
      </div>

      {/* --------------------------- Паспорт --------------------------- */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Индивидуальный номер">
          <input name="identNumber" required autoComplete="off" className="field field-on-light" />
        </Field>

        {!isBorn && (
          <SelectField label="Формат номера">
            <Select
              name="idFormat"
              options={asOptions(ID_FORMATS)}
              defaultValue="rf"
              placeholder=""
              onLight
            />
          </SelectField>
        )}

        <Field label="Кличка">
          <input name="name" className="field field-on-light" />
        </Field>

        <Field label="Номер ушной бирки">
          <input name="altIds.earTag" className="field field-on-light" />
        </Field>

        {!isBull && (
          <SelectField label="Пол">
            <Select
              name="sex"
              options={SEXES.map((s) => ({ value: s.value, label: s.full }))}
              placeholder="Выберите пол"
              onLight
            />
          </SelectField>
        )}

        <Field label="Дата рождения">
          <DateField name="birthDate" required max={today()} />
        </Field>

        <SelectField label="Порода">
          <Select name="breed" options={fromRefs(breeds)} placeholder="Не указана" onLight />
        </SelectField>

        <Field label="Кровность по голштину, %">
          <input name="bloodPercent" inputMode="decimal" className="field field-on-light" />
        </Field>

        {!isBull && (
          <>
            <SelectField label="Стадо">
              <Select name="herd" options={fromRefs(herds)} placeholder="Не указано" onLight />
            </SelectField>
            {!isBorn && (
              <SelectField label="Возрастная группа">
                <Select
                  name="ageGroup"
                  options={asOptions(AGE_GROUPS)}
                  placeholder="Не указана"
                  onLight
                />
              </SelectField>
            )}
          </>
        )}

        <SelectField label="Тип животного">
          <Select name="kind" options={asOptions(ANIMAL_KINDS)} placeholder="Не указан" onLight />
        </SelectField>
      </div>

      {/* ------------------------ Происхождение ------------------------ */}

      <h3 className="panel-heading mt-8">Происхождение</h3>

      {isBorn ? (
        <>
          <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
            Родители выбираются из вашего стада, и в книгу идёт связь, а не переписанный
            номер. Это единственный способ, при котором родословная не разойдётся
            с документами: разойтись нечему.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AnimalPicker
              name="mother"
              label="Мать"
              sex="female"
              hint="Корова или тёлка вашего стада"
            />
            <AnimalPicker
              name="father"
              label="Отец"
              sex="male"
              hint="Если осеменяли привозным семенем, оставьте пустым и допишите на карточке"
            />
          </div>
        </>
      ) : (
        <>
          <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
            Номера переписываются со свидетельства. Если предок уже есть в книге, связь
            установится по номеру — проверка идёт по ходу ввода.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ParentNumber name="pedigreeText.fatherId" label="Отец, инд. №" />
            <Field label="Отец, кличка">
              <input name="pedigreeText.fatherName" className="field field-on-light" />
            </Field>
            <ParentNumber name="pedigreeText.motherId" label="Мать, инд. №" />
            <Field label="Мать, кличка">
              <input name="pedigreeText.motherName" className="field field-on-light" />
            </Field>
          </div>
        </>
      )}

      <div className="mt-6">
        <Field label="Примечание">
          <textarea name="notes" rows={3} className="field field-on-light" />
        </Field>
      </div>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      <div className="mt-6">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Заводим…' : 'Завести карточку'}
        </button>
      </div>
    </form>
  )
}
