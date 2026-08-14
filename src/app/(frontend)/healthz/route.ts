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
    const payload = await getClient()
    const { totalDocs } = await payload.count({ collection: 'animals', overrideAccess: true })

    return json({
      status: 'ok',
      service: 'plemkniga',
      database: { connected: true, animals: totalDocs },
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
    if (/ENOTFOUND|EAI_AGAIN|timeout/i.test(message)) {
      hints.push('Хост базы не резолвится из контейнера — проверьте адрес и сетевые правила')
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
