'use client'

import { useActionState } from 'react'
import { acceptInviteAction, type TeamFormState } from '@/actions/team'
import { orgRoleLabel } from '@/lib/roles'

/**
 * Принятие приглашения.
 *
 * ## Почему почта не редактируется
 *
 * Она приходит из приглашения и показана только для того, чтобы человек
 * убедился, что попал по адресу. Разреши её менять — и пересланную ссылку
 * можно было бы принять на любую другую почту, то есть войти в чужое
 * хозяйство по чужому приглашению.
 *
 * ## Почему форма короткая
 *
 * Здесь спрашивается ровно то, чего система знать не может: как человека
 * зовут и какой пароль он себе выбрал. Хозяйство, роль и почта уже известны
 * из приглашения, и переспрашивать их значило бы предлагать исправить —
 * а исправлять их тут нельзя.
 */
export function AcceptInvite({
  token,
  email,
  organizationName,
  orgRole,
}: {
  token: string
  email: string
  organizationName: string
  orgRole: string
}) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(
    acceptInviteAction,
    {},
  )

  return (
    <form action={formAction} className="card mt-8 max-w-[46rem]">
      <input type="hidden" name="token" value={token} />

      <h2 className="panel-heading">Ваши данные</h2>

      <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        Учётная запись заводится на почту <span className="font-medium">{email}</span> в
        хозяйстве «{organizationName}», роль — {orgRoleLabel(orgRole)}. Пароль вы задаёте
        сами: его не знает ни хозяйство, ни Ассоциация.
      </p>

      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <label className="block text-[14px]">
          Фамилия
          <input
            name="lastName"
            required
            className="field field-on-light mt-1.5 block w-full max-w-[24ch]"
          />
        </label>
        <label className="block text-[14px]">
          Имя
          <input
            name="firstName"
            required
            className="field field-on-light mt-1.5 block w-full max-w-[24ch]"
          />
        </label>
        <label className="block text-[14px]">
          Отчество
          <input
            name="middleName"
            className="field field-on-light mt-1.5 block w-full max-w-[24ch]"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">
        <label className="block text-[14px]">
          Должность
          <input
            name="position"
            placeholder="Зоотехник-селекционер"
            className="field field-on-light mt-1.5 block w-full max-w-[28ch]"
          />
        </label>
        <label className="block text-[14px]">
          Телефон
          <input name="phone" className="field field-on-light mt-1.5 block w-full max-w-[24ch]" />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">
        <label className="block text-[14px]">
          Пароль
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="field field-on-light mt-1.5 block w-full max-w-[28ch]"
          />
          <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
            Не короче восьми символов.
          </span>
        </label>
        <label className="block text-[14px]">
          Ещё раз
          <input
            name="passwordConfirm"
            type="password"
            required
            minLength={8}
            className="field field-on-light mt-1.5 block w-full max-w-[28ch]"
          />
        </label>
      </div>

      <label className="mt-5 flex items-start gap-3 text-[14px]">
        <input type="checkbox" name="acceptedPolicy" className="checkbox mt-0.5" required />
        <span>Согласен на обработку персональных данных</span>
      </label>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Заводим…' : 'Завести учётную запись'}
      </button>
    </form>
  )
}
