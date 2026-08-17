import type { BasePayload, PayloadRequest, Where } from 'payload'
import type { AccessScope } from '@/lib/dictionaries'
import { relId } from '@/lib/visibility'

/**
 * Действующие точечные доступы посетителя.
 *
 * Точечный доступ — грант: владелец данных открыл конкретной организации
 * конкретные области своей карточки на срок с правом отозвать. Разбор целиком —
 * `docs/tochechnyy-dostup.md`.
 *
 * Этот файл отвечает на один вопрос и делает это дёшево: **что открыто
 * посетителю прямо сейчас**. Ответ нужен правилам чтения (`src/access/index.ts`),
 * а они на горячем пути: страница книги 0,38 с, карточка 0,10 с.
 *
 * ## Почему списком идентификаторов, а не условием на таблицу
 *
 * Напрашивается условие «есть строка в access-grants, где …». Payload
 * превращает условие на связанную таблицу в `left join`, и на этом уже теряли
 * секунды: 1,2 с на подсчёте итога страницы (решение №22) и 2,8 с на карточке
 * (решение №27). Поэтому гранты читаются отдельно и подставляются в условие
 * готовыми списками — `{ id: { in: […] } }` по первичному ключу
 * и `{ owner: { in: […] } }` по индексированной колонке.
 *
 * Различие, на котором держится весь механизм:
 *
 *     { animal: { equals: 5 } }          → условие по колонке animal_id
 *     { 'animal.owner': { equals: 5 } }  → left join таблицы животных
 *
 * Первое — обращение к самой связи, второе — к полю связанной записи.
 * Внешне похожи, стоят по-разному.
 *
 * ## Почему у кого нет грантов, тот не платит ничего
 *
 * Точечный доступ — редкая ситуация. Анонимов в книге большинство, у них
 * грантов нет вовсе; у фермера их обычно ноль. Поэтому пустой ответ здесь —
 * не «пустые списки», а признак `empty`, по которому правило чтения
 * **не меняет условие ни на символ**, и план запроса книги остаётся прежним.
 * Для анонима и пользователя без организации запроса к базе не делается вовсе.
 */

export type Grants = {
  /** id животного → открытые области. Из грантов на конкретное животное. */
  byAnimal: Map<number, Set<AccessScope>>
  /** id организации-владельца → открытые области. Из грантов на всё стадо. */
  byOwner: Map<number, Set<AccessScope>>
  /** Ни одного действующего гранта: условие чтения трогать не нужно. */
  empty: boolean
  /** Часть грантов не поместилась в потолок — см. `GRANT_LIMIT`. */
  truncated: boolean
}

export const NO_GRANTS: Grants = {
  byAnimal: new Map(),
  byOwner: new Map(),
  empty: true,
  truncated: false,
}

/**
 * Потолок на число поимённых грантов у одного получателя.
 *
 * Список идентификаторов не может расти бесконечно: тысяча чисел в `IN` — уже
 * заметный запрос, десять тысяч — плохой. Потолок объявляется вслух (плашка
 * в кабинете, предупреждение в лог): молчаливое усечение читается как
 * «всё открылось», когда открылось не всё, и следующий человек будет искать
 * ошибку в правах, а не в потолке.
 *
 * Гранты на стадо в потолок не входят: их единицы, и проверяются они
 * по владельцу, а не по списку животных.
 */
export const GRANT_LIMIT = 1000

/** Гранты на стадо: их у одного получателя единицы, но потолок нужен и здесь. */
const HERD_GRANT_LIMIT = 200

/**
 * Насколько долго держим прочитанное.
 *
 * Правила доступа срабатывают по многу раз за одну страницу — книга, счётчики,
 * значения индекса, — и каждый вызов Payload создаёт свой `req`. Кэш на `req`
 * поэтому не помог бы: он живёт ровно одну операцию. Отсюда память процесса
 * с коротким сроком.
 *
 * Две секунды — не компромисс, а верхняя граница задержки, и она нужна только
 * при нескольких экземплярах приложения. В одном экземпляре отзыв действует
 * мгновенно: `forgetGrants` вызывается из хука самой коллекции, то есть
 * в том же процессе, который отзыв и записал.
 *
 * Срок гранта в кэше не участвует: `expiresAt` проверяется при каждом
 * обращении по текущему времени. Иначе истёкший грант жил бы лишние секунды —
 * мелочь, но ровно такие мелочи потом объясняют часами.
 */
