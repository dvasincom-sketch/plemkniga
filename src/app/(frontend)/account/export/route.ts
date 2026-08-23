import { NextResponse } from 'next/server'
import { getClient, getCurrentUser } from '@/lib/payload'
import { toCsv } from '@/lib/csv'
import { AGE_GROUPS, STATES } from '@/lib/dictionaries'
import { EXPORT_LIMIT, exportFormat, toTsv, toXml } from '@/lib/export-formats'

/**
 * Выгрузка стада файлом.
 *
 * ## Что здесь было не так
 *
 * Карточка на странице обещала «pdf, xls/xlsx, csv, json, xml», обработчик
 * умел CSV и JSON. Разошлись они не по чьей-то невнимательности, а потому
 * что список форматов был написан в двух местах: словами в карточке
 * и ветвлением здесь. Теперь он один — `src/lib/export-formats.ts`,
 * и добавить формат в текст, не добавив в код, больше нельзя.
 *
 * ## Почему у JSON свой состав, а у остальных общий
 *
 * CSV, TXT и XML отдают один и тот же набор из четырнадцати полей: это
 * табличные форматы, и получателю нужен постоянный, предсказуемый состав
 * колонок. JSON отдаёт записи целиком, как они лежат в книге, — за ним
 * приходят именно тогда, когда таблицы мало. Разница намеренная, и она
 * названа в подсказке к каждому формату, чтобы не выяснялась опытом.
 */

const label = (arr: readonly { value: string; label: string }[], v?: string | null) =>
  arr.find((o) => o.value === v)?.label ?? ''

/**
 * Колонки таблицы: ключ для машины, заголовок для человека.
 *
 * Пара, а не два списка. Пока заголовки лежали отдельным массивом,
 * а значения — отдельным, порядок держался на честном слове: вставленная
 * в середину колонка сдвигала все значения вправо, и заметить это можно
 * было только глазами, открыв файл.
 */
const COLUMNS: { key: string; title: string }[] = [
  { key: 'identNumber', title: 'Инд.№' },
  { key: 'name', title: 'Кличка' },
  { key: 'sex', title: 'Пол' },
  { key: 'state', title: 'Состояние' },
  { key: 'ageGroup', title: 'Возраст' },
  { key: 'birthDate', title: 'Дата рождения' },
  { key: 'milkYield', title: 'Удой, кг' },
  { key: 'fatPercent', title: 'Жир, %' },
  { key: 'proteinPercent', title: 'Белок, %' },
  { key: 'fatKg', title: 'Жир, кг' },
  { key: 'proteinKg', title: 'Белок, кг' },
  { key: 'fatProteinSum', title: 'СБП, кг' },
  { key: 'ipc', title: 'ИПЦ' },
  { key: 'owner', title: 'Владелец' },
]

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const format = exportFormat(searchParams.get('format'))

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)

  const orgName =
    typeof user.organization === 'object' && user.organization
      ? String(user.organization.name ?? '')
      : ''

  const payload = await getClient()
  const result = await payload.find({
    collection: 'animals',
    where: orgId ? { owner: { equals: orgId } } : {},
    limit: EXPORT_LIMIT,
    depth: 1,
    sort: 'identNumber',
    overrideAccess: false,
    user,
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const file = (ext: string) => `attachment; filename="animals-${stamp}.${ext}"`

  /*
   * JSON — записи целиком и без перекладывания в колонки. За ним приходят
   * ровно тогда, когда таблицы мало: нужны родословная, идентификаторы,
   * события. Обрезать его до четырнадцати полей значило бы оставить
   * без ответа единственный вопрос, ради которого его выбирают.
   */
  if (format.value === 'json') {
    return new NextResponse(JSON.stringify(result.docs, null, 2), {
      headers: { 'Content-Type': format.mime, 'Content-Disposition': file(format.ext) },
    })
  }

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

  const titles = COLUMNS.map((c) => c.title)

  const body =
    format.value === 'xml'
      ? toXml(COLUMNS, rows, {
          /*
             Заголовок файла отвечает на вопросы, которые получатель иначе
             задаёт письмом: чьё стадо, на какое число выгружено и сколько
             записей ждать. В таблице для этого места нет — в разметке есть.
          */
          organization: orgName,
          exported: stamp,
          count: rows.length,
          /*
             Признак упёршейся выгрузки. В CSV и TXT его сказать негде,
             не сломав разбор, — там потолок назван в карточке до нажатия;
             здесь он есть, и молчать о нём незачем.
          */
          truncated: rows.length >= EXPORT_LIMIT ? 'true' : undefined,
        })
      : format.value === 'txt'
        ? toTsv(titles, rows)
        : toCsv(titles, rows)

  return new NextResponse(body, {
    headers: { 'Content-Type': format.mime, 'Content-Disposition': file(format.ext) },
  })
}
