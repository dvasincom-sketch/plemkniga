import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Liveness-проба: отвечает 200, пока жив процесс Node.
 *
 * Намеренно не обращается к базе. Docker HEALTHCHECK ходит именно сюда,
 * чтобы неверно заданная строка подключения не превращалась в «Deploy failed»:
 * контейнер поднимется, а причину будет видно на /healthz.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'plemkniga',
    uptimeSec: Math.round(process.uptime()),
  })
}
