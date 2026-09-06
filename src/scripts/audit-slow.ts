import 'dotenv/config'
import { Pool } from 'pg'
import { getClient } from '@/lib/payload'
import { resolveDatabase } from '@/lib/db-url'
import { ASSOCIATION_PROFILE, computeIndex, TRAIT_BASE } from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import { profileOfDoc } from '@/lib/index-profiles'
import type { Animal, IndexProfile as IndexProfileDoc } from '@/payload-types'

/**
 * Куда уходит время на самой медленной странице книги.
 *
 * ## Почему замер, а не сразу починка
 *
 * `/account/indices/1` открывается восемнадцать секунд, и на неё легко
 * навесить три правдоподобных объяснения: тяжёлый расчёт индекса,
 * отсутствующий указатель, лишняя глубина связей. Правдоподобных —
 * то есть таких, под которые можно писать код, ничего не проверив
 * и не сдвинув ни одной цифры. Мы уже так делали: правку клали в место,
 * которое к делу не относилось, а числа после неё не менялись.
 *
 * Поэтому сперва разложение по шагам. Каждый шаг страницы замеряется
 * отдельно, и рядом — тот же шаг, сделанный дешевле. Разница между ними
 * и есть цена нынешнего устройства; если разницы нет, дело не здесь,
 * и это тоже ответ.
 *
 * ## Что именно сравнивается
 *
 * Выборка стада тремя способами: как на странице (весь документ),
 * с явным перечнем нужных полей и напрямую запросом в базу. Первое
 * и третье — верхняя и нижняя границы: между ними лежит всё, что можно
 * выиграть, не меняя смысла страницы.
 *
 * Считает расчёт индекса отдельно от выборки: если триста животных
 * считаются за миллисекунды, значит арифметика ни при чём, и искать
 * надо в базе.
 *
 *   npm run audit:slow
 *   AUDIT_SAMPLE=300 npm run audit:slow
 */

/*
 * Размер выборки. Пустая или испорченная переменная среды давала `NaN`,
 * а `NaN` в `limit` означает, что все шаги мерили неизвестно что —
 * и замер молча переставал быть замером.
 */
const SAMPLE = (() => {
  const raw = process.env.AUDIT_SAMPLE
  if (raw === undefined || raw.trim() === '') return 300
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`AUDIT_SAMPLE должно быть положительным числом, получено «${raw}»`)
    process.exit(1)
  }
  return Math.trunc(n)
})()

const { driverUri, sslConfig } = resolveDatabase()
const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const ms = (from: bigint) => Number(process.hrtime.bigint() - from) / 1e6

async function timed<T>(what: string, run: () => Promise<T>): Promise<{ what: string; ms: number; value: T }> {
  const started = process.hrtime.bigint()
  const value = await run()
  return { what, ms: ms(started), value }
}

const line = (what: string, took: number, note = '') =>
  console.log(`  ${took.toFixed(0).padStart(7)} мс  ${what}${note ? ` — ${note}` : ''}`)

/**
 * Поля, без которых страница не обойдётся.
 *
 * Собраны не на глаз: верхние уровни путей, по которым расчёт читает
 * признаки, плюс то, что показывается в таблице. Список, выведенный
 * из `TRAIT_BASE`, не разойдётся с расчётом — а выписанный руками
 * разошёлся бы при первом же новом признаке, и страница молча начала бы
 * считать без него.
 */
const TRAIT_GROUPS = [...new Set(TRAIT_BASE.map((t) => t.path.split('.')[0]!))]

