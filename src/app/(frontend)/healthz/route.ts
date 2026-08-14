import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'

export const dynamic = 'force-dynamic'

/**
 * Проверка живости приложения и связи с базой.
 * Используется healthcheck'ом Docker и как первая точка диагностики деплоя.
 */
export async function GET() {
  const started = Date.now()

  const env = {
    DATABASE_URI: process.env.DATABASE_URI ? 'задана' : 'НЕ ЗАДАНА',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ? 'задан' : 'НЕ ЗАДАН',
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL ?? 'не задана',
    PAYLOAD_DB_PUSH: process.env.PAYLOAD_DB_PUSH ?? 'true (по умолчанию)',
    NODE_ENV: process.env.NODE_ENV,
  }

  try {
    const payload = await getClient()
    const { totalDocs } = await payload.count({ collection: 'animals', overrideAccess: true })

    return NextResponse.json({
      status: 'ok',
      service: 'plemkniga',
      database: { connected: true, animals: totalDocs },
      env,
      tookMs: Date.now() - started,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)

    // Подсказки по типовым ошибкам подключения к управляемому PostgreSQL
    const hints: string[] = []
    if (/no pg_hba|SSL|ssl/i.test(message)) {
      hints.push(
        'База требует TLS. Добавьте ?sslmode=require к DATABASE_URI, а если сертификат самоподписанный — переменную DATABASE_SSL_REJECT_UNAUTHORIZED=false',
      )
    }
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout/i.test(message)) {
      hints.push('Хост или порт базы недоступны из контейнера — проверьте строку подключения и сетевые правила')
    }
    if (/password authentication|role .* does not exist/i.test(message)) {
      hints.push('Не совпадают пользователь или пароль в DATABASE_URI')
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
        tookMs: Date.now() - started,
      },
      { status: 503 },
    )
  }
}
