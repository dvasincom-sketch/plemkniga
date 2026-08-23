'use client'

import { useActionState, useState } from 'react'
import {
  blockUserAction,
  changeOrgRoleAction,
  inviteMemberAction,
  revokeInviteAction,
  type TeamFormState,
} from '@/actions/team'
import { ORG_ROLES, orgRoleLabel, type OrgRole } from '@/lib/roles'
import { INVITE_STATE_LABEL, type InviteState } from '@/lib/invitations'
import { Select } from '@/components/Select'

export type Member = {
  id: number
  name: string
  email: string
  orgRole: OrgRole
  position: string | null
  confirmed: boolean
  blockedAt: string | null
  blockReason: string | null
  /** Это я — себе роль не меняют и себя не блокируют. */
  self: boolean
}

export type Invite = {
  id: number
  email: string
  orgRole: OrgRole
  state: InviteState
  expiresAt: string
  note: string | null
}

/**
 * Сотрудники хозяйства.
 *
 * ## Почему роль показана всем, а не только руководителю
 *
 * Зоотехник, которому отказали в оформлении продажи, должен понимать
 * причину без звонка: он видит, что у него роль «Зоотехник», и видит,
 * что она значит. Отказ без объяснения читается как поломка системы,
 * и человек идёт не к руководителю, а в поддержку.
 *
 * ## Почему приглашение показывает ссылку, а не «письмо отправлено»
 *
 * Почтового адаптера в системе нет. Написать «мы отправили письмо» было бы
 * прямой неправдой, а промолчать — оставить человека ждать письма, которого
 * не будет. Ссылка отдаётся так же, как у ссылок на просмотр: хозяйство
 * перешлёт её тем способом, которым уже общается с этим человеком.
 */
