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

    /*
     * Заблокированному отказываем после проверки пароля, а не до неё.
     *
     * До проверки отказ означал бы, что по форме входа можно узнать,
     * какие учётные записи заблокированы, не зная пароля. После —
     * узнаёт только тот, кто и так владеет записью, и узнаёт заодно
     * причину: человек, которому не сказали, почему его не пускают,
     * идёт звонить и тратит чужое время вместо того, чтобы исправить
     * то, из-за чего его заблокировали.
     */
    const blocked = result.user as { blockedAt?: string | null; blockReason?: string | null }
    if (blocked?.blockedAt) {
      return {
        error: blocked.blockReason
          ? `Учётная запись заблокирована: ${blocked.blockReason}`
          : 'Учётная запись заблокирована. Обратитесь к руководителю хозяйства или в Ассоциацию.',
      }
    }

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
  /*
   * Роль сверяется со списком в рантайме, а не приведением типа.
   *
   * `as RegisterPayload['role']` существует только при сборке: серверное
   * действие — это обычный POST, и в поле `role` приходит то, что отправили.
   * Отправляли, разумеется, `admin`. Приведение типа выглядит как проверка
   * и ею не является — это худший вид защиты, потому что читается как
   * имеющаяся.
   *
   * Второй заслон стоит в самой коллекции: у поля `role` закрыт и `create`.
   * Оба нужны. Здесь — чтобы отказ был внятным, там — чтобы он был
   * при любом пути записи.
   */
  const SELF_REGISTER_ROLES = ['farmer', 'service', 'individual'] as const
  const asked = get('role') || 'farmer'
  if (!SELF_REGISTER_ROLES.includes(asked as (typeof SELF_REGISTER_ROLES)[number])) {
    return { error: 'Такой роли при самостоятельной регистрации не бывает' }
  }
  const role = asked as RegisterPayload['role']

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
        /*
         * Первый человек хозяйства и есть его руководитель: он завёл
         * организацию, ему и приглашать остальных. Без этого хозяйство
         * появлялось бы без единого руководителя, и приглашать в него
         * было бы некому.
         */
        orgRole: 'head',
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