async function main() {
  const payload = await getClient()

  console.log(`\nВыборка: ${SAMPLE} животных\n`)

  /* --------------------------- Что открываем --------------------------- */

  const prof = await pool.query<{ id: number; organization_id: number }>(
    `select id, organization_id from index_profiles order by id limit 1`,
  )

  const profileId = prof.rows[0]?.id
  const orgId = prof.rows[0]?.organization_id

  if (!profileId || !orgId) {
    console.log('  ✗ в базе нет профилей индекса — замерять нечего')
    process.exit(1)
  }

  console.log(`Профиль ${profileId}, хозяйство ${orgId}\n`)

  /* ------------------------------ Шаги --------------------------------- */

  const step1 = await timed('профиль по номеру (findByID)', () =>
    payload.findByID({ collection: 'index-profiles', id: profileId, overrideAccess: true }),
  )
  line(step1.what, step1.ms)

  const step2 = await timed('активная база сравнения', () => loadActiveBase(payload))
  line(step2.what, step2.ms)

  const step3 = await timed('стадо целиком, depth 0 — как на странице', () =>
    payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId } },
      depth: 0,
      limit: SAMPLE,
      overrideAccess: true,
    }),
  )
  line(step3.what, step3.ms, `${step3.value.docs.length} записей`)

  const step4 = await timed('стадо, только нужные поля (select)', () =>
    payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId } },
      depth: 0,
      limit: SAMPLE,
      overrideAccess: true,
      select: Object.fromEntries(
        ['id', 'name', 'identNumber', ...TRAIT_GROUPS].map((k) => [k, true]),
      ) as never,
    }),
  )
  line(step4.what, step4.ms, `поля: id, name, identNumber, ${TRAIT_GROUPS.join(', ')}`)

  const step5 = await timed('стадо запросом в базу напрямую', () =>
    pool.query(
      `select id, name, ident_number from animals where owner_id = $1 order by id limit $2`,
      [orgId, SAMPLE],
    ),
  )
  line(step5.what, step5.ms, `${(step5.value as { rowCount: number | null }).rowCount ?? 0} строк`)

  /* Расчёт — отдельно от выборки: иначе не понять, чья это секунда. */
  const doc = step1.value as IndexProfileDoc
  const profile = profileOfDoc(doc)
  const base = step2.value
  const animals = step3.value.docs as Animal[]

  const step6 = await timed('расчёт индекса по обоим профилям', async () =>
    animals.map((a) => ({
      own: computeIndex(a, profile, base).value,
      std: computeIndex(a, ASSOCIATION_PROFILE, base).value,
    })),
  )
  line(step6.what, step6.ms, `${animals.length} животных × 2 профиля`)

  /* ------------------------------ Итог --------------------------------- */

  const total = step1.ms + step2.ms + step3.ms + step6.ms
  const cheaper = step1.ms + step2.ms + step4.ms + step6.ms

  console.log(`\nСумма шагов страницы: ${total.toFixed(0)} мс`)
  console.log(`То же с перечнем полей: ${cheaper.toFixed(0)} мс`)

  /*
   * Вывод формулируется здесь же, а не оставляется читателю. Строка
   * «сумма 900 мс» при странице в 18 секунд — это находка, а не итог:
   * она означает, что время уходит не в данные, и искать надо в отрисовке
   * или в том, что делает разметка страницы помимо этих шагов.
   */
  if (total < 1500) {
    console.log(
      '\n  · Данные страницы собираются быстро. Значит секунды уходят не сюда:\n' +
        '    смотреть отрисовку, вложенные компоненты и то, что тянет разметка.',
    )
  } else if (step3.ms > step4.ms * 2) {
    console.log(
      `\n  · Дело в объёме документа: перечень полей быстрее в ${(step3.ms / Math.max(1, step4.ms)).toFixed(1)} раза.`,
    )
  } else if (step3.ms > step5.ms * 5) {
    console.log(
      `\n  · Дело не в самом запросе: база отвечает за ${step5.ms.toFixed(0)} мс,\n` +
        '    а сборка документов занимает на порядок больше.',
    )
  } else if (step6.ms > 1000) {
    console.log('\n  · Дело в расчёте, а не в выборке.')
  }

  await pool.end()
  /*
   * Замер помечен в реестре отчётом: порога «медленно» у него нет,
   * есть разложение по шагам. Единственный ненулевой выход — «замерять
   * нечего», и он выставляется выше.
   */
  process.exit(process.exitCode ?? 0)
}

main().catch(async (e) => {
  console.log(`\n  ✗ замер оборвался: ${e instanceof Error ? e.message : String(e)}`)
  await pool.end().catch(() => {})
  process.exit(1)
})
