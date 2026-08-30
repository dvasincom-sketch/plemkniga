'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'

/**
 * Ввод отёлов, осеменений и контрольных доек по одному.
 *
 * ## Почему это появилось
 *
 * До сих пор эти три вида записей приходили **только файлом**. Логика была
 * такая: их много, их выгружают из доильного зала и из программы техника,
 * руками их никто вводить не станет.
 *
 * Логика верна для тысячи записей и неверна для пяти. «Отелилось пять коров
 * за неделю» — самый частый случай в хозяйстве, и для него не годился
 * ни один из двух путей: файл ради пяти строк никто делать не будет,
 * а карточки этих записей вообще не принимали. В результате пять отёлов
 * ждали ближайшей общей выгрузки, то есть месяц, и всё это время книга
 * знала о стаде меньше, чем сам зоотехник.
 *
 * ## Что здесь считается за человека
 *
 * Номер отёла и номер лактации не спрашиваются. Их знает система: номер
 * отёла — следующий за последним записанным, номер лактации — столько же.
 * Спрашивать у человека число, которое можно посчитать, — верный способ
 * получить его неверным: именно так появляются два отёла с номером один
 * и дыры в нумерации, которые потом ловят проверки.
 *
 * Если отёлы записаны не подряд (учёт начали с середины жизни коровы),
 * следующий номер всё равно окажется верным относительно уже имеющихся —
 * а несовпадение с настоящим номером отёла поймает проверка
 * `calving-number-gap` и покажет эксперту.
 */

export type RecordState = { error?: string; message?: string; created?: number }

type Actor = { id: number; role?: string | null; organization?: unknown }

const mayEdit = (user: Actor, ownerId: number | null): boolean =>
  user.role === 'admin' || (ownerId !== null && relId(user.organization) === ownerId)

const num = (form: FormData, key: string): number | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const iso = (form: FormData, key: string): string | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const text = (form: FormData, key: string): string | undefined =>
  String(form.get(key) ?? '').trim() || undefined

/**
 * Кто вводит и вправе ли.
 *
 * Тот же смысл, что у `guard` в `actions/events.ts`, и намеренно не общий
 * с ним код: там проверка привязана к ленте событий, здесь к таблицам
 * воспроизводства, и объединение свело бы два разных набора последствий
 * в одну функцию с флагами.
 */
async function guard(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }

  const animalId = Number(formData.get('animal'))
  if (!Number.isFinite(animalId) || animalId <= 0) {
    return { error: 'Не выбрано животное' as const }
  }

  const payload = await getClient()
  const animal = await payload
    .findByID({ collection: 'animals', id: animalId, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!animal) return { error: 'Запись не найдена' as const }

  if (!mayEdit(user as Actor, relId(animal.owner))) {
    return { error: 'Записывать можно только по животным своего хозяйства' as const }
  }

  return { user, payload, animal, animalId }
}

/** Сколько отёлов у коровы уже записано — по нему считается следующий номер. */
async function calvingCount(
  payload: Awaited<ReturnType<typeof getClient>>,
  animalId: number,
): Promise<number> {
  const { docs } = await payload.find({
    collection: 'calvings',
    where: { animal: { equals: animalId } },
    limit: 50,
    sort: '-number',
    depth: 0,
    overrideAccess: true,
  })

  const top = docs.reduce((max, c) => (typeof c.number === 'number' && c.number > max ? c.number : max), 0)
  // Отёлы могли быть записаны без номеров вовсе — тогда считаем по их числу
  return Math.max(top, docs.length)
}

/* ------------------------------------------------------------------ */
/*  Отёл                                                               */
/* ------------------------------------------------------------------ */

