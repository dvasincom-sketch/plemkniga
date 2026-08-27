import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'
import { databaseEnvKeys, maskUri, resolveDatabase } from '@/lib/db-url'

export const dynamic = 'force-dynamic'

/**
 * Readiness-проба: связь с базой, видимые настройки, подсказки по ошибкам.
 *
 * Docker HEALTHCHECK ходит не сюда, а на /healthz/live — чтобы неверная
 * строка подключения не превращалась в «Deploy failed». Ключи ответа
 * латиницей: панели и консоли иногда угадывают кодировку неверно,
 * и русские имена полей превращаются в мусор ровно там, где нужна ясность.
 */
/** Сообщение верхнего уровня плюс все вложенные причины и поля ошибки PostgreSQL. */
function describeError(e: unknown): string {
  const parts: string[] = []
  let current: unknown = e
  const seen = new Set<unknown>()

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const err = current as { message?: string; code?: string; detail?: string; hint?: string; cause?: unknown }

    const own = [
      err.message?.trim(),
      err.code ? `код ${err.code}` : null,
      err.detail?.trim(),
      err.hint?.trim(),
    ]
      .filter(Boolean)
      .join(' · ')

    if (own && !parts.includes(own)) parts.push(own)
    current = err.cause
  }

  return parts.join(' ← ') || String(e)
}

/**
 * Сколько проба ждёт базу, прежде чем ответить без неё.
 *
 * Больше, чем срок соединения у пула (`connectionTimeoutMillis`, 5 с
 * в `payload.config.ts`), — чтобы обычная недоступность успела дойти сюда
 * настоящей ошибкой драйвера с её текстом и кодом, а не безликим «не успела».
 */
const PROBE_DEADLINE_MS = 8000