const MEMO_TTL_MS = 2000

/**
 * Выключатель на время замера — и только вне прода.
 *
 * Вопрос «сколько стоит точечный доступ» невозможно решить сравнением
 * с прошлыми замерами: те снимались на продовой сборке, а мерить удобно
 * на своей машине, где `next dev` компилирует по требованию и цифры кратно
 * другие. Сравнивать надо одну и ту же сборку с собой: поднять с этой
 * переменной и без неё, разница и есть цена слоя.
 *
 *   PLEMKNIGA_GRANTS_OFF=1 npm run dev
 *
 * На проде переменная не действует ни при каких значениях. Выключатель прав
 * доступа, который можно случайно оставить включённым в боевом окружении, —
 * это не инструмент, а мина: точечный доступ молча перестал бы работать,
 * и никто бы не понял почему. Поэтому проверка `NODE_ENV` стоит здесь,
 * а не в документации.
 */
const GRANTS_OFF =
  process.env.NODE_ENV !== 'production' && process.env.PLEMKNIGA_GRANTS_OFF === '1'

if (GRANTS_OFF) {
  console.warn(
    '[plemkniga] PLEMKNIGA_GRANTS_OFF=1 — точечный доступ выключен. ' +
      'Гранты не читаются и ничего не открывают. Это режим замера, не забудьте убрать',
  )
}

type Row = {
  animal?: unknown
  owner?: unknown
  scopes?: string[] | null
  expiresAt?: string | null
}

type Memo = { at: number; rows: Row[]; truncated: boolean }

const memo = new Map<number, Memo>()

/**
 * Забыть прочитанное для организации.
 *
 * Вызывается хуками `access-grants` при выдаче, изменении и отзыве. Без него
 * отзыв ждал бы истечения срока кэша, а обещание «работает сразу» стало бы
 * обещанием «работает через две секунды».
 *
 * Без аргумента забывает всё — так делает ревизия, чтобы её шаги не мешали
 * друг другу.
 */
export function forgetGrants(organizationId?: number | null): void {
  if (organizationId == null) memo.clear()
  else memo.delete(organizationId)
}

/** Один раз на процесс: потолок достигнут — сказать, а не промолчать. */
const warned = new Set<number>()

