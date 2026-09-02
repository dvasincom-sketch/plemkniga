import type { Payload, Where } from 'payload'
import { SCHEME } from '@/lib/ade/core'
import { ADE_CODE, adeError, type AdeError } from '@/lib/ade/errors'
import { type AdeIncoming, type AdeWritable, parseAdeResource } from '@/lib/ade/parse'

/**
 * Приём данных по ICAR ADE: от разобранного ресурса до записи в книге.
 *
 * ## Что здесь главное
 *
 * Не запись, а **повторная** запись. Отдача данных ошибается один раз
 * и видимо; приём ошибается тихо и накапливает: удвоенное контрольное
 * доение не бросается в глаза, но удваивает лактацию, которая из доений
 * считается, а лактация уходит и в индекс, и в реестр, и в свидетельство.
 *
 * Поэтому вся работа устроена вокруг пары «источник + его номер записи»:
 * пришло с тем же ключом — это то же событие, и его надо обновить,
 * а не завести заново.
 *
 * ## Почему уникальность в базе, а не здесь
 *
 * Здесь она тоже есть — сначала ищем, потом пишем. Но между поиском
 * и записью есть зазор, и именно в него приходит повтор при сбое сети:
 * клиент не дождался ответа и шлёт снова, запросы идут внахлёст, оба
 * поиска пусты, оба пишут. Частичный уникальный указатель в базе ловит
 * этот случай последним рубежом, и его нарушение мы разбираем как
 * «уже записано», а не как поломку.
 *
 * ## Чего приём не делает
 *
 * Не заводит животных. Событие принимается только у животного, которое
 * в книге уже есть и принадлежит той локации, от имени которой пришёл
 * запрос. Причина не техническая: запись животного — это утверждение
 * происхождения, за которое Ассоциация отвечает перед заводчиком,
 * и оно идёт заявкой с проверкой, а не строкой в потоке обмена
 * (`ADE_READ_ONLY_REASON` в `parse.ts`).
 */

/* ------------------------------------------------------------------ */

type Collection = 'milk-tests' | 'calvings' | 'inseminations' | 'weighings'

const TARGET: Record<AdeWritable, Collection> = {
  'test-day-results': 'milk-tests',
  parturitions: 'calvings',
  inseminations: 'inseminations',
  weights: 'weighings',
}

export type AcceptOutcome =
  | { ok: true; action: 'created' | 'updated' | 'deleted'; id: number }
  | { ok: false; errors: AdeError[] }

/* ------------------------------------------------------------------ *
 *  Животное по идентификатору                                        *
 * ------------------------------------------------------------------ */

/**
 * Найти животное по паре «схема + номер».
 *
 * Схемы ровно те, под которыми мы животных и отдаём: иначе получилось бы,
 * что забрать данные можно, а вернуть событие по тому же номеру нельзя.
 *
 * `null` возвращается и когда животного нет, и когда оно чужое, —
 * различать эти случаи в ответе нельзя: перебором номеров можно было бы
 * узнать, какие животные есть в книге.
 */
async function findAnimal(
  payload: Payload,
  ident: { scheme: string; id: string },
  orgId: number,
): Promise<number | null> {
  const byField = (field: string) =>
    payload.find({
      collection: 'animals',
      where: { and: [{ [field]: { equals: ident.id } }, { owner: { equals: orgId } }] },
      limit: 2,
      depth: 0,
      overrideAccess: true,
    })

  const field =
    ident.scheme === SCHEME.animal
      ? 'identNumber'
      : ident.scheme === SCHEME.accounting
        ? 'accountingNumber'
        : ident.scheme === SCHEME.iso11785
          ? 'altIds.chipNumber'
          : ident.scheme === SCHEME.fgias
            ? 'fgias.baseUuid'
            : null

  if (!field) return null

  const { docs } = await byField(field)

  /*
   * Две находки — это не «возьмём первую». Одинаковый номер у двух
   * животных одного хозяйства означает, что книга уже противоречива,
   * и дописать в неё событие наугад значит закрепить противоречие
   * в третьей записи. Пусть лучше откажет.
   */
  if (docs.length !== 1) return null

  return Number(docs[0]!.id)
}

/* ------------------------------------------------------------------ *
 *  Значения для записи                                               *
 * ------------------------------------------------------------------ */

/**
 * Лёгкость отёла из пятиступенчатой шкалы ICAR в нашу трёхступенчатую.
 *
 * Потеря здесь настоящая и названа в разборе разделов ICAR: ветеринарная
 * помощь и кесарево сечение оба приедут в «трудный». Обратное
 * превращение при отдаче тоже неточно — из «трудного» мы отдаём
 * `DifficultExtraAssistance`, то есть самую лёгкую из трёх тяжёлых.
 *
 * Значит, событие, прошедшее к нам и обратно, потеряет степень тяжести.
 * Это не повод не принимать: три ступени лучше, чем ничего, а пятая
 * шкала — отдельная работа с миграцией и переучиванием зоотехников.
 * Повод — записать потерю там, где она происходит.
 */
const easeIn = (v: unknown): string | null => {
  switch (v) {
    case 'EasyUnassisted':
      return 'easy'
    case 'EasyAssisted':
      return 'assisted'
    case 'DifficultExtraAssistance':
    case 'DifficultVeterinaryCare':
    case 'CaesareanOrSurgery':
      return 'hard'
    default:
      return null
  }
}

