import 'dotenv/config'
import { getClient, guardPool } from '@/lib/payload'

/**
 * Проверка присмотра за пулом соединений на живой базе.
 *
 * Проверять тут нужно две противоположные вещи разом, и в этом вся суть.
 * Слушатель обрыва обязан быть — без него обрыв соединения превращается
 * в `uncaughtException` и убивает процесс (решение №114). И слушатель обязан
 * быть ровно один — иначе на одиннадцатой пересборке в `next dev` Node
 * сообщает `MaxListenersExceededWarning: 11 error listeners added to
 * [Client]`, и каждый обрыв пишет в лог одиннадцать одинаковых строк
 * (решение №120).
 *
 * Пересборку модуля здесь изображает повторный вызов `guardPool`: прежняя
 * защита стояла на переменной модуля, которая после пересборки обнулялась,
 * и повторный вызов проходил насквозь. Нынешняя отметка стоит на самом пуле
 * и переживает и пересборку, и вызов из другого пакета сборки.
 *
 *   npm run check:pool
 */

const TAG = 'CHK-POOL'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

type Countable = { listenerCount: (event: string) => number }
type PgPool = Countable & {
  connect: () => Promise<PgClient>
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>
}
type PgClient = Countable & {
  emit: (event: string, err: Error) => boolean
  release: (destroy?: boolean | Error) => void
}

async function main() {
  console.log(`${TAG}: присмотр за пулом соединений\n`)

  const payload = await getClient()
  const pool = (payload as unknown as { db?: { pool?: PgPool } })?.db?.pool

  if (!pool || typeof pool.listenerCount !== 'function') {
    console.log('  ✗ пул недоступен — проверять нечего')
    process.exit(1)
  }

  // ------------------------- база на месте ------------------------- //
  const alive = await pool.query('select 1 as ok')
  check(alive.rows[0]?.ok === 1, 'база отвечает')

  // --------------------- слушатели на самом пуле --------------------- //
  console.log('\nСлушатели пула')
  check(pool.listenerCount('error') === 1, 'обрыв простаивающего соединения слушает один',
    `их ${pool.listenerCount('error')}`)
  check(pool.listenerCount('acquire') === 1, 'выдачу соединения встречает один',
    `их ${pool.listenerCount('acquire')}`)

  /*
   * Двадцать пересборок подряд. Число взято с запасом: предупреждение Node
   * появляется на одиннадцатом слушателе, и проверка должна падать заметно,
   * а не впритык к границе.
   */
  console.log('\nДвадцать повторных вызовов — как двадцать пересборок в next dev')
  for (let i = 0; i < 20; i++) {
    await getClient()
    guardPool(payload)
  }
  check(pool.listenerCount('error') === 1, 'на пуле по-прежнему один слушатель обрыва',
    `их ${pool.listenerCount('error')}`)
  check(pool.listenerCount('acquire') === 1, 'на пуле по-прежнему один встречающий',
    `их ${pool.listenerCount('acquire')}`)

  // ------------------ слушатель на выданном клиенте ------------------ //
  /*
   * Здесь и нашлась дыра, ради которой проверка писалась. При `connect`
   * вместо `acquire` первое соединение — открытое самим `getPayload`
   * до вызова `guardPool` — оставалось без слушателя навсегда, и именно
   * оно достаётся запросам чаще прочих: пул отдаёт свободное, а не свежее.
   *
   * Соединение берётся дважды с возвратом в пул между: первый раз проверяем,
   * что слушатель появился, второй — что он не удвоился. `acquire` наступает
   * при каждой выдаче, и без отметки на клиенте очередь охранников выросла бы
   * здесь, на соединении, вместо пула.
   */
  console.log('\nСоединение, выданное запросу')
  const first = await pool.connect()
  check(first.listenerCount('error') === 1, 'у соединения ровно один слушатель обрыва',
    `их ${first.listenerCount('error')}`)
  first.release()

  const client = await pool.connect()
  check(client.listenerCount('error') === 1, 'повторная выдача не добавила второго',
    `их ${client.listenerCount('error')}`)

  /*
   * И он действительно ловит. Событие испускается руками: дождаться
   * настоящего обрыва в проверке нечем, а без слушателя ровно эта строка
   * и роняла контейнер на проде. Соединение после этого возвращается
   * в пул с признаком «уничтожить» — оно объявлено сломанным, и держать
   * его дальше нельзя.
   */
  let crashed = false
  try {
    client.emit('error', new Error(`${TAG}: учебный обрыв, так и задумано`))
  } catch {
    crashed = true
  }
  check(!crashed, 'обрыв обработан, а не выброшен наружу')
  client.release(true)

  // Пул обязан пережить потерю соединения и открыть новое
  const after = await pool.query('select 1 as ok')
  check(after.rows[0]?.ok === 1, 'после потери соединения пул открыл новое')

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
