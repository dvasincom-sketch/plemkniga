import { NextResponse } from 'next/server'
import { getClient, getCurrentUser } from '@/lib/payload'
import { toCsv } from '@/lib/csv'
import { AGE_GROUPS, STATES } from '@/lib/dictionaries'

const label = (arr: readonly { value: string; label: string }[], v?: string | null) =>
  arr.find((o) => o.value === v)?.label ?? ''

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const format = (searchParams.get('format') || 'csv').toLowerCase()

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)

  const payload = await getClient()
  const result = await payload.find({
    collection: 'animals',
    where: orgId ? { owner: { equals: orgId } } : {},
    limit: 5000,
    depth: 1,
    sort: 'identNumber',
    overrideAccess: false,
    user,
  })

  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    return new NextResponse(JSON.stringify(result.docs, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="animals-${stamp}.json"`,
      },
    })
  }

  const headers = [
    'Инд.№',
    'Кличка',
    'Пол',
    'Состояние',
    'Возраст',
    'Дата рождения',
    'Удой, л',
    'Жир, %',
    'Белок, %',
    'Жир, кг',
    'Белок, кг',
    'СБП, кг',
    'ИПЦ',
    'Владелец',
  ]

  const rows = result.docs.map((a) => [
    a.identNumber,
    a.name ?? '',
    a.sex === 'male' ? 'М' : 'Ж',
    label(STATES, a.state),
    label(AGE_GROUPS, a.ageGroup),
    a.birthDate ? String(a.birthDate).slice(0, 10) : '',
    a.summary?.milkYield ?? '',
    a.summary?.fatPercent ?? '',
    a.summary?.proteinPercent ?? '',
    a.summary?.fatKg ?? '',
    a.summary?.proteinKg ?? '',
    a.summary?.fatProteinSum ?? '',
    a.ipc ?? '',
    typeof a.owner === 'object' && a.owner ? a.owner.name : '',
  ])

  return new NextResponse(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="animals-${stamp}.csv"`,
    },
  })
}