function fieldsFor(
  collection: AdeWritable,
  animalId: number,
  v: Record<string, unknown>,
): Record<string, unknown> {
  const common = { animal: animalId }

  switch (collection) {
    case 'test-day-results':
      return {
        ...common,
        date: v.date,
        dailyYield: v.dailyYield,
        fatPercent: v.fatPercent ?? undefined,
        proteinPercent: v.proteinPercent ?? undefined,
        somaticCells: v.somaticCells ?? undefined,
        /*
         * Источник данных помечается как «API» — это уже существующее
         * у коллекции поле, и оно отвечает на вопрос зоотехника «откуда
         * это взялось» без похода в боковую панель.
         */
        source: 'api',
      }

    case 'parturitions':
      return {
        ...common,
        date: v.date,
        ease: easeIn(v.ease) ?? undefined,
        /*
         * Приплод записывается ровно в той полноте, в какой он прислан.
         *
         * Перечень телят даёт и пол, и статус — тогда заполняется всё.
         * Одни числа дают только мертворождённых: `liveProgeny: 2`
         * не говорит, тёлочки это или бычки, и записать их в тёлочек
         * значило бы выдумать пол, который книга потом отдаст дальше
         * как факт.
         *
         * Пустой перечень не пишется вовсе: ноль — это не «телят
         * не было», а «не сказано», и записанный ноль сообщает
         * о мертворождении, которого не было.
         */
        ...(v.progenyKnown ? { stillborn: v.stillborn } : {}),
        ...(v.sexKnown ? { liveHeifers: v.liveHeifers, liveBulls: v.liveBulls } : {}),
      }

    case 'inseminations':
      return {
        ...common,
        date: v.date,
        attemptNumber: v.rank ?? undefined,
        source: 'api',
      }

    case 'weights':
      return { ...common, date: v.date, weight: v.weight }
  }
}

/* ------------------------------------------------------------------ *
 *  Запись                                                            *
 * ------------------------------------------------------------------ */

/*
 * Приведение типа в одном месте, а не в трёх.
 *
 * Коллекция здесь — переменная из четырёх возможных, и Payload не может
 * вывести форму данных, пока не знает, какая именно: у дойки и у отёла
 * разные поля. Сузить это без четырёх одинаковых веток нельзя.
 *
 * Приведение не отменяет проверок, а переносит их: состав полей задан
 * в `fieldsFor`, где коллекция известна точно и подсказка типов работает.
 * Здесь остаётся только передача.
 *
 * Отдельно: пока не прогнан `payload generate:types`, поля `ade`
 * в сгенерированных типах ещё нет вовсе, и без приведения не собралось
 * бы даже правильное обращение.
 */
type WriteArgs = Parameters<Payload['create']>[0]
type UpdateArgs = Parameters<Payload['update']>[0]

export async function acceptAdeResource(
  payload: Payload,
  collection: AdeWritable,
  orgId: number,
  body: unknown,
): Promise<AcceptOutcome> {
  const parsed = parseAdeResource(collection, body)
  if (!parsed.ok) return parsed

  const inc: AdeIncoming = parsed.value
  const target = TARGET[collection]

  const animalId = await findAnimal(payload, inc.animal, orgId)
  if (animalId === null) {
    return {
      ok: false,
      errors: [
        adeError(
          422,
          ADE_CODE.animalNotFound,
          'Животное не найдено в этой локации',
          'Обмен принимает события у животных, уже записанных в книге и принадлежащих этому хозяйству. Постановка на учёт идёт заявкой в кабинете.',
          { animal: inc.animal },
        ),
      ],
    }
  }

  const where: Where = {
    and: [{ 'ade.source': { equals: inc.source } }, { 'ade.sourceId': { equals: inc.sourceId } }],
  }

  const existing = await payload.find({
    collection: target,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const found = existing.docs[0]

  /* Источник снял запись у себя — снимаем и мы. */
  if (inc.deleted) {
    if (!found) {
      /*
       * Удаление того, чего нет, — успех, а не ошибка. Клиент повторяет
       * удаление ровно так же, как создание, и отвечать ему отказом
       * значило бы заставить его различать «не было» и «не смог»,
       * хотя итог для него один: записи нет.
       */
      return { ok: true, action: 'deleted', id: 0 }
    }
    await payload.delete({ collection: target, id: found.id, overrideAccess: true })
    return { ok: true, action: 'deleted', id: Number(found.id) }
  }

  const data = {
    ...fieldsFor(collection, animalId, inc.values),
    ade: { source: inc.source, sourceId: inc.sourceId },
  }

  try {
    if (found) {
      await payload.update({
        collection: target,
        id: found.id,
        data,
        overrideAccess: true,
      } as UpdateArgs)
      return { ok: true, action: 'updated', id: Number(found.id) }
    }

    const created = await payload.create({
      collection: target,
      data,
      overrideAccess: true,
    } as WriteArgs)
    return { ok: true, action: 'created', id: Number(created.id) }
  } catch (e) {
    /*
     * Нарушение уникального указателя — это не поломка, а тот самый
     * повтор, ради которого указатель и заведён: два запроса пришли
     * внахлёст, оба не нашли записи, один успел первым. Проигравший
     * должен ответить как победитель — запись есть, состояние нужное.
     *
     * Проверка по тексту сообщения, а не по коду драйвера: Payload
     * заворачивает ошибку базы, и код до нас не доходит.
     */
    const text = e instanceof Error ? e.message : String(e)
    if (/duplicate key|unique constraint|ade_origin_key/i.test(text)) {
      const again = await payload.find({
        collection: target,
        where,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const doc = again.docs[0]
      if (doc) return { ok: true, action: 'updated', id: Number(doc.id) }
    }

    return {
      ok: false,
      errors: [
        adeError(
          500,
          ADE_CODE.conflict,
          'Запись не сохранена',
          text.slice(0, 500),
          { collection, sourceId: inc.sourceId },
        ),
      ],
    }
  }
}
