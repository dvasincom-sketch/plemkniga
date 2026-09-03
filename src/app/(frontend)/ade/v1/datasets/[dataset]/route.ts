import { NextResponse } from 'next/server'
import { ADE_COLLECTIONS, ADE_VERSION } from '@/lib/ade/core'
import { datasetOf, isDataset } from '@/lib/ade/datasets'
import { ADE_CODE, adeError, adeErrors } from '@/lib/ade/errors'
import { adeAuth } from '@/lib/ade/gate'

export const dynamic = 'force-dynamic'

/**
 * Один набор данных.
 *
 *   GET /ade/v1/datasets/{dataset}
 *
 * Отдаёт ровно то же описание, что и перечень. Отдельный адрес нужен
 * не ради новых сведений, а ради того, чтобы ссылка `url` из перечня
 * куда-то вела: клиент, сохранивший её, обязан получить по ней ответ,
 * а не «страница не найдена».
 */
export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const auth = await adeAuth(request)
  if (!auth.ok) return auth.response

  const { dataset } = await params

  if (!isDataset(dataset)) {
    return NextResponse.json(
      adeErrors(
        adeError(404, ADE_CODE.collectionUnknown, `Неизвестный набор «${dataset}»`, undefined, {
          supported: ADE_COLLECTIONS,
        }),
      ),
      { status: 404 },
    )
  }

  return NextResponse.json(datasetOf(dataset), {
    headers: { 'X-ICAR-ADE-Version': ADE_VERSION, 'Cache-Control': 'no-store' },
  })
}
