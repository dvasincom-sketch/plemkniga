import type { Payload, Where } from 'payload'
import { SCHEME } from '@/lib/ade/core'
import { ADE_CODE, adeError, type AdeError } from '@/lib/ade/errors'
import { type AdeIncoming, type AdeWritable, parseAdeResource } from '@/lib/ade/parse'
import { isCalvingEvent } from '@/lib/calving'

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

  const field = fieldForScheme(ident.scheme)
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

/**
 * Поле карточки, под которым живёт номер данной схемы.
 *
 * Список один на приём и на фильтры отдачи (`serve.ts`): пока их было
 * два, они разошлись — оба искали учётный идентификатор в поле
 * `accountingNumber`, которого у животного нет и не было. Наружу
 * под схемой `accountingid` уходит `animals.uuid` (`resources.ts`),
 * а обратно по нему ничего не находилось: событие с тем самым номером,
 * который мы же и отдали, получало «животное не найдено». Единственное
 * место, где поле существовало, — мок в `check:ade-accept`, и потому
 * прогон был зелёным.
 */
export const fieldForScheme = (scheme: string): string | null =>
  scheme === SCHEME.animal
    ? 'identNumber'
    : scheme === SCHEME.accounting
      ? 'uuid'
      : scheme === SCHEME.iso11785
        ? 'altIds.chipNumber'
        : scheme === SCHEME.fgias
          ? 'fgias.baseUuid'
          : null

/**
 * Бык осеменения — по любой из присланных схем, в любом хозяйстве.
 *
 * Не `findAnimal`: тот ищет у одной локации, а бык принадлежит станции
 * или другому хозяйству. Ненайденный бык — не отказ: осеменение
 * записывается без связи, как это делает и импорт файлов, но об этом
 * сказано в ответе.
 */
async function findBull(
  payload: Payload,
  ident: { scheme: string; id: string } | null,
): Promise<number | null> {
  if (!ident) return null
  const field = fieldForScheme(ident.scheme)
  if (!field) return null
  const { docs } = await payload.find({
    collection: 'animals',
    where: { and: [{ [field]: { equals: ident.id } }, { sex: { equals: 'male' } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })
  return docs.length === 1 ? Number(docs[0]!.id) : null
}

/**
 * Метод воспроизводства — записью справочника по коду: у осеменения
 * это связь, а не строка. Коды те же, что засевает `dictionaries-data.ts`.
 */
const METHOD_CODE: Record<string, string> = { natural: '2', embryo: '3' }

async function methodId(payload: Payload, method: string | null): Promise<number | null> {
  const code = method ? METHOD_CODE[method] : undefined
  if (!code) return null
  const { docs } = await payload.find({
    collection: 'reproduction-methods',
    where: { code: { equals: code } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ? Number(docs[0].id) : null
}

/**
 * Номер отёла, если его не прислали: следующий за последним записанным.
 * То же правило, что у формы (`actions/reproduction.ts`) и импорта.
 */
async function nextCalvingNumber(payload: Payload, animalId: number): Promise<number> {
  const { docs } = await payload.find({
    collection: 'calvings',
    where: { animal: { equals: animalId } },
    limit: 50,
    sort: '-number',
    depth: 0,
    overrideAccess: true,
  })
  const calvings = docs.filter((c) => isCalvingEvent(c.eventType))
  const top = calvings.reduce(
    (max, c) => (typeof c.number === 'number' && c.number > max ? c.number : max),
    0,
  )
  return Math.max(top, calvings.length) + 1
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
  linked: { number?: number; bull?: number | null; method?: number | null },
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
        /*
         * Номер отёла обязателен у коллекции, а стандарт его не требует.
         * Без этой строки приём отёлов не мог записать ни одной строки:
         * `payload.create` падал на валидации, ответ был 500 «Запись
         * не сохранена», а соответствие, карта ICAR и OpenAPI обещали
         * приём отёлов. `check:ade-accept` этого не видел — он сверяет
         * круг «отдача → разбор», до записи не доходя.
         */
        number: linked.number,
        eventType: 'calving',
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
        /*
         * Бык и метод пишутся, а не выбрасываются. Разбор их читал,
         * запись — нет: клиент получал 201, а в книге лежало осеменение
         * без быка, которое затем уезжало в ФГИАС придержанным
         * по «Базовому номеру быка».
         */
        bull: linked.bull ?? undefined,
        method: linked.method ?? undefined,
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

  const linked: { number?: number; bull?: number | null; method?: number | null } = {}
  if (collection === 'parturitions') {
    const parity = inc.values.parity as number | null | undefined
    const already = (found as { number?: unknown } | undefined)?.number
    linked.number =
      typeof parity === 'number'
        ? parity
        : typeof already === 'number'
          ? already
          : await nextCalvingNumber(payload, animalId)
  }
  if (collection === 'inseminations') {
    linked.bull = await findBull(payload, (inc.values.bullIdentifier as never) ?? null)
    linked.method = await methodId(payload, (inc.values.method as string | null) ?? null)
  }

  const data = {
    ...fieldsFor(collection, animalId, inc.values, linked),
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
