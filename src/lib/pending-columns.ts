import type { Payload } from 'payload'

/**
 * Складывание неопознанных колонок в карантин.
 *
 * ## Правило
 *
 * Ни одна колонка не пропадает молча. Раньше нераспознанный заголовок
 * называли в отчёте и на этом забывали — то есть отказывались от данных,
 * которые хозяйство прислало. Здесь он превращается в запись, которую
 * Ассоциация разбирает: завести признак, отклонить или признать чужим
 * названием уже известного.
 *
 * ## Почему запись накапливается, а не создаётся заново
 *
 * Одна и та же «Упитанность» приезжает из десяти хозяйств. Десять
 * одинаковых строк — список, который невозможно разобрать, а решение
 * по ним принимается одно. Поэтому повторная встреча увеличивает счётчик,
 * дописывает хозяйство и обновляет дату, но не плодит запись.
 *
 * Уже разобранная колонка счётчик тоже обновляет, а решение сохраняет:
 * отклонили один раз — не спрашиваем снова у каждого следующего файла.
 * Иначе список «не разобрано» никогда не опустеет.
 *
 * ## Почему отказ здесь не роняет загрузку
 *
 * Карантин — служебная запись рядом с данными, а не сами данные. Упасть
 * на ней значило бы отвергнуть файл, который в остальном хорош, из-за
 * того, что мы не смогли записать заметку о его лишнем столбце. Отказ
 * попадает в лог: молчание тут было бы тем самым, против чего вся эта
 * затея.
 */

/** Сколько примеров значений хранить: десятка хватает, чтобы опознать шкалу. */
const SAMPLE_LIMIT = 10

export type UnknownColumn = {
  /** Как называлась в файле — дословно. */
  title: string
  /** Приведённое имя: тем же способом, каким загрузка сверяет заголовки. */
  normalized: string
  /** Значения из файла — не пустые, в порядке появления. */
  values: string[]
}

export async function quarantineColumns(
  payload: Payload,
  columns: UnknownColumn[],
  ctx: { datasetLabel?: string; organizationId?: number | null },
): Promise<void> {
  if (!columns.length) return

  const now = new Date().toISOString()

  for (const col of columns) {
    try {
      const found = await payload.find({
        collection: 'pending-columns',
        where: { normalized: { equals: col.normalized } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      const existing = found.docs[0]
      const filled = col.values.filter((v) => v !== '').length

      if (!existing) {
        await payload.create({
          collection: 'pending-columns',
          overrideAccess: true,
          data: {
            title: col.title,
            normalized: col.normalized,
            dataset: ctx.datasetLabel,
            status: 'new',
            seenTimes: 1,
            rowsWithValue: filled,
            firstSeenAt: now,
            lastSeenAt: now,
            samples: col.values.filter((v) => v !== '').slice(0, SAMPLE_LIMIT),
            organizations: ctx.organizationId ? [ctx.organizationId] : [],
          },
        })
        continue
      }

      /*
       * Хозяйства складываются множеством: одно и то же может присылать
       * колонку каждый месяц, и список из тридцати одинаковых ссылок
       * ничего не сообщает.
       */
      const orgs = new Set(
        ((existing.organizations ?? []) as (number | { id: number })[]).map((o) =>
          typeof o === 'number' ? o : o.id,
        ),
      )
      if (ctx.organizationId) orgs.add(ctx.organizationId)

      const samples = [
        ...((existing.samples as string[] | null | undefined) ?? []),
        ...col.values.filter((v) => v !== ''),
      ].slice(0, SAMPLE_LIMIT)

      await payload.update({
        collection: 'pending-columns',
        id: existing.id,
        overrideAccess: true,
        data: {
          seenTimes: (existing.seenTimes ?? 0) + 1,
          rowsWithValue: (existing.rowsWithValue ?? 0) + filled,
          lastSeenAt: now,
          samples,
          organizations: [...orgs],
        },
      })
    } catch (e) {
      payload.logger.warn(
        { err: e, column: col.title },
        'Неопознанную колонку не удалось положить в карантин',
      )
    }
  }
}
