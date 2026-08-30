import { NextResponse } from 'next/server'
import { getClient, getCurrentUser } from '@/lib/payload'
import { toXlsx } from '@/lib/xlsx'
import {
  buildLactations,
  buildPedigree,
  buildShows,
  buildWeighings,
  type Built,
  type ExportAnimal,
  type PedigreeSource,
  type ShowAnimal,
  type WeighingRow,
} from '@/lib/fgias-export'
import { buildMain, type MainAnimal } from '@/lib/fgias-main'
import { fgiasExport } from '@/lib/fgias-exports'
import { weighingSignUuid } from '@/lib/weighing'

/**
 * Выгрузка в шаблоны ФГИАС ПР — из кабинета, кнопкой.
 *
 * ## Почему это отдельная ручка, а не формат в общей выгрузке
 *
 * В общей выгрузке пять форматов, и все они отдают одну и ту же таблицу
 * из четырнадцати колонок: XLSX, CSV, TXT, XML и JSON — это про то,
 * *чем* открыть файл. ФГИАС — не формат, а получатель: другой состав
 * колонок, другие заголовки, другие значения (ключи вместо слов)
 * и три разных шаблона вместо одной таблицы.
 *
 * Положить его шестым пунктом в тот же список значило бы сказать
 * человеку, что «ФГИАС» стоит в одном ряду с «CSV», — и он выбрал бы
 * его, ожидая своё стадо в привычных колонках.
 *
 * ## Стадо своё, и это единственное правило доступа
 *
 * Как и в общей выгрузке: `owner = orgId` и есть правило целиком.
 * Сотрудник Ассоциации в этот кабинет не попадает, точечные разрешения
 * на чужих животных в выгрузку не входили никогда.
 *
 * ## Отчёта здесь нет, и это осознанно
 *
 * Скрипт `npm run export:fgias` печатает, что придержано и почему.
 * Ручка отдаёт файл — сказать что-то помимо файла ей нечем, а
 * приделывать к скачиванию второй ответ значит делать вид, что человек
 * его прочтёт. Поэтому число уехавших строк стоит в имени файла:
 * `КРС_Лактация-1080-строк.xlsx` читается до открытия и не теряется.
 */

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const spec = fgiasExport(searchParams.get('template'))

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)

  if (typeof orgId !== 'number') {
    return NextResponse.json({ error: 'У пользователя не заполнена организация' }, { status: 400 })
  }

  const payload = await getClient()

  /*
   * Страницами и с сортировкой по `id`. Без сортировки листание берёт
   * порядок коллекции по умолчанию, а он не уникален: `LIMIT/OFFSET`
   * по такому ключу возвращает часть строк дважды, а часть теряет
   * (решение №229).
   */
  type Row = Record<string, unknown>
  const herd: Row[] = []
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId }, archived: { not_equals: true } },
      limit: 500,
      page,
      sort: 'id',
      depth: 0,
      overrideAccess: true,
    })
    herd.push(...(res.docs as unknown as Row[]))
    if (!res.hasNextPage) break
  }

  const rel = (v: unknown): number | null =>
    typeof v === 'number' ? v : v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : null
  const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

  let built: Built

  if (spec.key === 'pedigree') {
    const rows: PedigreeSource[] = herd.map((a) => ({
      id: a.id as number,
      identNumber: String(a.identNumber ?? ''),
      baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
      fatherId: rel(a.father),
      motherId: rel(a.mother),
      idFormat: txt(a.idFormat),
    }))
    built = buildPedigree(rows)
  } else if (spec.key === 'weighings') {
    /*
     * Взвешивания лежат своей коллекцией, а не массивом на животном,
     * поэтому читаются отдельным запросом и раскладываются по животным.
     * Один запрос на всё стадо: по строке на животное было бы полторы
     * тысячи запросов ради одной таблицы.
     */
    const byAnimal = new Map<number, WeighingRow['weighings']>()
    for (let page = 1; ; page++) {
      const res = await payload.find({
        collection: 'weighings',
        where: { animal: { in: herd.map((a) => a.id as number) } },
        limit: 500,
        page,
        sort: 'id',
        depth: 0,
        overrideAccess: true,
      })
      for (const w of res.docs as unknown as Row[]) {
        const id = rel(w.animal)
        if (id === null) continue
        const list = byAnimal.get(id) ?? []
        list.push({
          date: txt(w.date),
          weight: typeof w.weight === 'number' ? w.weight : null,
          signUuid: weighingSignUuid(txt(w.sign)) ?? null,
          lactationNumber: typeof w.lactationNumber === 'number' ? w.lactationNumber : null,
        })
        byAnimal.set(id, list)
      }
      if (!res.hasNextPage) break
    }

    const rows: WeighingRow[] = herd.map((a) => ({
      identNumber: String(a.identNumber ?? ''),
      accountingId: txt(a.uuid),
      baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
      weighings: byAnimal.get(a.id as number) ?? [],
    }))
    built = buildWeighings(rows)
  } else if (spec.key === 'shows') {
    const rows: ShowAnimal[] = herd.map((a) => ({
      identNumber: String(a.identNumber ?? ''),
      accountingId: txt(a.uuid),
      baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
      shows: Array.isArray(a.shows) ? (a.shows as never[]) : [],
    }))
    built = buildShows(rows)
  } else if (spec.key === 'lactations') {
    const rows: ExportAnimal[] = herd.map((a) => ({
      identNumber: String(a.identNumber ?? ''),
      accountingId: txt(a.uuid),
      baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
      lactations: Array.isArray(a.lactations) ? (a.lactations as never[]) : [],
    }))
    built = buildLactations(rows)
  } else {
    /*
     * «Основные сведения» тянут за собой справочники и реквизиты
     * собственника. Справочники читаются целиком по одному разу
     * на выгрузку, а не на животное: пять запросов против семи тысяч.
     */
    const keyMap = async (collection: string) => {
      const res = await payload.find({
        collection: collection as never,
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const out = new Map<number, string>()
      for (const d of res.docs as unknown as Row[]) {
        const uuid = txt(d.fgiasUuid)
        if (uuid) out.set(d.id as number, uuid)
      }
      return out
    }

    const [breeds, lines, colors, purposes, org] = await Promise.all([
      keyMap('breeds'),
      keyMap('lines'),
      keyMap('coat-colors'),
      keyMap('animal-purposes'),
      payload
        .findByID({ collection: 'organizations', id: orgId, depth: 0, overrideAccess: true })
        .catch(() => null),
    ])

    /*
     * Через `unknown`: у организации есть свой тип, и приводить его
     * к «объекту с любыми ключами» напрямую TypeScript не даёт — правильно
     * не даёт. Нам здесь и правда нужны четыре поля по именам, а не тип
     * целиком.
     */
    const o = (org ?? null) as unknown as Record<string, unknown> | null
    const owner = o
      ? { name: txt(o.name), inn: txt(o.inn), kpp: txt(o.kpp), ogrn: txt(o.ogrn) }
      : null

    const rows: MainAnimal[] = herd.map((a) => {
      const fgias = (a.fgias as Row | undefined) ?? {}
      const alt = (a.altIds as Row | undefined) ?? {}
      return {
        identNumber: String(a.identNumber ?? ''),
        accountingId: txt(a.uuid),
        baseUuid: txt(fgias.baseUuid),
        registrationUuid: txt(fgias.registrationUuid),
        unsm: txt(fgias.unsm),
        name: txt(a.name),
        birthDate: txt(a.birthDate),
        sex: txt(a.sex),
        ageGroup: txt(a.ageGroup),
        ageGroupDate: txt(a.ageGroupDate),
        bloodPercent: typeof a.bloodPercent === 'number' ? a.bloodPercent : null,
        inventoryNumber: txt(alt.inventoryNumber),
        breedUuid: breeds.get(rel(a.breed) ?? -1) ?? null,
        lineUuid: lines.get(rel(a.line) ?? -1) ?? null,
        coatColorUuid: colors.get(rel(a.coatColor) ?? -1) ?? null,
        purposeUuid: purposes.get(rel(a.purpose) ?? -1) ?? null,
        owner,
      }
    })

    const main = buildMain(rows)
    built = { ...main, rounded: 0 }
  }

  const buf = toXlsx(
    built.columns.map((c) => ({
      title: c.title,
      numeric: c.type === 'int' || c.type === 'float',
      width: c.width,
    })),
    built.rows,
    { sheetName: 'Пример' },
  )

  /*
   * Число строк в имени файла. Это единственное место, где ручка может
   * что-то сказать помимо содержимого: файл на ноль строк выглядит
   * как файл, и человек узнаёт правду, только открыв его, — а имя видно
   * ещё в списке загрузок.
   */
  const name = `${spec.file}-${built.rows.length}-строк.xlsx`

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Length': String(buf.length),
    },
  })
}

export const dynamic = 'force-dynamic'
