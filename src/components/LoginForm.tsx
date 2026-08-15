'use client'

import { useActionState } from 'react'
import { loginAction, type AuthState } from '@/actions/auth'

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(loginAction, {})

  return (
    <form action={formAction} className="space-y-4">
      {/* Возврат туда, откуда пришли: вход чаще всего не цель, а препятствие */}
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-700">E-mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="field field-on-light"
          placeholder="zootech@example.ru"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-700">Пароль</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field field-on-light"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <button type="submit" className="btn btn-accent w-full" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  )
}
