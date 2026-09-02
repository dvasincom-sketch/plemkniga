import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ASSOCIATION_PROFILE, NATIONAL_PROFILES } from '@/lib/breeding-index'
import { RANKING_CATEGORIES, loadRanking, type RankingCategory } from '@/lib/ranking'
import { biggestHerd } from '@/lib/biggest-herd'

/**
 * Рейтинг — прогон на живой базе.
 *
 * ## Что здесь может сломаться молча
 *
 * Рейтинг это один запрос с оконной функцией, четырьмя соединениями
 * и подстановкой условия разряда текстом. Каждое из этих мест умеет
 * соврать, не падая:
 *
 * `rank()` считается после `where`, и стоит условию разряда переехать
 * в подзапрос — места окажутся сквозными по всей книге, а показаны будут
 * тёлки. Список выглядит правильным, первое место у него сорок седьмое.
 *
 * Соединение с отёлами (`k`) размножает строки, если у животного больше
 * одного отёла и группировка потерялась. Корова с четырьмя отёлами
 * займёт четыре места подряд, и заметить это в пятистах строках нельзя.
 *
 * Отбор по владельцу применяется после присвоения места. Перенеси его
 * в `where` — и хозяйство увидит своё первое место в стаде как первое
 * место в стране. Это самая дорогая из возможных ошибок здесь: она
 * не портит данные, она врёт человеку ровно в том, ради чего он пришёл.
 *
 * Разряды обязаны делить книгу без пересечений: тёлка не может быть
 * одновременно младше и старше года, корова не может быть тёлкой.
 * Условия берутся из общего объявления (`sql-herd.ts`), но собраны здесь
 * руками, и собрать их можно неверно.
 *
 * ## Чего этот прогон не проверяет
 *
 * Правильность самих значений индекса — за неё отвечает `backfill:index`
 * и карточка животного. Здесь проверяется только порядок и отбор.
 *
 *   npm run check:ranking
 */

type Fail = string

