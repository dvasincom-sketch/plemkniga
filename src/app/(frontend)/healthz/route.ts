import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'
import { databaseEnvKeys, maskUri, resolveDatabase } from '@/lib/db-url'

export const dynamic = 'force-dynamic'

/**
 * Readiness-проба: связь с базой, видимые настройки, подсказки по ошибкам.
 * Docker HEALTHCHECK ходит не сюда, а на /healthz/live — чтобы неверная
 * строка подключения не превращалась в «Deploy failed».
 */
export async function GET() {
  const started = Date.now()
  const db = resolveDatabase()

  const env = {
    строкаПодключения: db.uri ? maskUri(db.uri) : 'НЕ НАЙДЕНА',
    взятаИз: db.source ?? '—',
    TLS: db.ssl ? 'включён' : 'выключен',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ? 'задан' : 'НЕ ЗАДАН',
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL ?? 'не задана',
    PAYLOAD_DB_PUSH: process.env.PAYLOAD_DB_PUSH ?? 'true (по умолчанию)',
    NODE_ENV: process.env.NODE_ENV,
  }

  // Всё, что контейнер реально видит про базу: имена переменных + значения
  // без паролей. По этому списку сразу понятно, под каким именем платформа
  // передала строку подключения — и передала ли вообще.
  const visibleEnv = databaseEnvKeys()

  try {
    const payload = await getClient()
    const { totalDocs } = await payload.count({ collection: 'animals', overrideAccess: true })

    return NextResponse.json({
      status: 'ok',
      service: 'plemkniga',
      database: { connected: true, animals: totalDocs },
      env,
      visibleEnv,
      tookMs: Date.now() - started,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)

    // Подсказки по типовым ошибкам подключения к управляемому PostgreSQL
    const hints: string[] = []

    if (!db.uri) {
      hints.push(
        'Строка подключения не найдена ни под одним из имён: DATABASE_URI, DATABASE_URL, POSTGRES_URL, POSTGRES_URI, PG_URL, DB_URL. Посмотрите список visibleEnv ниже — там перечислено всё, что контейнер видит про базу',
      )
      hints.push(
        'Если переменная в панели задана, проверьте, что она добавлена именно в переменные окружения приложения (runtime), а не в аргументы сборки, и что после сохранения был запущен новый деплой',
      )
    }
    if (/no pg_hba|SSL|ssl/i.test(message)) {
      hints.push(
        'База требует TLS. Добавьте ?sslmode=require к строке подключения, а если сертификат самоподписанный — переменную DATABASE_SSL_REJECT_UNAUTHORIZED=false',
      )
    }
    if (/ENOTFOUND|EAI_AGAIN|timeout/i.test(message)) {
      hints.push('Хост базы не резолвится из контейнера — проверьте адрес и сетевые правила')
    }
    if (/ECONNREFUSED 127\.0\.0\.1|ECONNREFUSED ::1|ECONNREFUSED localhost/i.test(message)) {
      hints.push(
        'Приложение стучится в localhost — значит строка подключения до драйвера не дошла. Это всегда проблема переменной окружения, а не сети',
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
    if (/relation .* does not exist/i.test(message)) {
      hints.push('Схема не создана — запустите первый деплой с PAYLOAD_DB_PUSH=true')
    }

    return NextResponse.json(
      {
        status: 'error',
        service: 'plemkniga',
        database: { connected: false, error: message },
        hints,
        env,
        visibleEnv,
        tookMs: Date.now() - started,
      },
      { status: 503 },
    )
  }
}