export function TeamPanel({
  members,
  invites,
  canManage,
}: {
  members: Member[]
  invites: Invite[]
  canManage: boolean
}) {
  return (
    <>
      <section className="card mt-8">
        <h2 className="panel-heading">Кто работает в хозяйстве</h2>

        <ul className="divide-y divide-[#e6e6e6]">
          {members.map((m) => (
            <li key={m.id} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-[17px] font-medium">
                  {m.name}
                  {m.self && <span className="ml-2 text-[13px] text-ink-500">это вы</span>}
                </span>
                <span className="text-[14px] text-ink-500">{m.email}</span>
                {m.position && <span className="text-[14px] text-ink-500">{m.position}</span>}
              </div>

              <p className="mt-1 text-[13px] text-ink-500">
                {orgRoleLabel(m.orgRole)}
                {' · '}
                {ORG_ROLES.find((r) => r.value === m.orgRole)?.hint}
                {!m.confirmed && ' · учётная запись ещё не подтверждена Ассоциацией'}
              </p>

              {m.blockedAt && (
                <p className="mt-2 max-w-[70ch] rounded-md bg-[#f6f6f6] p-3 text-[13px] leading-snug text-ink-700">
                  Заблокирован{m.blockReason ? `: ${m.blockReason}` : ''}. Войти в систему
                  не может; всё, что он записал, остаётся подписанным его именем.
                </p>
              )}

              {canManage && !m.self && (
                <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-4">
                  <RoleForm id={m.id} current={m.orgRole} />
                  <BlockForm id={m.id} blocked={Boolean(m.blockedAt)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && <InviteForm />}

      {invites.length > 0 && (
        <section className="card mt-6">
          <h2 className="panel-heading">Приглашения</h2>
          <div className="overflow-x-auto">
            <table className="metric-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Кому</th>
                  <th>Роль</th>
                  <th>Состояние</th>
                  <th>Срок</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.email}
                      {i.note && <span className="block text-[13px] text-ink-500">{i.note}</span>}
                    </td>
                    <td className="text-ink-500">{orgRoleLabel(i.orgRole)}</td>
                    <td className={i.state === 'active' ? '' : 'text-ink-500'}>
                      {INVITE_STATE_LABEL[i.state]}
                    </td>
                    <td className="whitespace-nowrap text-ink-500 tabular-nums">
                      {new Date(i.expiresAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td>
                      {canManage && i.state === 'active' && <RevokeInvite id={i.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function RoleForm({ id, current }: { id: number; current: OrgRole }) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(
    changeOrgRoleAction,
    {},
  )

  return (
    <form action={formAction} className="text-[14px]">
      <span className="block">Роль</span>
      <input type="hidden" name="user" value={id} />
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <Select
          name="orgRole"
          ariaLabel="Роль в хозяйстве"
          onLight
          placeholder=""
          defaultValue={current}
          className="min-w-[200px]"
          options={ORG_ROLES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <button type="submit" disabled={pending} className="btn btn-brand">
          {pending ? 'Меняем…' : 'Сменить'}
        </button>
      </div>
      {state.error && <p className="mt-2 text-[13px] text-red-700">{state.error}</p>}
      {state.message && <p className="mt-2 text-[13px] text-forest-600">{state.message}</p>}
    </form>
  )
}

/**
 * Блокировка требует причины, и это не формальность.
 *
 * Причину увидит сам заблокированный при попытке войти. Без неё человек
 * узнаёт только то, что его не пускают, — и звонит выяснять вместо того,
 * чтобы исправить то, из-за чего его заблокировали.
 */
function BlockForm({ id, blocked }: { id: number; blocked: boolean }) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(blockUserAction, {})
  const [open, setOpen] = useState(false)

  if (blocked) {
    return (
      <form action={formAction} className="text-[14px]">
        <input type="hidden" name="user" value={id} />
        <input type="hidden" name="unblock" value="1" />
        <button type="submit" disabled={pending} className="btn btn-brand mt-[26px]">
          {pending ? 'Снимаем…' : 'Снять блокировку'}
        </button>
        {state.error && <p className="mt-2 text-[13px] text-red-700">{state.error}</p>}
      </form>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-[30px] text-[14px] underline underline-offset-4 hover:text-[#c0392b]"
      >
        Заблокировать
      </button>
    )
  }

  return (
    <form action={formAction} className="max-w-[40ch] text-[14px]">
      <span className="block">Причина блокировки</span>
      <input type="hidden" name="user" value={id} />
      <input
        name="reason"
        required
        minLength={3}
        placeholder="Уволен 20 августа"
        className="field field-on-light mt-1.5 block w-full"
      />
      <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
        Человек увидит её при попытке войти.
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-accent">
          {pending ? 'Блокируем…' : 'Заблокировать'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] underline underline-offset-4"
        >
          отмена
        </button>
      </div>
      {state.error && <p className="mt-2 text-[13px] text-red-700">{state.error}</p>}
    </form>
  )
}

function RevokeInvite({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(
    revokeInviteAction,
    {},
  )

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-[14px] underline underline-offset-4 hover:text-[#c0392b]"
      >
        {pending ? 'Отзываем…' : 'Отозвать'}
      </button>
      {state.error && <span className="ml-2 text-[13px] text-red-700">{state.error}</span>}
    </form>
  )
}

function InviteForm() {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(
    inviteMemberAction,
    {},
  )

  return (
    <form action={formAction} className="card mt-6">
      <h2 className="panel-heading">Пригласить сотрудника</h2>

      <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        Пароль человек задаст сам — в этом смысл приглашения: пароль, который знают
        двое, не пароль. Подтверждать его в Ассоциации не нужно: за него ручаетесь вы.
      </p>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <label className="block text-[14px]">
          Почта
          <input
            name="email"
            type="email"
            required
            placeholder="zootehnik@example.ru"
            className="field field-on-light mt-1.5 block w-full max-w-[32ch]"
          />
        </label>

        <label className="block text-[14px]">
          Роль
          <Select
            name="orgRole"
            ariaLabel="Роль приглашаемого"
            onLight
            placeholder=""
            defaultValue="operator"
            className="mt-1.5 min-w-[200px]"
            options={ORG_ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </label>

        <label className="block text-[14px]">
          Для кого
          <input
            name="note"
            placeholder="Иванов, зоотехник второй фермы"
            className="field field-on-light mt-1.5 block w-full max-w-[32ch]"
          />
          <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
            Видно только вам — чтобы через месяц вспомнить, кому выдали.
          </span>
        </label>
      </div>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      {state.message && state.url && (
        <div className="mt-4 rounded-md bg-brand-50 p-4">
          <p className="text-[14px] font-medium text-forest-600">{state.message}</p>
          <input
            readOnly
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
            className="field field-on-light mt-3 w-full font-mono text-[13px]"
          />
          <p className="mt-2 text-[13px] leading-snug text-ink-500">
            Отправьте адрес человеку сами: писем система пока не шлёт. Кто откроет
            ссылку — тот и заведёт учётную запись в вашем хозяйстве, поэтому отправляйте
            её только тому, кому она предназначена.
          </p>
        </div>
      )}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Выпускаем…' : 'Пригласить'}
      </button>
    </form>
  )
}
