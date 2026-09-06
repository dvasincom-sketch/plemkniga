import type { Payload, PayloadRequest } from 'payload'
import { afterCommit, pendingAfterCommit } from '@/lib/after-commit'

/**
 * Проверка самого механизма отложенных следствий.
 *
 * ## Что доказывается
 *
 * Три утверждения, и все три отрицательные по форме — то есть проверяются
 * попыткой, а не осмотром:
 *
 *  1. работа, отложенная внутри транзакции, до коммита НЕ выполняется;
 *  2. после коммита она выполняется;
 *  3. после отката она НЕ выполняется никогда.
 *
 * Плюс одно положительное: обёртка над коммитом стоит. Без неё первые два
 * утверждения были бы верны по недоразумению — работа не выполнилась бы
 * ни до, ни после, — и проверка, спрашивающая только «выполнилось ли
 * раньше времени», ответила бы зелёным на полностью сломанном механизме.
 * Ровно тот случай, ради которого заведено правило «прогон обязан
 * отличать „сошлось“ от „нечего было сводить“».
 *
 * ## Почему проба ничего не пишет
 *
 * Транзакция открывается и закрывается своя, а откладывается в неё
 * не запись в базу, а присвоение переменной. Проверяется устройство,
 * а не данные: испортить книгу такая проба не может даже оборвавшись
 * посреди, и потому ей место в ночном прогоне, а не в списке пишущих.
 *
 * ## Чего проба не проверяет
 *
 * Что именно откладывают хуки коллекций. За этим следит `check:hooks`:
 * он разбирает исходники и требует, чтобы внутри `afterCommit` запрос
 * не передавался, а снаружи — передавался. Два прогона смотрят на разные
 * половины одного правила: тот — что код написан верно, этот — что
 * механизм работает.
 */

type Probe = { findings: string[]; notes: string[] }

/** Поддельный запрос: от настоящего нужны только клиент и номер транзакции. */
const reqWith = (payload: Payload, transactionID: number | string): PayloadRequest =>
  ({ payload, transactionID }) as unknown as PayloadRequest

export async function runAfterCommitProbe(payload: Payload): Promise<Probe> {
  const findings: string[] = []
  const notes: string[] = []

  const db = payload.db as unknown as {
    __plemAfterCommit?: boolean
    beginTransaction?: () => Promise<number | string | null>
    commitTransaction: (id: unknown) => Promise<void>
    rollbackTransaction: (id: unknown) => Promise<void>
  }

  if (!db.__plemAfterCommit) {
    findings.push('обёртка над коммитом не установлена — следствия некуда откладывать')
    return { findings, notes }
  }
  notes.push('обёртка над коммитом установлена')

  if (typeof db.beginTransaction !== 'function') {
    findings.push('адаптер не умеет транзакций — проверять нечего, и это не «сошлось»')
    return { findings, notes }
  }

  /* --------------------------- Коммит --------------------------- */

  const id = await db.beginTransaction()
  if (id === null || id === undefined) {
    findings.push('транзакция не открылась — проверка ничего не измерила')
    return { findings, notes }
  }

  let ran = 0
  await afterCommit(reqWith(payload, id), 'проба отложенного следствия', async () => {
    ran += 1
  })

  if (ran !== 0) findings.push('работа выполнилась до коммита')
  else notes.push('до коммита работа не выполнялась')

  if (pendingAfterCommit(id) !== 1) {
    findings.push(`в очереди транзакции не одна работа, а ${pendingAfterCommit(id)}`)
  } else {
    notes.push('работа встала в очередь транзакции')
  }

  await db.commitTransaction(id)

  if (ran !== 1) findings.push(`после коммита работа выполнилась ${ran} раз вместо одного`)
  else notes.push('после коммита работа выполнилась ровно один раз')

  if (pendingAfterCommit(id) !== 0) findings.push('очередь после коммита не опустела')
  else notes.push('очередь после коммита опустела')

  /* ---------------------------- Откат ---------------------------- */

  const rolled = await db.beginTransaction()
  if (rolled === null || rolled === undefined) {
    findings.push('вторая транзакция не открылась — откат не проверен')
    return { findings, notes }
  }

  let ranOnRollback = 0
  await afterCommit(reqWith(payload, rolled), 'проба следствия при откате', async () => {
    ranOnRollback += 1
  })

  await db.rollbackTransaction(rolled)

  if (ranOnRollback !== 0) findings.push('работа выполнилась после отката')
  else notes.push('после отката работа не выполнялась')

  if (pendingAfterCommit(rolled) !== 0) findings.push('очередь после отката не опустела')
  else notes.push('очередь после отката опустела')

  return { findings, notes }
}
