import { adePush } from '@/lib/ade/push'

export const dynamic = 'force-dynamic'

/**
 * Приём в набор — множественное число пути.
 *
 * Разбор в `lib/ade/push.ts`; здесь только адрес.
 */
export async function POST(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params
  return adePush(request, dataset)
}