export async function addCalvingAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animal, animalId } = ctx

  if (animal.sex === 'male') return { error: 'Отёл записывается корове, а не быку' }

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата отёла обязательна' }
  if (new Date(date).getTime() > Date.now()) return { error: 'Дата отёла не может быть в будущем' }

  const eventType = text(formData, 'eventType') ?? 'calving'

  /*
   * Номер увеличивает только отёл. Аборт и запуск относятся к той
   * лактации, которая уже идёт, а не открывают новую: записать аборт
   * номером «следующий» значило бы сказать, что корова отелилась.
   *
   * Минимум единица: аборт у тёлки, которая ещё ни разу не телилась, —
   * событие первой стельности, и ноль здесь означал бы отсутствие
   * номера, а не первый.
   */
  const count = await calvingCount(payload, animalId)
  const nextNumber = eventType === 'calving' ? count + 1 : Math.max(count, 1)

  const what =
    eventType === 'abortion' ? 'аборт' : eventType === 'dryOff' ? 'запуск' : 'отёл'

  try {
    const created = (await payload.create({
      collection: 'calvings',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        number: nextNumber,
        date,
        eventType,
        result: (text(formData, 'result') ?? undefined) as never,
        ease: (text(formData, 'ease') ?? undefined) as never,
        /*
         * Числа приплода уходят только тогда, когда их ввели. Ноль
         * означает «посчитали, и никого», и подставлять его вместо
         * пустого поля значило бы утверждать это за человека.
         */
        liveHeifers: num(formData, 'liveHeifers') ?? undefined,
        liveBulls: num(formData, 'liveBulls') ?? undefined,
        stillborn: num(formData, 'stillborn') ?? undefined,
        calfWeight: num(formData, 'calfWeight') ?? undefined,
        dryOffDate: iso(formData, 'dryOffDate') ?? undefined,
        comment: text(formData, 'comment'),
      } as never,
    })) as { id: number }

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: `Записан ${what} № ${nextNumber}`, created: created.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : `Не удалось записать ${what}` }
  }
}

/* ------------------------------------------------------------------ */
/*  Осеменение                                                         */
/* ------------------------------------------------------------------ */

export async function addInseminationAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animal, animalId } = ctx

  if (animal.sex === 'male') return { error: 'Осеменяют корову или тёлку, а не быка' }

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата осеменения обязательна' }
  if (new Date(date).getTime() > Date.now()) {
    return { error: 'Дата осеменения не может быть в будущем' }
  }

  /*
   * Номер отёла у осеменения — это отёл, к которому оно относится, то есть
   * тот, который наступит. У тёлки отёлов нет, и номер равен единице:
   * её осеменяют в счёт первого.
   */
  const lactationNumber = (await calvingCount(payload, animalId)) + 1

  const bull = num(formData, 'bull')

  try {
    await payload.create({
      collection: 'inseminations',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        lactationNumber,
        ...(bull ? { bull } : {}),
        attemptNumber: num(formData, 'attemptNumber') ?? undefined,
        doses: num(formData, 'doses') ?? 1,
        technician: num(formData, 'technician') ?? undefined,
        comment: text(formData, 'comment'),
        source: 'manual',
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Осеменение записано' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать осеменение' }
  }
}

/* ------------------------------------------------------------------ */
/*  Контрольная дойка                                                  */
/* ------------------------------------------------------------------ */

export async function addMilkTestAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата дойки обязательна' }
  if (new Date(date).getTime() > Date.now()) {
    return { error: 'Дата контрольной дойки не может быть в будущем' }
  }

  const dailyYield = num(formData, 'dailyYield')
  if (dailyYield === null) return { error: 'Удой за день обязателен' }

  const lactationNumber = await calvingCount(payload, animalId)

  try {
    await payload.create({
      collection: 'milk-tests',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        dailyYield,
        ...(lactationNumber ? { lactationNumber } : {}),
        fatPercent: num(formData, 'fatPercent') ?? undefined,
        proteinPercent: num(formData, 'proteinPercent') ?? undefined,
        somaticCells: num(formData, 'somaticCells') ?? undefined,
        /*
         * Источник — «собственник», а не «лаборатория». Разница не
         * формальная: лабораторный замер и собственный имеют разный вес,
         * и записывать введённое руками как лабораторное значило бы
         * повышать доверие к числу самим фактом его ввода.
         */
        source: 'owner',
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Контрольная дойка записана' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать дойку' }
  }
}

/* ------------------------------------------------------------------ */

/**
 * Взвешивание.
 *
 * ## Почему здесь, рядом с дойкой
 *
 * По форме это одно и то же событие: животное, дата, число. Держать его
 * в другом файле значило бы развести два одинаковых пути и на третьем
 * шаге разойтись в мелочах — какую дату считать будущей, что делать
 * с номером лактации.
 *
 * ## Номер лактации считается, а не спрашивается
 *
 * Ровно как у дойки: он выводится из числа отёлов и потому не может
 * разойтись с ними. Спросить его у человека значило бы завести второй
 * ответ на вопрос, у которого уже есть первый.
 *
 * Для тёлки он выйдет нулевым, и это правильно: контракт реестра помечает
 * его «только для самок при наличии лактации», а взвешивают и молодняк.
 *
 * ## Признак не подставляется по умолчанию
 *
 * У дойки есть разумное умолчание — источник «собственник». У признака
 * взвешивания его нет: «при рождении» и «при продаже» одинаково вероятны,
 * и выбрать за человека значит записать неправду в поле, от которого
 * зависит смысл числа. Пустой признак честнее: выгрузка такую строку
 * придержит и назовёт причину.
 */
