import { getPayload } from 'payload'
import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import type { User } from '@/payload-types'

export const getClient = async () => getPayload({ config })

/** Текущий пользователь из cookie `payload-token`. */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const payload = await getClient()
    const headers = await nextHeaders()
    const { user } = await payload.auth({ headers })
    return (user as User) ?? null
  } catch {
    return null
  }
}
