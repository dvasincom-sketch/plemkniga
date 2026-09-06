'use server'

import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { isAssociation } from '@/access'

/**
 * Есть ли животное с таким индивидуальным номером в книге.
 *
 * Нужно при заведении карточки: родителей переписывают со свидетельства
 * номерами, и до этого человек узнавал, нашлись ли они, только после
 * сохранения — а точнее не узнавал вовсе. Связь устанавливается по номеру
 * позже, молча, и «позже» может не наступить, если в номере опечатка.
 *
 * Ответ намеренно скупой: есть или нет, и кличка, если запись открыта.
 * Проверка номера не должна становиться способом читать чужую книгу
 * перебором: подставляя номера в форму, посторонний иначе выяснил бы
 * и клички, и владельцев чужого закрытого стада.
 *
 * Поэтому три уровня подробности:
 *
 *  - **своё животное** — кличка и владелец;
 *  - **чужое открытое** — кличка и владелец, они и так в книге;
 *  - **чужое закрытое** — только «запись есть». Ни клички, ни хозяйства.
 *
 * Само «запись есть» скрыть нельзя и не нужно: без него система молча
 * заведёт вторую карточку на то же животное, а одно животное — одна
 * карточка.
 */

export type AnimalLookup = {
  identNumber: string
  found: boolean
  /** Видны ли подробности этому пользователю. */
  open: boolean
  id?: number
  name?: string
  owner?: string
  mine?: boolean
  /**
   * Поиск не состоялся — это не то же, что «не найдено».
   *
   * «Не найдено» форма объясняет как «запишем текстом, свяжется позже»,
   * то есть приглашает вводить номер как есть. При сбое выборки такое
   * приглашение — неправда: номер может быть в книге, и связь потеряется.
   */
  failed?: boolean
}

const nameOf = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as { shortName?: string | null; name?: string | null }
    return o.shortName || o.name || ''
  }
  return ''
}

export async function lookupAnimalAction(identNumber: string): Promise<AnimalLookup> {
  const ident = identNumber.trim()
  if (!ident) return { identNumber: ident, found: false, open: false }

  const user = await getCurrentUser()
  if (!user) return { identNumber: ident, found: false, open: false }

  const payload = await getClient()
  const myOrg = relId(user.organization)

  /*
   * Ищем в обход правил доступа — иначе о существовании чужой закрытой
   * записи узнать нельзя, и форма предложит завести дубль. Что показать
   * из найденного, решается ниже: это разные вопросы, и смешивать их
   * в одном запросе значит отвечать на второй неправильно.
   */
  const res = await payload
    .find({
      collection: 'animals',
      where: { identNumber: { equals: ident } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
    /*
     * Отказ выборки — не «животного нет».
     *
     * Ответ «не найдено» здесь читается как разрешение завести карточку
     * заново, и по нему в книге появляется второй экземпляр того же
     * животного. Пусть лучше поиск скажет, что не смог.
     */
    .catch((e: unknown) => {
      console.error('[plemkniga] поиск животного по номеру не выполнился:', e)
      return 'failed' as const
    })

  if (res === 'failed') {
    return { identNumber: ident, found: false, open: false, failed: true }
  }

  const doc = res?.docs[0]
  if (!doc) return { identNumber: ident, found: false, open: false }

  const owner = relId(doc.owner)
  const mine = Boolean(myOrg && owner && myOrg === owner)
  const open = mine || Boolean(doc.publicVisible) || isAssociation(user)

  if (!open) return { identNumber: ident, found: true, open: false }

  return {
    identNumber: ident,
    found: true,
    open: true,
    id: doc.id as number,
    name: doc.name ?? undefined,
    owner: nameOf(doc.owner) || undefined,
    mine,
  }
}
