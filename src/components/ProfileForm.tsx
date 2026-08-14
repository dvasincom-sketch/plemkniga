'use client'

import { useActionState } from 'react'
import { updateProfileAction, type FormState } from '@/actions/account'

const label = 'mb-1.5 block text-sm text-ink-700'

type Props = {
  user: {
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
}

export function ProfileForm({ user, org, roleLabel }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfileAction,
    {},
  )

  return (
    <form action={formAction} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card">
        <h3 className="panel-heading">Пользователь</h3>
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
            <span className={label}>Должность</span>
            <input name="position" defaultValue={user.position ?? ''} className="field field-on-light" />
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

      <div className="lg:col-span-2">
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