async function main() {
  const payload = await getPayload({ config })
  const fails: Fail[] = []
  const profile = ASSOCIATION_PROFILE.key

  console.log(`Профиль: ${ASSOCIATION_PROFILE.name}`)

  /* ------------------------------------------------------------------ *
   *  1. Разряды делят книгу без пересечений                            *
   * ------------------------------------------------------------------ */

  const seen = new Map<number, RankingCategory>()
  const sizes: Record<string, number> = {}

  for (const c of RANKING_CATEGORIES) {
    /*
     * Потолок снят намеренно: пересечение разрядов ищется по всей книге,
     * а не по первым пятистам. Животное, попавшее в два разряда, вполне
     * может стоять в шестисотом месте одного из них.
     */
    const r = await loadRanking(payload, profile, c.key, { limit: 1_000_000 })
    sizes[c.key] = r.total

    for (const row of r.rows) {
      const other = seen.get(row.animalId)
      if (other) {
        fails.push(
          `животное ${row.animalId} (${row.identNumber ?? 'без номера'}) ` +
            `попало и в «${other}», и в «${c.key}»`,
        )
      }
      seen.set(row.animalId, c.key)
    }

    console.log(`  ${c.label}: ${r.total}`)
  }

  if (!seen.size) {
    console.log('  ✗ ни в одном разряде нет животных с посчитанным индексом')
    process.exit(1)
  }

  /* ------------------------------------------------------------------ *
   *  2. Порядок не возрастает, места начинаются с первого              *
   * ------------------------------------------------------------------ */

  for (const c of RANKING_CATEGORIES) {
    const r = await loadRanking(payload, profile, c.key)
    if (!r.rows.length) continue

    if (r.rows[0]!.position !== 1) {
      fails.push(`«${c.label}»: первое место равно ${r.rows[0]!.position}, а должно быть 1`)
    }

    let prevValue = Number.POSITIVE_INFINITY
    let prevPos = 0

    for (const row of r.rows) {
      if (row.value > prevValue) {
        fails.push(
          `«${c.label}»: место ${row.position} со значением ${row.value} ` +
            `стоит после значения ${prevValue} — порядок нарушен`,
        )
        break
      }
      if (row.position < prevPos) {
        fails.push(`«${c.label}»: место ${row.position} стоит после места ${prevPos}`)
        break
      }
      /*
       * Разделённые места допустимы и ожидаемы, а вот равное значение
       * с разными местами — нет: это означало бы, что `rank()` заменили
       * на `row_number()` и совпадения разорвали произвольно.
       */
      if (row.value === prevValue && row.position !== prevPos) {
        fails.push(
          `«${c.label}»: одинаковое значение ${row.value} получило места ` +
            `${prevPos} и ${row.position} — совпадения разорваны`,
        )
        break
      }
      prevValue = row.value
      prevPos = row.position
    }
  }

  /* ------------------------------------------------------------------ *
   *  3. Ни одно животное не занимает два места в своём разряде         *
   * ------------------------------------------------------------------ */

  for (const c of RANKING_CATEGORIES) {
    const r = await loadRanking(payload, profile, c.key)
    const ids = new Set<number>()
    for (const row of r.rows) {
      if (ids.has(row.animalId)) {
        fails.push(
          `«${c.label}»: животное ${row.animalId} встречается дважды — ` +
            `размножилось соединением с отёлами`,
        )
        break
      }
      ids.add(row.animalId)
    }
  }

  /* ------------------------------------------------------------------ *
   *  4. Отбор по хозяйству не сдвигает места                           *
   * ------------------------------------------------------------------ */

  const orgId = await biggestHerd(payload)

  if (orgId) {
    for (const c of RANKING_CATEGORIES) {
      const all = await loadRanking(payload, profile, c.key, { limit: 1_000_000 })
      const mine = await loadRanking(payload, profile, c.key, {
        ownerId: orgId,
        limit: 1_000_000,
      })

      const byId = new Map(all.rows.map((r) => [r.animalId, r.position]))

      for (const row of mine.rows) {
        const expected = byId.get(row.animalId)
        if (expected === undefined) {
          fails.push(`«${c.label}»: животное ${row.animalId} есть у хозяйства, но нет в книге`)
          break
        }
        if (expected !== row.position) {
          fails.push(
            `«${c.label}»: животное ${row.animalId} стоит на ${row.position} месте ` +
              `в списке хозяйства и на ${expected} — в книге; отбор сдвинул места`,
          )
          break
        }
      }

      if (mine.rows.length && mine.total !== all.total) {
        fails.push(
          `«${c.label}»: знаменатель у хозяйства ${mine.total}, ` +
            `а по книге ${all.total} — «из скольких» считается по своим`,
        )
      }
    }
    console.log(`  отбор по хозяйству ${orgId}: проверен`)
  } else {
    console.log('  ! хозяйств с животными нет — отбор по владельцу не проверялся')
  }

  /* ------------------------------------------------------------------ *
   *  5. Профили дают разный порядок                                    *
   * ------------------------------------------------------------------ */

  /*
   * Не придирка, а проверка того, что профиль вообще доезжает до запроса.
   * Опечатка в ключе профиля не роняет ничего: `where profile_key = $1`
   * просто не находит строк, и страница показывает пустой список — либо,
   * что хуже, ключ подставляется мимо и все профили дают один порядок.
   *
   * Совпадение порядка само по себе не ошибка (на десятке животных оно
   * вероятно), поэтому это предупреждение, а не отказ.
   */
  const sih = NATIONAL_PROFILES.find((p) => p.key === 'sih')
  if (sih) {
    const base = await loadRanking(payload, profile, 'heifers-old', { limit: 50 })
    const czech = await loadRanking(payload, sih.key, 'heifers-old', { limit: 50 })

    if (!czech.rows.length && base.rows.length) {
      fails.push(`профиль ${sih.key} не дал ни одной строки — значения по нему не посчитаны`)
    } else if (base.rows.length > 5) {
      const same = base.rows.every((r, i) => czech.rows[i]?.animalId === r.animalId)
      console.log(
        same
          ? `  ! порядок по «${sih.name}» совпал с «${ASSOCIATION_PROFILE.name}» — проверьте веса`
          : `  профили дают разный порядок: ${ASSOCIATION_PROFILE.name} ≠ ${sih.name}`,
      )
    }
  }

  /* ------------------------------------------------------------------ */

  if (fails.length) {
    console.log('')
    for (const f of fails) console.log(`  ✗ ${f}`)
    process.exit(1)
  }

  console.log('\n  ✓ рейтинг: порядок, разряды и отбор по хозяйству сходятся')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
