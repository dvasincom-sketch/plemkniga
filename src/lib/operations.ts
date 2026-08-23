import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { relId } from '@/lib/visibility'

/**
 * Сводный журнал операций (ТЗ, требование №19).
 *
 * ## Почему таблица, а не представление поверх трёх имеющихся
 *
 * Журналы у нас были: правки карточки, просмотры по точечному доступу,
 * реестр удалённых записей. Соблазн собрать четвёртый из них
 * представлением велик и не работает: половина того, что нужно видеть
 * в сводном журнале, не оставляет строки нигде. Вход в систему, отказ
 * на входе, выпуск ссылки, блокировка человека, решение по членству —
 * у этих действий нет «записи», которую можно было бы объединить.
 * Собирать журнал из следов чужих таблиц значит видеть только то,
 * что и так видно.
 *
 * ## Почему журнал тонкий
 *
 * Он не копирует подробности, а называет действие и указывает, где
 * подробность лежит. Состав правки живёт в журнале правок, находки
 * проверки — в заявке, строки загрузки — в пакете. Скопировать их сюда
 * значило бы завести второй источник правды о том же событии; они
 * разойдутся в первый же месяц, и вопрос «где смотреть на самом деле»
 * встанет заново.
 *
 * Отсюда же и то, что журнал **не** записывает: каждую загруженную
 * строку, каждый пересчёт индекса, каждый показ страницы. Журнал,
 * куда пишется всё, читать невозможно, а хранить дорого — и он
 * перестаёт быть журналом ровно тогда, когда становится нужен.
 *
 * ## Почему имена сохраняются строкой
 *
 * Кто именно совершил действие, должно читаться и через год — когда
 * человек уволился, а хозяйство переименовалось. Связь остаётся
 * (по ней фильтруют), но рядом лежит снимок имени: журнал, который
 * читается только вместе с живыми справочниками, — не журнал,
 * а отчёт по текущему состоянию.
 */

export type OperationAction =
  // вход и учётные записи
  | 'login'
  | 'login-refused'
  | 'member-invited'
  | 'invite-revoked'
  | 'member-joined'
  | 'role-changed'
  | 'user-blocked'
  | 'user-unblocked'
  // данные
  | 'animal-created'
  | 'animal-archived'
  | 'animal-restored'
  | 'animal-purged'
  | 'movement-recorded'
  | 'submission-published'
  // доступ
  | 'share-created'
  | 'share-revoked'
  | 'grant-issued'
  | 'grant-revoked'
  // Ассоциация
  | 'verification-requested'
  | 'verification-decided'
  | 'document-issued'
  | 'membership-decided'
  | 'directory-merged'
  | 'directory-confirmed'

export const OPERATION_GROUPS = [
  { value: 'accounts', label: 'Учётные записи' },
  { value: 'data', label: 'Данные' },
  { value: 'access', label: 'Доступ' },
  { value: 'association', label: 'Ассоциация' },
] as const

export type OperationGroup = (typeof OPERATION_GROUPS)[number]['value']

export const OPERATIONS: readonly {
  value: OperationAction
  label: string
  group: OperationGroup
}[] = [
  { value: 'login', label: 'Вход в систему', group: 'accounts' },
  { value: 'login-refused', label: 'Отказ на входе', group: 'accounts' },
  { value: 'member-invited', label: 'Приглашён сотрудник', group: 'accounts' },
  { value: 'invite-revoked', label: 'Приглашение отозвано', group: 'accounts' },
  { value: 'member-joined', label: 'Сотрудник завёл учётную запись', group: 'accounts' },
  { value: 'role-changed', label: 'Сменена роль сотрудника', group: 'accounts' },
  { value: 'user-blocked', label: 'Учётная запись заблокирована', group: 'accounts' },
  { value: 'user-unblocked', label: 'Блокировка снята', group: 'accounts' },

  { value: 'animal-created', label: 'Заведена карточка животного', group: 'data' },
  { value: 'animal-archived', label: 'Запись отправлена в архив', group: 'data' },
  { value: 'animal-restored', label: 'Запись возвращена из архива', group: 'data' },
  { value: 'animal-purged', label: 'Запись удалена по сроку', group: 'data' },
  { value: 'movement-recorded', label: 'Записано перемещение', group: 'data' },
  { value: 'submission-published', label: 'Пакет данных подан', group: 'data' },

  { value: 'share-created', label: 'Выпущена ссылка на просмотр', group: 'access' },
  { value: 'share-revoked', label: 'Ссылка отозвана', group: 'access' },
  { value: 'grant-issued', label: 'Открыт точечный доступ', group: 'access' },
  { value: 'grant-revoked', label: 'Точечный доступ отозван', group: 'access' },

  { value: 'verification-requested', label: 'Подана заявка на верификацию', group: 'association' },
  { value: 'verification-decided', label: 'Решение по верификации', group: 'association' },
  { value: 'document-issued', label: 'Выдан документ', group: 'association' },
  { value: 'membership-decided', label: 'Решение по членству', group: 'association' },
  { value: 'directory-merged', label: 'Слиты карточки хозяйств', group: 'association' },
  { value: 'directory-confirmed', label: 'Карточка признана хозяйством', group: 'association' },
]

