import type { CollectionAfterDeleteHook, CollectionConfig } from 'payload'
import type { AdeCollectionName } from '@/lib/ade/core'

/**
 * Удаление оставляет след — одним местом на все коллекции.
 *
 * ## Почему обёрткой, а не правкой восьми файлов
 *
 * Хук нужен восьми коллекциям, и вписать его в каждую значило бы завести
 * восемь мест, где его можно забыть. Забывают обычно в новой: коллекция
 * появляется, попадает в обмен, а надгробий у неё нет — и партнёр
 * не узнаёт об удалениях именно там, где данные самые свежие.
 *
 * Обёртка ставится в одном месте — там же, где коллекция включается
 * в приложение, — и рядом с ней видно имя набора. Пропуск виден глазом.
 *
 * ## Что считается идентификатором
 *
 * То же, что уезжает в `meta.sourceId`, и никак иначе. Надгробие
 * с другим идентификатором бесполезно: клиент ищет у себя ровно ту
 * строку, которую мы ему прежде отдали, и не найдя — молча ничего
 * не удалит.
 *
 * Поэтому правило сборки идентификатора здесь повторено намеренно
 * близко к `resources.ts`, а `check:ade-generic` сверяет их между собой:
 * это единственная пара мест, которой позволено знать одно и то же,
 * и расхождение в ней тихое.
 *
 * ## Почему одна запись даёт несколько надгробий
 *
 * Перемещение уезжает в обмен тремя разными ресурсами — поступлением,
 * выбытием и падежом, — а лежит одной строкой. Удалив строку, надо
 * похоронить все ресурсы, которые из неё получались, иначе у партнёра
 * останется половина события. Лишнее надгробие безвредно: клиент,
 * у которого такого ресурса нет, по стандарту просто ничего не делает.
 */

export type TombstoneEntry = { dataset: AdeCollectionName; sourceId: string }

/**
 * Какие ресурсы получались из этой записи.
 *
 * `doc` приходит таким, каким был перед удалением: связи в нём номерами,
 * а не объектами, — на них и рассчитано.
 */
export function tombstoneEntries(
  dataset: AdeCollectionName,
  doc: Record<string, unknown>,
): TombstoneEntry[] {
  const id = String(doc.id)

  switch (dataset) {
    case 'animals':
      /* У животного идентификатор — его uuid; номер записи запасной. */
      return [{ dataset, sourceId: `animals:${(doc.uuid as string | null) ?? id}` }]

    case 'inseminations': {
      /*
       * Осеменение с проставленной датой теста уезжало ещё и проверкой
       * стельности — отдельным ресурсом в отдельном наборе. Похоронить
       * надо оба.
       */
      const out: TombstoneEntry[] = [{ dataset: 'inseminations', sourceId: `inseminations:${id}` }]
      if (doc.pregnancyCheckDate) {
        out.push({ dataset: 'pregnancy-checks', sourceId: `pregnancy-checks:${id}` })
      }
      return out
    }

    case 'breeding-values': {
      /*
       * У племенной ценности своего номера нет: ресурс собирается
       * из животного и ключа профиля. Не сумев их прочитать, надгробие
       * не ставим вовсе — неверный идентификатор хуже отсутствующего:
       * он не удалит ничего, но будет выглядеть как удаление.
       */
      const animal = doc.animal
      const animalId = typeof animal === 'object' && animal ? (animal as { id?: number }).id : animal
      if (!animalId || !doc.profileKey) return []
      return [{ dataset, sourceId: `breeding-values:${animalId}:${String(doc.profileKey)}` }]
    }

    case 'arrivals':
    case 'departures':
    case 'deaths':
      return doc.kind === 'death'
        ? [{ dataset: 'deaths', sourceId: `deaths:${id}` }]
        : [
            { dataset: 'arrivals', sourceId: `arrivals:${id}` },
            { dataset: 'departures', sourceId: `departures:${id}` },
          ]

    default:
      return [{ dataset, sourceId: `${dataset}:${id}` }]
  }
}

/** Хозяйство удалённой записи — сперва штамп, потом связь, потом никак. */
const locationOf = (doc: Record<string, unknown>): number | null => {
  const pick = (v: unknown): number | null => {
    if (typeof v === 'number') return v
    if (v && typeof v === 'object' && typeof (v as { id?: number }).id === 'number') {
      return (v as { id: number }).id
    }
    return null
  }

  /*
   * `ownerOrg` — штамп хозяйства на момент записи; он есть у событий
   * и переживает продажу животного. `owner` — у самого животного
   * и у племенной ценности. `from` — сторона, теряющая животное,
   * то есть та, у кого запись была всё это время.
   */
  return pick(doc.ownerOrg) ?? pick(doc.owner) ?? pick(doc.from) ?? null
}

/**
 * Приделать коллекции запись надгробий при удалении.
 *
 * Ошибка записи надгробия не рушит удаление: человек нажал «удалить»,
 * и запись уже удалена — падать после этого значит показать ему ошибку
 * там, где всё получилось. Но и промолчать нельзя: пропущенное надгробие
 * это будущее расхождение с партнёром, и оно должно попасть в журнал.
 */
export const withTombstones = (
  collection: CollectionConfig,
  dataset: AdeCollectionName,
): CollectionConfig => {
  const hook: CollectionAfterDeleteHook = async ({ req, doc }) => {
    const entries = tombstoneEntries(dataset, doc as Record<string, unknown>)
    const location = locationOf(doc as Record<string, unknown>)
    const deletedAt = new Date().toISOString()

    for (const e of entries) {
      try {
        await req.payload.create({
          collection: 'ade-tombstones',
          data: { dataset: e.dataset, sourceId: e.sourceId, deletedAt, location },
          overrideAccess: true,
        })
      } catch (err) {
        req.payload.logger.error(
          `[ade] надгробие не записано: ${e.sourceId} — ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterDelete: [...(collection.hooks?.afterDelete ?? []), hook],
    },
  }
}
