import { NextResponse } from 'next/server'
import { getClient } from '@/lib/payload'
import { ADE_VERSION } from '@/lib/ade/core'
import { adeLocation } from '@/lib/ade/resources'
import { ADE_COLLECTIONS, allowedLocations } from '@/lib/ade/serve'
import { adeUser } from '@/lib/ade/auth'

export const dynamic = 'force-dynamic'

/**
 * Перечень локаций, доступных обратившемуся.
 *
 *   GET /ade/v1/locations
 *
 * Точка входа во весь обмен: не зная номера хозяйства, чужая система
 * не составит ни одного адреса. Спецификация предусматривает этот путь
 * ровно для этого.
 *
 * Список формируется по правам, а не по книге: хозяйство видит здесь одну
 * свою строку и не узнаёт, сколько всего хозяйств в системе.
 *
 * Заодно отдаём перечень поддерживаемых коллекций. В стандарте такого
 * поля нет, и это наше добавление — но без него интегратор выясняет
 * границы обмена перебором адресов и четырьмя ответами «404».
 */
export async function GET(request: Request) {
  const payload = await getClient()
  const user = await adeUser(request, payload)

  if (!user) {
    return NextResponse.json(
      {
        resourceType: 'icarResponseMessageResource',
        severity: 'Error',
        message: 'Требуется авторизация: заголовок Authorization: JWT <токен>',
      },
      { status: 401 },
    )
  }

  const ids = await allowedLocations(payload, user)

  const orgs = ids.length
    ? await payload.find({
        collection: 'organizations',
        where: { id: { in: ids } },
        limit: 1000,
        depth: 0,
        sort: 'name',
        overrideAccess: true,
      })
    : { docs: [] as { id: number; name: string; shortName?: string | null }[] }

  const member = (orgs.docs as { id: number; name: string; shortName?: string | null }[]).map((o) =>
    adeLocation({ id: Number(o.id), name: o.name, shortName: o.shortName ?? null }),
  )

  return NextResponse.json(
    {
      view: { totalItems: member.length, pageSize: member.length, currentPage: 1, totalPages: 1 },
      member,
      supportedCollections: ADE_COLLECTIONS,
    },
    {
      headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
    },
  )
}