export const operationLabel = (action: string): string =>
  OPERATIONS.find((o) => o.value === action)?.label ?? action

export const operationGroup = (action: string): OperationGroup | null =>
  OPERATIONS.find((o) => o.value === action)?.group ?? null

export type SubjectType =
  | 'animal'
  | 'user'
  | 'organization'
  | 'document'
  | 'share'
  | 'submission'
  | 'verification'
  | 'movement'
  | 'none'

export type OperationInput = {
  action: OperationAction
  /** Кто действовал. `null` — действие системы (срок хранения, пересчёт). */
  actor?: User | null
  /** Чьи данные затронуты. Без неё запись видна только Ассоциации. */
  organization?: number | null
  subjectType?: SubjectType
  subjectId?: number | null
  /** Человекочитаемое имя предмета: номер животного, почта, название. */
  subject?: string | null
  /** Одна строка о том, что именно произошло. Не пересказ подробностей. */
  summary?: string | null
  /** Адрес, с которого пришёл запрос, если он известен. */
  ip?: string | null
}

const personName = (user: User | null | undefined): string => {
  if (!user) return 'система'
  const fio = [user.lastName, user.firstName].filter(Boolean).join(' ')
  return fio || user.email
}

/**
 * Записать операцию.
 *
 * Никогда не бросает. Журнал — свидетель, а не участник: упавшая запись
 * в него не должна отменять то, что уже произошло. Обратное — действие
 * совершено, а следа нет — тоже плохо, но чинится сверкой с предметными
 * таблицами, тогда как отменённое из-за журнала действие не чинится ничем.
 * Тот же выбор сделан у журнала правок карточки.
 */
export async function recordOperation(payload: Payload, input: OperationInput): Promise<void> {
  try {
    const actor = input.actor ?? null
    const org = input.organization ?? relId(actor?.organization) ?? null

    await payload.create({
      collection: 'operations',
      overrideAccess: true,
      data: {
        at: new Date().toISOString(),
        action: input.action,
        actor: actor ? actor.id : undefined,
        actorName: personName(actor),
        organization: org ?? undefined,
        subjectType: input.subjectType ?? 'none',
        subjectId: input.subjectId ?? undefined,
        subject: input.subject ?? undefined,
        summary: input.summary ?? undefined,
        ip: input.ip ?? undefined,
      },
    })
  } catch (e) {
    /*
     * Сообщение в лог, а не молчание: журнал, который перестал писаться,
     * должен быть замечен раньше, чем понадобится.
     */
    console.error(
      `[plemkniga] Не удалось записать операцию «${input.action}»: ` +
        (e instanceof Error ? e.message : String(e)),
    )
  }
}

/**
 * Адрес запроса из заголовков.
 *
 * За обратным прокси настоящий адрес приходит в `x-forwarded-for`
 * списком: первый — клиент, дальше промежуточные узлы. Берём первый
 * и не притворяемся, что он достоверен: подделать заголовок может
 * кто угодно, и в журнале это подсказка, а не доказательство.
 */
export const ipFromHeaders = (headers: Headers): string | null => {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim() || null
  return headers.get('x-real-ip')
}
