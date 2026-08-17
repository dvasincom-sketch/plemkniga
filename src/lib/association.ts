import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/payload'
import type { User } from '@/payload-types'

/**
 * Вход в кабинет Ассоциации.
 *
 * Проверка одна и в одном месте: страниц в разделе будет много, и правило
 * «кто сюда пускается» не должно оказаться записанным в каждой из них
 * по-своему. Роли две — эксперт и администратор; разница между ними
 * не в доступе к разделу, а в том, что внутри можно делать.
 *
 * Не пускаем не «на страницу входа», а на главную: посторонний, попавший
 * сюда по ссылке, ничего не потерял — ему просто нечего здесь делать,
 * и предлагать ему войти заново бессмысленно.
 */
export const isAssociationUser = (user: { role?: string | null } | null): boolean =>
  user?.role === 'expert' || user?.role === 'admin'

export async function requireAssociation(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/association')
  if (!isAssociationUser(user)) redirect('/')
  return user
}

/**
 * Обратная проверка: сотруднику Ассоциации здесь делать нечего.
 *
 * Ставится на страницы кабинета хозяйства. У эксперта нет своего стада,
 * и «Мои животные» для него — не пустой список, а вопрос «в какой я сейчас
 * роли», который он не должен себе задавать. Личные страницы — профиль
 * и уведомления — под это правило не попадают: они не про хозяйство,
 * а про человека.
 */
export function denyAssociation(user: { role?: string | null } | null): void {
  if (isAssociationUser(user)) redirect('/association')
}

/** Сколько дней ждёт пакет — главная метрика очереди. */
export const waitingDays = (since?: string | null): number => {
  if (!since) return 0
  const t = new Date(since).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

/**
 * Словами — потому что «3 дн.» в таблице читается хуже, чем «3 дня»,
 * а «сегодня» понятнее, чем «0 дней».
 */
export const waitingLabel = (days: number): string => {
  if (days === 0) return 'сегодня'
  const n10 = days % 10
  const n100 = days % 100
  if (n10 === 1 && n100 !== 11) return `${days} день`
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${days} дня`
  return `${days} дней`
}

/**
 * Норма ожидания.
 *
 * Числа взяты не из регламента — его нет, — а из здравого смысла: неделя
 * на разбор файла считается приемлемой, две недели уже объясняют, почему
 * хозяйство перестало загружать данные. Когда регламент появится, менять
 * придётся одну строку.
 */
export const WAITING_WARN_DAYS = 7
export const WAITING_LATE_DAYS = 14