export async function addWeighingAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата взвешивания обязательна' }
  if (new Date(date).getTime() > Date.now()) {
    return { error: 'Дата взвешивания не может быть в будущем' }
  }

  const weight = num(formData, 'weight')
  if (weight === null) return { error: 'Живая масса обязательна' }
  if (weight <= 0) return { error: 'Живая масса должна быть больше нуля' }

  const lactationNumber = await calvingCount(payload, animalId)
  const sign = String(formData.get('sign') || '').trim()

  try {
    await payload.create({
      collection: 'weighings',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        weight,
        ...(sign ? { sign } : {}),
        ...(lactationNumber ? { lactationNumber } : {}),
        note: String(formData.get('note') || '').trim() || undefined,
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Взвешивание записано' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать взвешивание' }
  }
}

/**
 * Выставка.
 *
 * ## Почему запись идёт обновлением, а не созданием
 *
 * Выставки лежат массивом внутри животного (решение №264), поэтому новая
 * дописывается к прежним. Массив пишется целиком: прочитать, добавить,
 * записать — иначе запись затрёт всё, что было.
 *
 * ## Повтор не заводится дважды
 *
 * Тот же ключ, что при загрузке файлом: дата плюс приведённое название.
 * Человек, записавший выставку и не увидевший её в списке сразу,
 * нажимает «Записать» второй раз — и без этой проверки получил бы
 * две одинаковые строки.
 */
export async function addShowAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата мероприятия обязательна' }

  const title = String(formData.get('title') || '').trim()
  if (!title) return { error: 'Название мероприятия обязательно' }

  const key = (d: unknown, t: unknown) =>
    `${String(d ?? '').slice(0, 10)}|${String(t ?? '')
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')}`

  try {
    const animal = await payload.findByID({
      collection: 'animals',
      id: animalId,
      depth: 0,
      overrideAccess: true,
    })

    const had = Array.isArray((animal as { shows?: unknown[] }).shows)
      ? ((animal as { shows: Record<string, unknown>[] }).shows ?? [])
      : []

    if (had.some((s) => key(s.date, s.title) === key(date, title))) {
      return { error: 'Такая выставка у этого животного уже записана' }
    }

    await payload.update({
      collection: 'animals',
      id: animalId,
      overrideAccess: true,
      user,
      data: {
        shows: [
          ...had,
          {
            date,
            title,
            place: String(formData.get('place') || '').trim() || undefined,
            awards: String(formData.get('awards') || '').trim() || undefined,
            prize: String(formData.get('prize') || '').trim() || undefined,
          },
        ],
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Выставка записана' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать выставку' }
  }
}

/* ------------------------------------------------------------------ */
/*  Бонитировка                                                        */
/* ------------------------------------------------------------------ */

/**
 * Комплексный класс — записью с датой, а не правкой поля.
 *
 * ## Почему оценщик по умолчанию своё хозяйство
 *
 * Бонитировку почти всегда проводит само хозяйство, и заставлять
 * выбирать себя из списка организаций — лишний шаг там, где ответ
 * известен. Сторонний центр выбирается явно, и тогда умолчание
 * не срабатывает.
 *
 * Это не то же самое, что подставить признак взвешивания: там оба
 * ответа равновероятны, здесь один встречается в девяти случаях
 * из десяти.
 *
 * ## Дата обязательна
 *
 * Класс без даты — то самое, из-за чего эта коллекция и появилась:
 * в карточке он лежал именно так, и сказать, устарел ли он, было
 * нельзя. Повторять ту же дыру новым путём незачем.
 */
export async function addGradingAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата оценки обязательна' }
  if (new Date(date).getTime() > Date.now()) {
    return { error: 'Дата оценки не может быть в будущем' }
  }

  const grade = String(formData.get('grade') || '').trim()
  if (!grade) return { error: 'Комплексный класс обязателен' }

  const own = relId((user as { organization?: unknown }).organization)

  try {
    await payload.create({
      collection: 'gradings',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        grade,
        score: num(formData, 'score') ?? undefined,
        ...(own ? { assessorOrg: own } : {}),
        note: String(formData.get('note') || '').trim() || undefined,
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Бонитировка записана' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать бонитировку' }
  }
}
