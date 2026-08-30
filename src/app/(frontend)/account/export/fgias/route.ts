import { NextResponse } from 'next/server'
import { getClient, getCurrentUser } from '@/lib/payload'
import { toXlsx } from '@/lib/xlsx'
import {
  buildLactations,
  buildPedigree,
  buildShows,
  buildDna,
  buildWeighings,
  buildGrades,
  buildCalvings,
  type Built,
  type ExportAnimal,
  type PedigreeSource,
  type ShowAnimal,
  type DnaAnimal,
  type WeighingRow,
  type GradingAnimal,
  type CalvingAnimal,
} from '@/lib/fgias-export'
import { buildMain, type MainAnimal } from '@/lib/fgias-main'
import { fgiasExport } from '@/lib/fgias-exports'
import { weighingSignUuid } from '@/lib/weighing'
import { ISAG_LOCI, authMethodUuid, isagField, VERDICT_UUID } from '@/lib/isag'
import { gradeUuid, RUSSIA_CODE } from '@/lib/grading'
import { birthTypeOf, birthTypeUuid, calvingEaseUuid, calvingEventUuid } from '@/lib/calving'

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
  } else if (spec.key === 'dna') {
    /*
     * Тесты лежат массивом внутри животного, а лаборатория, метод
     * и группа крови — связями. Все три справочника читаются по разу
     * на выгрузку и раскладываются картами: полторы тысячи животных
     * против трёх запросов.
     */
    const [orgs, methods, bloodGroups] = await Promise.all([
      payload
        .find({ collection: 'organizations', limit: 0, pagination: false, depth: 0, overrideAccess: true })
        .then((res) => new Map((res.docs as unknown as Row[]).map((o) => [o.id as number, o]))),
      payload
        .find({ collection: 'dna-test-types', limit: 0, pagination: false, depth: 0, overrideAccess: true })
        .then((res) => new Map((res.docs as unknown as Row[]).map((d) => [d.id as number, txt(d.fgiasUuid)]))),
      payload
        .find({ collection: 'blood-groups', limit: 0, pagination: false, depth: 0, overrideAccess: true })
        .then((res) => new Map((res.docs as unknown as Row[]).map((d) => [d.id as number, txt(d.name)]))),
    ])

    const rows: DnaAnimal[] = herd.map((a) => {
      const tests = Array.isArray(a.dnaTests) ? (a.dnaTests as Row[]) : []
      return {
        identNumber: String(a.identNumber ?? ''),
        accountingId: txt(a.uuid),
        baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
        /*
         * Группа крови — свойство животного, а не теста: реестр спрашивает
         * её в этом шаблоне, но копия в каждом тесте разошлась бы
         * с оригиналом на первой же правке.
         */
        bloodGroup: bloodGroups.get(rel(a.bloodGroup) ?? -1) ?? null,
        dnaTests: tests.map((t) => {
          const lab = orgs.get(rel(t.laboratory) ?? -1)
          const loci: Record<string, string | null> = {}
          for (const l of ISAG_LOCI) loci[l] = txt(t[isagField(l)])
          return {
            date: txt(t.date),
            labName: lab ? txt(lab.name) : null,
            labInn: lab ? txt(lab.inn) : null,
            labKpp: lab ? txt(lab.kpp) : null,
            certificateNumber: txt(t.certificateNumber),
            certificateDate: txt(t.certificateDate),
            methodUuid: methods.get(rel(t.type) ?? -1) ?? null,
            authMethodUuid: authMethodUuid(txt(t.authMethod)) ?? null,
            verdictUuid: VERDICT_UUID[String(t.verdict ?? '')] ?? null,
            snpCount: typeof t.snpCount === 'number' ? t.snpCount : null,
            loci,
          }
        }),
      }
    })
    built = buildDna(rows)
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
  } else if (spec.key === 'grades') {
    /*
     * Бонитировки лежат своей коллекцией. Оценщик читается связью,
     * и организации берутся все, а не только своя: бонитировку часто
     * проводит сторонний центр.
     *
     * Страна регистрации — ключ России из справочника `countries`,
     * который загружается `npm run sync:fgias-geo`. Не константой:
     * страна одна и та же, а ключ у реестра свой и меняется вместе
     * с версией справочника. Если справочник не загружен, колонка
     * уйдёт пустой — и это видно в файле, в отличие от подставленного
     * наугад ключа.
     */
    const [orgs, russia, byAnimal] = await Promise.all([
      payload
        .find({ collection: 'organizations', limit: 0, pagination: false, depth: 0, overrideAccess: true })
        .then((res) => new Map((res.docs as unknown as Row[]).map((o) => [o.id as number, o]))),
      payload
        .find({
          collection: 'countries',
          where: { code: { equals: RUSSIA_CODE } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        .then((res) => txt((res.docs as unknown as Row[])[0]?.fgiasUuid)),
      (async () => {
        const map = new Map<number, Row[]>()
        for (let page = 1; ; page++) {
          const res = await payload.find({
            collection: 'gradings',
            where: { animal: { in: herd.map((a) => a.id as number) } },
            limit: 500,
            page,
            sort: 'id',
            depth: 0,
            overrideAccess: true,
          })
          for (const g of res.docs as unknown as Row[]) {
            const id = rel(g.animal)
            if (id === null) continue
            const list = map.get(id) ?? []
            list.push(g)
            map.set(id, list)
          }
          if (!res.hasNextPage) break
        }
        return map
      })(),
    ])

    const rows: GradingAnimal[] = herd.map((a) => ({
      identNumber: String(a.identNumber ?? ''),
      accountingId: txt(a.uuid),
      baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
      gradings: (byAnimal.get(a.id as number) ?? []).map((g) => {
        const org = orgs.get(rel(g.assessorOrg) ?? -1)
        const inn = org ? txt(org.inn) : null
        return {
          date: txt(g.date),
          gradeUuid: gradeUuid(txt(g.grade)) ?? null,
          score: typeof g.score === 'number' ? g.score : null,
          assessor: org
            ? {
                name: txt(org.name),
                inn,
                kpp: txt(org.kpp),
                /* ИНН выдаёт Россия — организация с ИНН в ней и зарегистрирована. */
                countryUuid: inn ? russia : null,
              }
            : null,
        }
      }),
    }))
    built = buildGrades(rows)
  } else if (spec.key === 'calvings') {
    /*
     * Тип рождения берётся из поля, а если его не заполнили — считается
     * по числам приплода. Второе не догадка: сумма плодов и есть то,
     * что спрашивает колонка, и «один» при одном телёнке верно всегда.
     */
    const byAnimal = new Map<number, CalvingAnimal['calvings']>()
    for (let page = 1; ; page++) {
      const res = await payload.find({
        collection: 'calvings',
        where: { animal: { in: herd.map((a) => a.id as number) } },
        limit: 500,
        page,
        sort: 'id',
        depth: 0,
        overrideAccess: true,
      })
      for (const c of res.docs as unknown as Row[]) {
        const id = rel(c.animal)
        if (id === null) continue
        const num = (v: unknown) => (typeof v === 'number' ? v : null)
        const counts = {
          liveHeifers: num(c.liveHeifers),
          liveBulls: num(c.liveBulls),
          stillborn: num(c.stillborn),
        }
        const list = byAnimal.get(id) ?? []
        list.push({
          date: txt(c.date),
          eventUuid: calvingEventUuid(txt(c.eventType) ?? 'calving') ?? null,
          birthTypeUuid: birthTypeUuid(txt(c.result) ?? birthTypeOf(counts)) ?? null,
          easeUuid: calvingEaseUuid(txt(c.ease)) ?? null,
          number: num(c.number),
          ...counts,
        })
        byAnimal.set(id, list)
      }
      if (!res.hasNextPage) break
    }

    const rows: CalvingAnimal[] = herd.map((a) => ({
      identNumber: String(a.identNumber ?? ''),
      accountingId: txt(a.uuid),
      baseUuid: txt((a.fgias as Row | undefined)?.baseUuid),
      calvings: byAnimal.get(a.id as number) ?? [],
    }))
    built = buildCalvings(rows)
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

    const [breeds, breedTypes, lines, colors, purposes, methods, geo, orgs, org] =
      await Promise.all([
        keyMap('breeds'),
        keyMap('breed-types'),
        keyMap('lines'),
        keyMap('coat-colors'),
        keyMap('animal-purposes'),
        keyMap('reproduction-methods'),
        /*
         * Территория — три справочника в одной карте: страна, регион
         * и район не пересекаются по идентификаторам, потому что это
         * разные коллекции, и класть их порознь значило бы завести три
         * почти одинаковых обращения ради одного и того же вопроса
         * «какой у этой записи ключ реестра».
         */
        Promise.all([keyMap('countries'), keyMap('regions'), keyMap('districts')]).then(
          ([c, rg, d]) => ({ countries: c, regions: rg, districts: d }),
        ),
        /*
         * Все организации, а не только своя: хозяйство при рождении —
         * чужое почти всегда, ради того поле и заведено.
         */
        payload
          .find({
            collection: 'organizations',
            limit: 0,
            pagination: false,
            depth: 0,
            overrideAccess: true,
          })
          .then((res) => new Map((res.docs as unknown as Row[]).map((o) => [o.id as number, o]))),
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
      const birth = (a.birthPlace as Row | undefined) ?? {}
      const birthFarm = orgs.get(rel(birth.farm) ?? -1)
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
        breedTypeUuid: breedTypes.get(rel(a.breedType) ?? -1) ?? null,
        breedDate: txt(a.breedDate),
        lineUuid: lines.get(rel(a.line) ?? -1) ?? null,
        coatColorUuid: colors.get(rel(a.coatColor) ?? -1) ?? null,
        purposeUuid: purposes.get(rel(a.purpose) ?? -1) ?? null,
        purposeDate: txt(a.purposeDate),
        receiptMethodUuid: methods.get(rel(a.receiptMethod) ?? -1) ?? null,
        birthCountryUuid: geo.countries.get(rel(birth.country) ?? -1) ?? null,
        birthRegionUuid: geo.regions.get(rel(birth.region) ?? -1) ?? null,
        birthDistrictUuid: geo.districts.get(rel(birth.district) ?? -1) ?? null,
        /*
         * Реквизиты хозяйства рождения берутся из связи, а названием
         * подменяются, только если связи нет. ИНН и КПП при этом
         * не выдумываются: у хозяйства, которого нет в книге, их
         * взять неоткуда, и пустая ячейка честнее любой подстановки.
         */
        birthFarm: birthFarm
          ? {
              name: txt(birthFarm.name),
              inn: txt(birthFarm.inn),
              kpp: txt(birthFarm.kpp),
              ogrn: txt(birthFarm.ogrn),
            }
          : txt(birth.farmName)
            ? { name: txt(birth.farmName) }
            : null,
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
