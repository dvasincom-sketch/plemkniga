'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getClient } from '@/lib/payload'

const COOKIE = 'payload-token'

const setAuthCookie = async (token: string, exp?: number) => {
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: exp ? new Date(exp * 1000) : undefined,
  })
}

export type AuthState = { error?: string; ok?: boolean }

/**
 * Куда вернуть человека после входа.
 *
 * Принимаем только внутренние пути: значение приходит из адресной строки,
 * и «//evil.example» браузер считает внешним адресом. Открытый редирект
 * на форме входа — классический способ увести чужую сессию.
 */
const safeNext = (raw: FormDataEntryValue | null): string => {
  const v = String(raw || '')
  return v.startsWith('/') && !v.startsWith('//') ? v : '/account'
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  if (!email || !password) return { error: 'Укажите e-mail и пароль' }

  try {
    const payload = await getClient()
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    if (!result.token) return { error: 'Не удалось войти. Попробуйте ещё раз.' }
    await setAuthCookie(result.token, result.exp)
  } catch {
    return { error: 'Неверный e-mail или пароль' }
  }

  redirect(safeNext(formData.get('next')))
}

export type RegisterPayload = {
  role: 'farmer' | 'service' | 'individual'
  orgName: string
  inn: string
  region: string
  address: string
  lastName: string
  firstName: string
  middleName: string
  position: string
  phone: string
  email: string
  password: string
  acceptedPolicy: boolean
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const get = (k: string) => String(formData.get(k) || '').trim()

  const email = get('email')
  const password = get('password')
  const passwordConfirm = get('passwordConfirm')
  const role = (get('role') || 'farmer') as RegisterPayload['role']

  if (!email || !password) return { error: 'Укажите e-mail и пароль' }
  if (password.length < 8) return { error: 'Пароль должен быть не короче 8 символов' }
  if (password !== passwordConfirm) return { error: 'Пароли не совпадают' }
  if (formData.get('acceptedPolicy') !== 'on')
    return { error: 'Необходимо согласие на обработку персональных данных' }

  const payload = await getClient()

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) return { error: 'Пользователь с таким e-mail уже зарегистрирован' }

  let organizationId: number | undefined

  const orgName = get('orgName')
  if (orgName) {
    const org = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: {
        name: orgName,
        shortName: orgName,
        type: role === 'service' ? 'service' : role === 'individual' ? 'individual' : 'farm',
        inn: get('inn') || undefined,
        region: (get('region') || undefined) as never,
        address: get('address') || undefined,
        phone: get('phone') || undefined,
        email,
        membership: 'pending',
      },
    })
    organizationId = org.id as number
  }

  try {
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email,
        password,
        role,
        lastName: get('lastName') || '—',
        firstName: get('firstName') || '—',
        middleName: get('middleName') || undefined,
        phone: get('phone') || undefined,
        position: get('position') || undefined,
        organization: organizationId,
        acceptedPolicy: true,
        confirmed: false,
      },
    })

    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    if (result.token) await setAuthCookie(result.token, result.exp)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось создать пользователя' }
  }

  redirect(safeNext(formData.get('next')))
}

export async function logoutAction() {
  const jar = await cookies()
  jar.delete(COOKIE)
  redirect('/')
}