async function read(payload: BasePayload, org: number): Promise<Memo> {
  const cached = memo.get(org)
  if (cached && Date.now() - cached.at < MEMO_TTL_MS) return cached

  /*
   * Два запроса, а не один с потолком на всё.
   *
   * Если читать всё одной выборкой и обрезать по потолку, то у получателя
   * с тысячей поимённых грантов из выдачи может выпасть единственный грант
   * на стадо — и он потеряет доступ ко всему хозяйству из-за того, что ему
   * открыли слишком много отдельных животных. Гранты на стадо поэтому
   * читаются отдельно; их единицы, и они дешёвые.
   */
  const base: Where[] = [{ grantee: { equals: org } }, { revokedAt: { exists: false } }]

  const [herd, named] = await Promise.all([
    payload.find({
      collection: 'access-grants',
      where: { and: [...base, { animal: { exists: false } }] },
      limit: HERD_GRANT_LIMIT,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'access-grants',
      where: { and: [...base, { animal: { exists: true } }] },
      limit: GRANT_LIMIT + 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const namedRows = named.docs as Row[]
  const truncated = namedRows.length > GRANT_LIMIT

  if (truncated && !warned.has(org)) {
    warned.add(org)
    console.warn(
      `[plemkniga] У организации ${org} больше ${GRANT_LIMIT} поимённых точечных доступов. ` +
        'Учтены не все — часть записей ей не откроется. Правильное лечение: ' +
        'попросить владельца выдать доступ ко всему стаду одним грантом',
    )
  }

  const fresh: Memo = {
    at: Date.now(),
    rows: [...(herd.docs as Row[]), ...namedRows.slice(0, GRANT_LIMIT)],
    truncated,
  }

  memo.set(org, fresh)
  return fresh
}

/** Действует ли грант прямо сейчас: отозванные отсеяны запросом, срок — здесь. */
const alive = (row: Row, now: number): boolean => {
  if (!row.expiresAt) return true
  const until = Date.parse(row.expiresAt)
  return Number.isNaN(until) || until > now
}

const SCOPE_SET = new Set<string>(['origin', 'production', 'evaluation', 'documents'])

const put = (map: Map<number, Set<AccessScope>>, key: number, scopes: string[]): void => {
  let set = map.get(key)
  if (!set) {
    set = new Set<AccessScope>()
    map.set(key, set)
  }
  for (const s of scopes) if (SCOPE_SET.has(s)) set.add(s as AccessScope)
}

/** Что открыто организации `org` прямо сейчас. */
export async function grantsFor(
  payload: BasePayload,
  org: number | null | undefined,
): Promise<Grants> {
  if (!org || GRANTS_OFF) return NO_GRANTS

  const { rows, truncated } = await read(payload, org)
  if (!rows.length) return NO_GRANTS

  const now = Date.now()
  const byAnimal = new Map<number, Set<AccessScope>>()
  const byOwner = new Map<number, Set<AccessScope>>()

  for (const row of rows) {
    if (!alive(row, now)) continue
    const scopes = row.scopes ?? []
    if (!scopes.length) continue

    const animal = relId(row.animal)
    if (animal !== null) {
      put(byAnimal, animal, scopes)
      continue
    }

    const owner = relId(row.owner)
    if (owner !== null) put(byOwner, owner, scopes)
  }

  const empty = byAnimal.size === 0 && byOwner.size === 0
  return empty ? NO_GRANTS : { byAnimal, byOwner, empty, truncated }
}

type UserLike = { organization?: unknown } | null | undefined

/**
 * Что открыто тому, кто прислал этот запрос.
 *
 * Аноним и пользователь без организации до базы не доходят: грантов у них
 * заведомо нет. Читается с `overrideAccess: true` — правило доступа, которое
 * ради своей работы вызывает правило доступа, даёт рекурсию на ровном месте.
 */
export async function grantsForRequest(req: PayloadRequest): Promise<Grants> {
  if (GRANTS_OFF) return NO_GRANTS
  const org = relId((req.user as UserLike)?.organization)
  if (org === null) return NO_GRANTS
  return grantsFor(req.payload, org)
}

/** Животные, у которых открыта эта область (без области — любой грант). */
export const animalsWithScope = (grants: Grants, scope?: AccessScope): number[] => {
  if (!scope) return [...grants.byAnimal.keys()]
  const out: number[] = []
  for (const [id, scopes] of grants.byAnimal) if (scopes.has(scope)) out.push(id)
  return out
}

/** Владельцы, чьё стадо открыто в этой области (без области — любой грант). */
export const ownersWithScope = (grants: Grants, scope?: AccessScope): number[] => {
  if (!scope) return [...grants.byOwner.keys()]
  const out: number[] = []
  for (const [id, scopes] of grants.byOwner) if (scopes.has(scope)) out.push(id)
  return out
}

/**
 * Что открыто по этому конкретному животному.
 *
 * Собирает области из обоих видов гранта: поимённого и на стадо. Нужна
 * не правилам доступа, а карточке — решить, какой раздел показать,
 * а какой закрыть плашкой «вам не открыто».
 */
export const scopesForAnimal = (
  grants: Grants,
  animalId: number | null,
  ownerId: number | null,
): Set<AccessScope> => {
  const out = new Set<AccessScope>()
  if (grants.empty) return out

  if (animalId !== null) for (const s of grants.byAnimal.get(animalId) ?? []) out.add(s)
  if (ownerId !== null) for (const s of grants.byOwner.get(ownerId) ?? []) out.add(s)
  return out
}