/**
 * Проба, которая может не ответить, бесполезна.
 *
 * Это не теория. Когда база замолчала — не отказала, а перестала отвечать, —
 * у пула не было срока на соединение, запрос висел, и `/healthz` не отдавал
 * ничего: ни `ok`, ни `error`, ни подсказок. Диагностика оказалась недоступна
 * ровно в том случае, ради которого написана, и причину пришлось искать
 * в архиве логов вместо одного запроса.
 *
 * Срок у пула эту дыру закрывает, но проба не должна зависеть от того, что
 * кто-то ниже настроен правильно. Своё ограничение здесь — на случай любого
 * другого зависания: медленного рукопожатия TLS, запроса, который не вернулся,
 * будущей правки в конфигурации.
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `база не ответила за ${ms} мс — проба прекратила ожидание, чтобы ответить. ` +
              'Молчание вместо отказа обычно означает, что пакеты до базы не доходят',
          ),
        ),
      ms,
    )
  })

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer)) as Promise<T>
}

export async function GET() {
  const started = Date.now()
  const db = resolveDatabase()

  const env = {
    connectionString: db.uri ? maskUri(db.uri) : 'НЕ НАЙДЕНА',
    connectionStringForDriver: db.driverUri ? maskUri(db.driverUri) : '—',
    takenFrom: db.source ?? '—',
    tls: db.sslMode,
    caCertificate: process.env.DATABASE_CA_CERT ? 'задан' : 'не задан',
    payloadSecret: process.env.PAYLOAD_SECRET ? 'задан' : 'НЕ ЗАДАН',
    serverUrl: process.env.NEXT_PUBLIC_SERVER_URL ?? 'не задана',
    dbPush: process.env.PAYLOAD_DB_PUSH ?? 'true (по умолчанию)',
    nodeEnv: process.env.NODE_ENV,
  }

  // Всё, что контейнер реально видит про базу: имена переменных + значения
  // без паролей. По этому списку сразу понятно, под каким именем платформа
  // передала строку подключения — и передала ли вообще.
  const visibleEnv = databaseEnvKeys()

  const json = (body: unknown) =>
    // Кодировку указываем явно — иначе часть клиентов читает JSON как cp1251
    new NextResponse(JSON.stringify(body, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })

  try {
    /*
     * Помимо связи с базой проба отвечает, докуда доехали миграции.
     *
     * Повод конкретный: выкладка прошла, страницы отдавали новый код,
     * а колонки из миграции в базе не было — и выяснить это удалось только
     * запросом к боевой базе с чужой машины. Миграции на проде прогоняет
     * сам контейнер при старте; вопрос «прогнал ли» задают каждый раз,
     * когда что-то идёт не так, и он должен иметь ответ по ссылке.
     *
     * Читается прямым запросом, а не через коллекцию: `payload_migrations` —
     * служебная таблица Payload, коллекции у неё нет.
     */
    const payload = await withDeadline(getClient(), PROBE_DEADLINE_MS)
    const { totalDocs } = await withDeadline(
      payload.count({ collection: 'animals', overrideAccess: true }),
      PROBE_DEADLINE_MS,
    )

    const migrations = await withDeadline(
      payload.db.pool
        .query(
          `select name, count(*) over ()::int as total
             from payload_migrations order by id desc limit 1`,
        )
        .then((r: { rows: { name?: string; total?: number }[] }) => ({
          applied: Number(r.rows[0]?.total ?? 0),
          last: r.rows[0]?.name ?? '—',
        }))
        .catch((e: unknown) => ({ applied: -1, last: `не прочитаны: ${describeError(e)}` })),
      PROBE_DEADLINE_MS,
    )

    return json({
      status: 'ok',
      service: 'plemkniga',
      database: { connected: true, animals: totalDocs },
      migrations,
      env,
      visibleEnv,
      tookMs: Date.now() - started,
    })
  } catch (e) {
    /*
     * Разворачиваем цепочку причин.
     *
     * Drizzle оборачивает ошибку драйвера в свою: наверху остаётся только
     * «Failed query: select count(*) from "animals"», а настоящая причина —
     * например, «relation "animals" does not exist» — лежит в cause.
     * Без этого диагностика показывает симптом вместо причины.
     */
    const message = describeError(e)
    const hints: string[] = []

    if (!db.uri) {
      hints.push(
        'Строка подключения не найдена ни под одним из имён: DATABASE_URI, DATABASE_URL, POSTGRES_URL, POSTGRES_URI, PG_URL, DB_URL. Посмотрите visibleEnv ниже — там всё, что контейнер видит про базу',
      )
      hints.push(
        'Если переменная в панели задана, проверьте, что она добавлена в переменные окружения приложения (runtime), а не в аргументы сборки, и что после сохранения запущен новый деплой',
      )
    }
    if (/self[- ]signed|certificate|unable to verify|CERT_/i.test(message)) {
      hints.push(
        'Сертификат базы не проходит проверку. Посмотрите поле connectionStringForDriver: в нём не должно быть sslmode — иначе драйвер игнорирует настройки TLS приложения и включает полную проверку',
      )
      hints.push(
        'Если проверка нужна, положите CA-сертификат провайдера (PEM или base64) в DATABASE_CA_CERT. Если не нужна — достаточно sslmode=require в исходной строке подключения',
      )
    }
    if (/no pg_hba|SSL off|sslmode/i.test(message)) {
      hints.push('База требует TLS — добавьте ?sslmode=require в конец строки подключения')
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
      hints.push('Хост базы не резолвится из контейнера — проверьте адрес и сетевые правила')
    }
    /*
     * Тишина и отказ — разные диагнозы, и путать их дорого.
     *
     * `ECONNREFUSED` означает, что до сервера дошли и он ответил «нельзя»:
     * порт закрыт, служба не поднята. `ETIMEDOUT` означает, что ответа
     * не было вовсе, — так ведёт себя файрвол и список доверенных IP:
     * они не отказывают, они выбрасывают пакеты. Отсюда и проверка:
     * порт с рабочей машины может быть открыт, а из контейнера — нет,
     * и это не «база лежит», а «база не пускает именно отсюда».
     */
    if (/ETIMEDOUT|ETIMEOUT|не ответила за|timeout/i.test(message)) {
      hints.push(
        'База молчит, а не отказывает: пакеты до неё не доходят. Обычно это список доверенных IP базы или файрвол — адрес контейнера в списке не значится либо сменился при перезапуске',
      )
      hints.push(
        'Проверить можно с любой машины: `nc -vz <хост> 5432`. Отвечает «succeeded» — база жива и пускает эту машину, значит дело в адресе контейнера. Висит без ответа — закрыто для всех',
      )
      hints.push(
        'Если приложение и база у одного провайдера, надёжнее строка подключения по внутреннему адресу — тогда список доверенных IP ни при чём',
      )
    }
    if (/ECONNREFUSED 127\.0\.0\.1|ECONNREFUSED ::1|ECONNREFUSED localhost/i.test(message)) {
      hints.push(
        'Приложение стучится в localhost — значит строка подключения до драйвера не дошла. Это проблема переменной окружения, а не сети',
      )
    } else if (/ECONNREFUSED/i.test(message)) {
      hints.push('Порт базы закрыт для контейнера — проверьте порт и сетевые правила')
    }
    if (/password authentication|role .* does not exist/i.test(message)) {
      hints.push('Не совпадают пользователь или пароль в строке подключения')
    }
    if (/database .* does not exist/i.test(message)) {
      hints.push('База с таким именем не создана — создайте её в панели или укажите существующую')
    }
    if (/could not create unique index|duplicate key|23505/i.test(message)) {
      hints.push(
        'В таблице есть повторяющиеся значения в поле, на которое ставится уникальный индекс. Схема не может обновиться, пока дубликаты не устранены — почистите данные или пересоздайте базу',
      )
    }
    if (/relation .* does not exist/i.test(message)) {
      hints.push('Схема не создана — запустите первый деплой с PAYLOAD_DB_PUSH=true')
    }

    return json({
      status: 'error',
      service: 'plemkniga',
      database: { connected: false, error: message },
      hints,
      env,
      visibleEnv,
      tookMs: Date.now() - started,
    })
  }
}
