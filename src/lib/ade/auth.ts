import type { Payload } from 'payload'
import { AUTH_COOKIE } from '@/lib/payload'
import type { User } from '@/payload-types'

/**
 * Кто спрашивает — по заголовку запроса, а не по cookie браузера.
 *
 * ## Почему не `getCurrentUser`
 *
 * Тот читает токен из cookie, потому что рассчитан на страницы: там
 * запрос приходит из браузера, где cookie есть всегда. Обмен данными
 * приходит из чужой программы, у которой браузера нет вовсе, и токен
 * она передаёт заголовком.
 *
 * Поддержаны обе формы записи заголовка. Payload выдаёт токен для схемы
 * `JWT`, но привычка отрасли — `Bearer`, и первое, что сделает
 * интегратор, — напишет `Bearer`. Отказать ему за это значило бы
 * потратить его час на то, что мы могли принять одной строкой.
 *
 * ## Почему cookie всё же читается
 *
 * Ради человека, который открывает адрес обмена в браузере, чтобы
 * посмотреть, как выглядит ответ. Он уже вошёл в кабинет, и требовать
 * от него добыть токен ради взгляда на собственные данные — лишний
 * барьер там, где никакой безопасности он не добавляет: cookie
 * и есть та же самая авторизация.
 */
export async function adeUser(request: Request, payload: Payload): Promise<User | null> {
  const raw = request.headers.get('authorization')?.trim()

  let token: string | undefined

  if (raw) {
    const [scheme, ...rest] = raw.split(/\s+/)
    const value = rest.join(' ').trim()
    if (value && /^(jwt|bearer)$/i.test(scheme ?? '')) token = value
  }

  if (!token) {
    /*
     * Разбор cookie руками, а не через `next/headers`: обработчик
     * маршрута получает исходный запрос целиком, и брать заголовок
     * из него честнее — так видно, что источник один и тот же объект,
     * который пришёл по сети.
     */
    const jar = request.headers.get('cookie') ?? ''
    const hit = jar
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${AUTH_COOKIE}=`))
    if (hit) token = decodeURIComponent(hit.slice(AUTH_COOKIE.length + 1))
  }

  if (!token) return null

  try {
    const headers = new Headers({
      Authorization: `JWT ${token}`,
      cookie: `${AUTH_COOKIE}=${token}`,
    })
    const { user } = await payload.auth({ headers })
    if (!user) return null

    /* Заблокированный — не пользователь; то же правило, что у страниц. */
    if ((user as User).blockedAt) return null

    return user as User
  } catch {
    /*
     * Негодный токен — это `null`, а не пятисотая. Ошибка разбора здесь
     * ожидаемое состояние: так выглядит просроченный или подделанный
     * токен, и отвечать на него «внутренняя ошибка сервера» значило бы
     * послать интегратора искать поломку у нас.
     */
    return null
  }
}
