import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/payload'
import { toCsv } from '@/lib/csv'
import { datasetByKey, templateRowsOf } from '@/lib/import-format'
import { toXlsx } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'

/**
 * Файл-шаблон для загрузки.
 *
 * ## Почему это важнее описания формата
 *
 * Описание колонок читают, а шаблон открывают в Excel и заполняют. Разница
 * в том, что при заполнении шаблона заголовки уже правильные — а именно
 * в них и была вся беда: система принимала «Инд.№», «инд№» и «номер»,
 * но не «Индив. номер», и файл уходил с ошибкой «не найдена колонка».
 *
 * ## Почему в шаблоне есть строка с примером
 *
 * Пустой файл с одними заголовками не показывает форматов: в каком виде
 * дата, точка или запятая в дробях, как пишется пол. Строка примера
 * отвечает на это молча, и её видно в той же ячейке, куда человек будет
 * писать своё.
 *
 * Её надо удалить перед загрузкой — об этом сказано на странице, а сама
 * строка при загрузке отвалится с понятной причиной: номер `RU1234567890`
 * либо не пройдёт проверку формата, либо заведёт одно очевидно лишнее
 * животное, которое видно в протоколе приёмки.
 *
 * Кодировка с BOM — как у выгрузок (`toCsv`): без неё Excel открывает
 * кириллицу в заголовках нечитаемой, и человек решает, что сломан файл.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Требуется авторизация', { status: 401 })

  /*
   * Набор задаётся адресом. Шаблонов теперь четыре — животные, отёлы,
   * осеменения, дойки, — и общего между ними только номер животного.
   * Один шаблон на все наборы означал бы таблицу, где в каждой строке
   * заполнена четверть ячеек.
   */
  const kind = new URL(request.url).searchParams.get('kind') ?? 'animals'
  const ds = datasetByKey(kind)
  if (!ds) return new NextResponse('Неизвестный вид данных', { status: 404 })

  const { headers, example } = templateRowsOf(ds)

  /*
   * Шаблон книгой — не украшение, а починка того самого места, ради
   * которого шаблон и заведён.
   *
   * Человек скачивает его, открывает в Excel и заполняет. Скачав CSV,
   * он открывает не файл, а результат догадок Excel о нём: индивидуальный
   * номер `0987654321` читается числом, ведущий ноль пропадает, и файл
   * возвращается к нам с номером, которого нет ни у одного животного.
   * Строку примера мы для того и клали, чтобы формат был виден — а Excel
   * успевает испортить её раньше, чем человек её увидит.
   *
   * В книге у ячейки есть тип, и весь шаблон уходит текстом. Это ровно
   * тот случай, когда «всё текстом» — не лень, а утверждение: колонок
   * с числами в шаблоне нет, потому что заполнять его будут поверх
   * примера, а пример показывает написание, а не величину.
   *
   * CSV остался и остаётся по умолчанию: его открывает то, что книгу
   * не откроет, — и в выгрузках хозяйств такое до сих пор встречается.
   */
  if (new URL(request.url).searchParams.get('format') === 'xlsx') {
    const buf = toXlsx(
      headers.map((title) => ({ title })),
      [example],
      { sheetName: ds.label },
    )
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="plemkniga-shablon-${ds.key}.xlsx"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
      },
    })
  }

  const body = toCsv(headers, [example])

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="plemkniga-shablon-${ds.key}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
