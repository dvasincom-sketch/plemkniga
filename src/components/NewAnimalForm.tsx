'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createAnimalAction, type AnimalFormState } from '@/actions/animals'
import { AGE_GROUPS, ANIMAL_KINDS, ID_FORMATS, SEXES } from '@/lib/dictionaries'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'
import { ParentNumber } from '@/components/ParentNumber'

type Opt = { id: number; name: string }

/**
 * Списки здесь — свой `Select`, а не нативный `<select>`.
 *
 * Дело не только в единообразии. Нативный список каждая система рисует
 * по-своему: на Windows это узкая серая полоса, на macOS — всплывающее меню
 * в стиле системы, на телефоне — колесо во весь экран. Форма из десяти полей
 * получалась собранной из двух разных наборов элементов, и это заметно
 * даже тому, кто не думает про интерфейсы.
 *
 * Свой компонент к тому же умеет то, чего у нативного нет: поиск по первым
 * буквам работает одинаково везде, а не по правилам системы.
 *
 * Обратная сторона — пустое значение не отправляется вовсе, тогда как
 * нативный список прислал бы пустую строку. Для этой формы разницы нет:
 * `collectFromForm` пропускает отсутствующие поля, и незаполненная порода
 * означает «не указана» одинаково в обоих случаях.
 */
const asOptions = (list: readonly { value: string; label: string }[]) =>
  list.map((o) => ({ value: o.value, label: o.label }))

const fromRefs = (list: Opt[]) => list.map((o) => ({ value: String(o.id), label: o.name }))

/**
 * Заведение животного вручную.
 *
 * Форма намеренно короткая. Полная карточка — это под две сотни полей,
 * и предъявлять их человеку, который вводит одно купленное животное,
 * значит гарантированно получить пустую карточку и брошенную форму.
 * Здесь спрашивается паспорт и происхождение — то, что переписывают
 * со свидетельства, — а остальное дозаполняется на самой карточке
 * по блокам, когда появится, чем заполнять.
 */
export function NewAnimalForm({ breeds, herds }: { breeds: Opt[]; herds: Opt[] }) {
  const [state, formAction, pending] = useActionState<AnimalFormState, FormData>(
    createAnimalAction,
    {},
  )

  // Поля перечисляются явно: по этому списку действие понимает, что пришло
  // из формы, а чего в ней не было вовсе
  const FIELDS = [
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
  ].join(',')

  if (state.createdId) {
    return (
      <div className="card">
        <h2 className="panel-heading">Карточка создана</h2>
        <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Уровень достоверности — «черновик»: подтверждают данные проверкой пакета или
          решением ассоциации, а не самим фактом ввода.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/animals/${state.createdId}`} className="btn btn-accent">
            Открыть карточку
          </Link>
          <Link href="/account/animals/new" className="btn">
            Завести ещё одно
          </Link>
        </div>
      </div>
    )
  }

  /*
   * Дубль по номеру — не ошибка ввода, а обычное дело: животное купили,
   * и карточка на него уже заведена прежним хозяйством. Второй такой же
   * заводить нельзя — одно животное, одна карточка, — поэтому вместо
   * «номер занят» показывается сама запись.
   */
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

  return (
    <form action={formAction} className="card">
      <input type="hidden" name="fields" value={FIELDS} />

      <h2 className="panel-heading">Паспорт</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Индивидуальный №</span>
          <input
            name="identNumber"
            required
            autoFocus
            className="field field-on-light"
            placeholder="Например: 112233445566778"
          />
        </label>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Формат номера</span>
          <Select
            name="idFormat"
            options={asOptions(ID_FORMATS)}
            defaultValue="rf"
            placeholder=""
            onLight
            ariaLabel="Формат номера"
          />
        </div>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Кличка</span>
          <input name="name" className="field field-on-light" />
        </label>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Номер ушной бирки</span>
          <input name="altIds.earTag" className="field field-on-light" />
        </label>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Пол</span>
          <Select
            name="sex"
            // В справочнике `label` — однобуквенное «Ж»/«М» для таблиц,
            // человеку в форме нужно полное слово
            options={SEXES.map((o) => ({ value: o.value, label: o.full }))}
            defaultValue="female"
            placeholder=""
            onLight
            ariaLabel="Пол"
          />
        </div>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Тип животного</span>
          <Select
            name="kind"
            options={asOptions(ANIMAL_KINDS)}
            defaultValue="cow"
            placeholder=""
            onLight
            ariaLabel="Тип животного"
          />
        </div>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Возрастная группа</span>
          <Select
            name="ageGroup"
            options={asOptions(AGE_GROUPS)}
            defaultValue="firstCalf"
            placeholder=""
            onLight
            ariaLabel="Возрастная группа"
          />
        </div>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Дата рождения</span>
          {/* Предел сверху: животное не может родиться завтра. Та же проверка
              стоит на сервере, здесь она только избавляет от лишней отправки */}
          <DateField
            name="birthDate"
            ariaLabel="Дата рождения"
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Порода</span>
          <Select
            name="breed"
            options={fromRefs(breeds)}
            placeholder="— не указана —"
            onLight
            ariaLabel="Порода"
          />
        </div>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Кровность по голштину, %</span>
          <input name="bloodPercent" inputMode="decimal" className="field field-on-light" />
        </label>

        <div className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Стадо</span>
          <Select
            name="herd"
            options={fromRefs(herds)}
            placeholder="— не указано —"
            onLight
            ariaLabel="Стадо"
          />
        </div>
      </div>

      <h2 className="panel-heading mt-8">Происхождение</h2>

      <p className="mb-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        Родителей записывайте так, как они стоят в свидетельстве. Если их карточки
        появятся в книге позже, связь установится по номеру — переписывать не придётся.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
          Номер родителя проверяется по книге прямо при вводе.

          Раньше два исхода выглядели одинаково: «карточки предка ещё нет,
          свяжется потом» и «в номере опечатка, не свяжется никогда».
          Второе обнаруживалось через месяцы, когда не строилась родословная.
        */}
        <ParentNumber
          name="pedigreeText.fatherId"
          label="Отец, инд. №"
          placeholder="Например: HOUSA000012345678"
        />
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Отец, кличка</span>
          <input name="pedigreeText.fatherName" className="field field-on-light" />
        </label>
        <ParentNumber
          name="pedigreeText.motherId"
          label="Мать, инд. №"
          placeholder="Например: 112233445566778"
        />
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Мать, кличка</span>
          <input name="pedigreeText.motherName" className="field field-on-light" />
        </label>
      </div>

      <label className="mt-6 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">
          Примечание <span className="text-ink-500">— необязательно</span>
        </span>
        <textarea name="notes" rows={3} className="field field-on-light" />
      </label>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Завести карточку'}
      </button>
    </form>
  )
}
