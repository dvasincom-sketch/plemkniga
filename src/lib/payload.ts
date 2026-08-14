import { getPayload } from 'payload'
import config from '@payload-config'
import { cookies } from 'next/headers'
import type { User } from '@/payload-types'

export const getClient = async () => getPayload({ config })

export const AUTH_COOKIE = 'payload-token'

/**
 * Текущий пользователь.
 *
 * Токен читается из cookie напрямую и передаётся в Payload заголовком
 * `Authorization: JWT …`. Через `headers()` это не всегда работает:
 * в server actions заголовки исходного запроса до обработчика не доходят,
 * и пользователь определялся как анонимный.
 */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const jar = await cookies()
    const token = jar.get(AUTH_COOKIE)?.value
    if (!token) return null

    const payload = await getClient()
    const headers = new Headers({
      Authorization: `JWT ${token}`,
      cookie: `${AUTH_COOKIE}=${token}`,
    })

    const { user } = await payload.auth({ headers })
    return (user as User) ?? null
  } catch {
    return null
  }
}
