import type { Payload } from 'payload'
import { plural } from '@/lib/format'

/**
 * Что хозяйству стоит сделать прямо сейчас.
 *
 * ## Зачем
 *
 * Кабинет открывался списком стада. Список — это архив: он отвечает
 * на вопрос «что у меня есть», а у хозяйства в голове другой вопрос —
 * «что мне сделать». Между двумя посещениями кабинета меняется не состав
 * стада, а состояние дел: пришло заключение, накопились неподтверждённые
 * записи, три месяца не было загрузки. Ни одно из этого в таблице не видно,
 * потому что таблица про животных, а дела — про хозяйство.
 *
 * ## Чего здесь намеренно нет
 *
 * Советов по управлению стадом. Соблазн дописать «у восьми тёлок пора
 * назначить осеменение» велик, и данных на это хватает. Но возраст
 * осеменения без живой массы советует неправильно — разбор
 * в `docs/vozrast-pervogo-otela.md`, — а массы в модели нет. Пока её нет,
 * книга говорит о полноте и достоверности записей, то есть о своём деле,
 * а не о чужом.
 *
 * ## Почему SQL, а не выборки
 *
 * Четыре числа по стаду в триста тысяч строк. Через `find` это четыре
 * прохода с загрузкой документов в память ради `length`; здесь — один
 * запрос, который база для того и создана. Тот же приём, что
 * в `farm-stats.ts` и `book-quality.ts`.
 */

export type TodoItem = {
  key: string
  /** Число, которое человек читает первым. */
  count: number
  label: string
  /** Что с этим делать — одной фразой. */
  hint: string
  href: string
  /** Требует внимания сильнее прочего. */
  urgent?: boolean
}

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool | null =>
  (payload.db as unknown as { pool?: SqlPool }).pool ?? null

const n = (v: unknown): number => Number(v ?? 0)

/** Сколько дней прошло — без загрузок вообще возвращает null. */
const daysSince = (v: unknown): number | null => {
  if (!v) return null
  const t = new Date(String(v)).getTime()
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000)
}

/** Через сколько дней молчания загрузка считается просроченной. */
const STALE_DAYS = 60

export async function farmTodo(payload: Payload, organizationId: number): Promise<TodoItem[]> {
  const pool = poolOf(payload)
  if (!pool) return []

  /*
   * Один запрос на все четыре числа. Соединения с дойками и отёлами идут
   * подзапросами с группировкой, а не построчно: иначе на каждое животное
   * пришлось бы по проходу по таблице замеров.
   *
   * Ошибка запроса гасится: полоса дел — надстройка над кабинетом,
   * и уронить из-за неё список стада значило бы поменять местами главное
   * и второстепенное.
   */
  const res = await pool
    .query(
      `
      with mine as (
        select id, sex, state, birth_date, breed_id, father_id, mother_id,
               trust_level,
               pedigree_text_father_id, pedigree_text_mother_id
          from animals
         where owner_id = $1 and archived is not true
      ),
      milked as (
        select distinct m.animal_id
          from milk_tests m
          join mine a on a.id = m.animal_id
         where m.date > now() - interval '12 months'
      )
      select
        (select count(*) from mine where coalesce(trust_level, 0) < 3)          as unverified,
        (select count(*) from mine
          where birth_date is null
             or breed_id is null
             or (father_id is null and mother_id is null
                 and coalesce(pedigree_text_father_id, '') = ''
                 and coalesce(pedigree_text_mother_id, '') = ''))                as incomplete,
        (select count(*) from mine a
          where a.sex = 'female' and a.state = 'alive'
            and not exists (select 1 from milked k where k.animal_id = a.id))    as no_milk_year,
        (select max(submitted_at) from data_submissions
          where organization_id = $1)                                           as last_submission
      `,
      [organizationId],
    )
    .catch(() => null)

  const r = res?.rows?.[0]
  if (!r) return []

  const out: TodoItem[] = []

  const unverified = n(r.unverified)
  if (unverified > 0) {
    out.push({
      key: 'unverified',
      count: unverified,
      label: `${plural(unverified, ['запись', 'записи', 'записей'])} ${plural(unverified, ['не подтверждена', 'не подтверждены', 'не подтверждены'])}`,
      hint: 'Подтверждение требуется перед выпуском свидетельства',
      href: '/account/verification',
    })
  }

  const incomplete = n(r.incomplete)
  if (incomplete > 0) {
    out.push({
      key: 'incomplete',
      count: incomplete,
      label: `${plural(incomplete, ['запись', 'записи', 'записей'])} ${plural(incomplete, ['неполна', 'неполны', 'неполны'])}`,
      /*
       * Подсказка называет те же три правила, которые ищет разбор стада:
       * `no-birth-date`, `no-breed`, `no-parents`. Числа обязаны сходиться,
       * и сходятся они с тех пор, как разбор перестал пропускать
       * подтверждённые записи — до этого полоса считала по всему стаду,
       * а разбор по части, и хозяйство видело «2 неполны» здесь
       * и «замечаний не найдено» там.
       */
      hint: 'Нет даты рождения, породы или происхождения — это же найдёт разбор стада',
      href: '/account/checks/herd',
      urgent: true,
    })
  }

  const noMilk = n(r.no_milk_year)
  if (noMilk > 0) {
    out.push({
      key: 'no-milk',
      count: noMilk,
      label: `${plural(noMilk, ['корова', 'коровы', 'коров'])} без ${plural(noMilk, ['дойки', 'доек', 'доек'])} за год`,
      hint: 'Без контрольных доек продуктивность в книге не считается',
      href: '/account/events/new',
    })
  }

  /*
   * Молчание — тоже дело, и единственное здесь, у которого число
   * не количество записей, а дни. Показывается только когда молчание
   * затянулось: «загружали вчера» не нуждается в напоминании.
   */
  const days = daysSince(r.last_submission)
  if (days === null) {
    out.push({
      key: 'never-uploaded',
      count: 0,
      label: 'загрузок ещё не было',
      hint: 'Файлом стадо заводится быстрее, чем по одному',
      href: '/account/import',
    })
  } else if (days >= STALE_DAYS) {
    out.push({
      key: 'stale',
      count: days,
      label: `${plural(days, ['день', 'дня', 'дней'])} с последней загрузки`,
      hint: 'Чем свежее данные, тем точнее оценка',
      href: '/account/import',
    })
  }

  return out
}
