import { getPayload } from 'payload'
import config from '@payload-config'
import { cookies } from 'next/headers'
import type { User } from '@/payload-types'

/**
 * Обрыв простаивающего соединения не должен ронять процесс.
 *
 * Пул `pg` держит открытые соединения между запросами. Если такое соединение
 * оборвётся — база ушла в перезагрузку, сеть моргнула, файрвол закрылся, —
 * пул сообщает об этом событием `error`. Слушателя у события нет, и Node
 * поступает по общему правилу: необработанный `error` у EventEmitter
 * превращается в `uncaughtException` и убивает процесс.
 *
 * На проде это выглядело так: база перестала отвечать, в логе появилось
 * `⨯ uncaughtException: Error: read ETIMEDOUT`, контейнер умер и поднялся
 * заново — и так по кругу. Перезапуск ничего не чинил (база как была
 * недоступна, так и осталась), но сбивал диагностику: `uptimeSec` на пробе
 * показывал минуты, и казалось, что дело в свежем деплое.
 *
 * Слушатель ничего не восстанавливает: пул откроет новое соединение при
 * следующем запросе сам. Он только не даёт обрыву одного соединения решать
 * судьбу всего приложения — и оставляет строку в логе, по которой видно,
 * что именно оборвалось.
 */
let poolGuarded = false

type PoolLike = { on?: (event: 'error', listener: (err: Error) => void) => void }

const guardPool = (client: unknown): void => {
  if (poolGuarded) return
  const pool = (client as { db?: { pool?: PoolLike } })?.db?.pool
  if (typeof pool?.on !== 'function') return

  poolGuarded = true
  pool.on('error', (err) => {
    console.error(
      `[plemkniga] Простаивающее соединение с базой оборвалось: ${err.message}. ` +
        'Пул откроет новое при следующем запросе; состояние базы — на /healthz',
    )
  })
}

export const getClient = async () => {
  const client = await getPayload({ config })
  guardPool(client)
  return client
}

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
