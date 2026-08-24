'use client'

import { useActionState } from 'react'
import { updateProfileAction, type FormState } from '@/actions/account'

const label = 'mb-1.5 block text-sm text-ink-700'

type Props = {
  user: {
    notifySubmissions?: boolean | null
    notifyTrust?: boolean | null
    notifyNews?: boolean | null
    lastName?: string | null
    firstName?: string | null
    middleName?: string | null
    phone?: string | null
    position?: string | null
    email: string
    role?: string | null
  }
  org?: {
    name?: string | null
    inn?: string | null
    address?: string | null
    phone?: string | null
    region?: string | null
    membership?: string | null
  } | null
  roleLabel: string
  /**
   * Какую часть профиля показывать. Профиль разбит на вкладки, и каждая
   * отправляет только свои поля — действие сохранения обновляет ровно то,
   * что пришло.
   */
  section: 'user' | 'org' | 'notifications'
}

export function ProfileForm({ user, org, roleLabel, section }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfileAction,
    {},
  )

  return (
    <form action={formAction} className="grid grid-cols-1 gap-6">
      {section === 'user' && (
      <div className="card">
        <h3 className="panel-heading">Персональные данные</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={label}>Фамилия</span>
            <input name="lastName" defaultValue={user.lastName ?? ''} className="field field-on-light" />
          </label>
          <label>
            <span className={label}>Имя</span>
            <input name="firstName" defaultValue={user.firstName ?? ''} className="field field-on-light" />
          </label>
          <label>
            <span className={label}>Отчество</span>
            <input name="middleName" defaultValue={user.middleName ?? ''} className="field field-on-light" />
          </label>
          <label>
            {/*
               Подпись под полем говорит, чего должность НЕ делает.
               Слово «зоотехник» стоит и здесь, свободным текстом, и среди
               прав в хозяйстве — как одно из трёх значений. Пока никто
               не сказал обратного, естественно решить, что, написав здесь
               «зоотехник», человек получает права зоотехника.
            */}
            <span className={label}>Должность</span>
            <input name="position" defaultValue={user.position ?? ''} className="field field-on-light" />
            <span className="mt-1 block text-[12px] leading-snug text-ink-500">
              Как называется работа. На права в системе не влияет — их даёт
              руководитель на странице «Сотрудники».
            </span>
          </label>
          <label>
            <span className={label}>Телефон</span>
            <input name="phone" defaultValue={user.phone ?? ''} className="field field-on-light" />
          </label>
          <label>
            <span className={label}>E-mail (логин)</span>
            <input defaultValue={user.email} disabled className="field field-on-light opacity-70" />
          </label>
        </div>
        <p className="mt-4 text-sm text-ink-500">
          Роль в системе: <span className="text-ink-900">{roleLabel}</span>
        </p>
      </div>
      )}

      {section === 'notifications' && (
      <div className="card">
        <input type="hidden" name="notificationsForm" value="1" />
        <h3 className="panel-heading">Что присылать на почту</h3>
        <p className="mb-5 max-w-[70ch] text-sm leading-relaxed text-ink-700">
          Рассылка включится вместе с почтовым адаптером — сейчас письма пишутся в журнал
          сервера. Выбор сохраняется уже сейчас, чтобы потом не спрашивать согласие задним числом.
        </p>
        <div className="space-y-3">
          {[
            {
              name: 'notifySubmissions',
              label: 'Проверка пакетов данных',
              hint: 'Пакет принят, проверен или отклонён Ассоциацией',
              checked: user.notifySubmissions ?? true,
            },
            {
              name: 'notifyTrust',
              label: 'Изменение уровня достоверности',
              hint: 'Запись подтверждена лабораторией или верифицирована Ассоциацией',
              checked: user.notifyTrust ?? true,
            },
            {
              name: 'notifyNews',
              label: 'Сообщения Ассоциации',
              hint: 'Изменения правил, сроки релизов оценок, объявления',
              checked: user.notifyNews ?? false,
            },
          ].map((n) => (
            <label key={n.name} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name={n.name}
                defaultChecked={n.checked}
                className="checkbox mt-0.5"
              />
              <span>
                <span className="block text-[15px]">{n.label}</span>
                <span className="block text-[13px] leading-snug text-ink-500">{n.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      )}

      {section === 'org' && (
      <div className="card">
        <h3 className="panel-heading">Организация</h3>
        {org ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>Наименование</span>
              <input name="orgName" defaultValue={org.name ?? ''} className="field field-on-light" />
            </label>
            <label>
              <span className={label}>ИНН</span>
              <input name="inn" defaultValue={org.inn ?? ''} className="field field-on-light" />
            </label>
            <label>
              <span className={label}>Телефон</span>
              <input name="orgPhone" defaultValue={org.phone ?? ''} className="field field-on-light" />
            </label>
            <label className="sm:col-span-2">
              <span className={label}>Адрес</span>
              <input name="address" defaultValue={org.address ?? ''} className="field field-on-light" />
            </label>
            <p className="text-sm text-ink-500 sm:col-span-2">
              Регион: <span className="text-ink-900">{org.region || '—'}</span> · Членство:{' '}
              <span className="text-ink-900">
                {org.membership === 'member'
                  ? 'действующий член'
                  : org.membership === 'pending'
                    ? 'заявка на рассмотрении'
                    : 'не является членом'}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Организация не привязана.</p>
        )}
      </div>
      )}

      <div>
        {state.error && (
          <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        )}
        {state.message && (
          <p className="mb-3 rounded-lg bg-brand-50 px-4 py-3 text-sm text-forest-600">
            {state.message}
          </p>
        )}
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
      </div>
    </form>
  )
}
