import Link from 'next/link'
import { nf, dateRu, signed } from '@/lib/format'
import type { Ranking } from '@/lib/ranking'

/**
 * Таблица рейтинга — общая для кабинета Ассоциации и кабинета хозяйства.
 *
 * Одна таблица на два кабинета, а не две похожих: расхождение здесь стоило бы
 * доверия к самому рейтингу. Эксперт звонит про сорок седьмое место, зоотехник
 * открывает свой кабинет и видит пятьдесят второе — после такого разговора
 * не верят уже ни одному числу. Разница между кабинетами только в том, какие
 * строки в неё попали; сами строки считаются и рисуются одинаково.
 *
 * ## Почему колонки такие
 *
 * Набор списан с чешского TOP-500 и держится на одном соображении: по этой
 * строке животное должно узнаваться без открытия карточки. Отсюда и отец,
 * и отец матери — половина родословной, по которой заводчик опознаёт
 * животное быстрее, чем по кличке.
 *
 * Достоверность стоит рядом со значением намеренно. Индекс 132 при сорока
 * трёх дочерях и 133 при тысяче двухстах — разные объекты, и показывать
 * их одинаково означало бы соврать. У чехов достоверность выписана
 * отдельными колонками по каждой части оценки; у нас она пока одна,
 * и это честнее, чем изобразить больше, чем посчитано.
 *
 * ## Почему разделённые места не разрываются
 *
 * Восьмых мест в чешском списке три подряд, одиннадцатых пять, 478-х семь.
 * Индекс округлён, совпадения неизбежны, и разрывать их по алфавиту или
 * по номеру значило бы придумать разницу, которой в оценке нет. `rank()`
 * даёт ровно такое поведение, и это решение, а не побочный эффект.
 */

export function RankingTable({
  ranking,
  emptyText,
}: {
  ranking: Ranking
  emptyText: string
}) {
  const { rows } = ranking

  return (
    <div className="card mt-6">
      <div className="overflow-x-auto">
        <table className="metric-table">
          <thead>
            <tr>
              <th className="text-right">Место</th>
              <th>Животное</th>
              <th>Рождение</th>
              <th>Отец</th>
              <th>Отец матери</th>
              <th>Хозяйство</th>
              <th className="text-right">Индекс</th>
              <th className="text-right" title="Достоверность оценки, %">
                Дост.
              </th>
              <th className="text-right" title="Прогноз племенной ценности по удою, кг">
                Молоко
              </th>
              <th className="text-right" title="Прогноз племенной ценности по жиру, кг">
                Жир
              </th>
              <th className="text-right" title="Прогноз племенной ценности по белку, кг">
                Белок
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-ink-500">
                  {emptyText}
                </td>
              </tr>
            )}

            {rows.map((r) => (
              <tr key={r.animalId}>
                <td className="text-right tabular-nums font-medium">{r.position}</td>

                <td className="min-w-[12rem]">
                  <Link
                    href={`/animals/${r.animalId}`}
                    className="underline underline-offset-4 hover:text-forest-500"
                  >
                    {r.name || r.identNumber || `№${r.animalId}`}
                  </Link>
                  {r.name && r.identNumber && (
                    <span className="block text-[12px] tabular-nums text-ink-500">
                      {r.identNumber}
                    </span>
                  )}
                </td>

                <td className="whitespace-nowrap text-ink-500">{dateRu(r.birthDate) || '—'}</td>

                <td className="text-ink-700">
                  <Parent name={r.fatherName} ident={r.fatherIdent} />
                </td>
                <td className="text-ink-700">
                  <Parent name={r.mgsName} ident={r.mgsIdent} />
                </td>

                <td className="min-w-[10rem] text-ink-700">{r.ownerName || '—'}</td>

                <td className="text-right tabular-nums font-medium">{nf(r.value, 1)}</td>
                <td className="text-right tabular-nums text-ink-500">
                  {r.reliability === null ? '—' : `${r.reliability}%`}
                </td>

                {/*
                   Племенная ценность — это отклонение от базы, и знак у неё
                   значащий: «+1949» и «1949» читаются по-разному, а «−574»
                   без знака выглядит как опечатка. Поэтому `signed`, а не `nf`.
                */}
                <td className="text-right tabular-nums text-ink-500">
                  {r.milk === null ? '—' : signed(r.milk, 0)}
                </td>
                <td className="text-right tabular-nums text-ink-500">
                  {r.fatKg === null ? '—' : signed(r.fatKg, 1)}
                </td>
                <td className="text-right tabular-nums text-ink-500">
                  {r.proteinKg === null ? '—' : signed(r.proteinKg, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-[90ch] text-[13px] leading-relaxed text-ink-500">
        Место считается внутри разряда: быки сравниваются с быками, тёлки до года — с ровесницами.
        Одинаковые значения делят место и не разрываются. Прочерк в колонке признака означает,
        что оценки по нему нет вовсе, — такое животное всё равно участвует в рейтинге, но его
        индекс собран из меньшего числа признаков, и достоверность это показывает.
      </p>
    </div>
  )
}

/**
 * Родитель одной ячейкой: кличка сверху, номер под ней.
 *
 * Ссылки здесь нет намеренно. Отец в этой таблице — признак животного,
 * а не самостоятельный объект; уводить читателя из рейтинга по каждой
 * второй ячейке значит превратить список в развилку. Открыть быка можно
 * через строку самого быка в разряде «Быки».
 */
function Parent({ name, ident }: { name: string | null; ident: string | null }) {
  if (!name && !ident) return <span className="text-ink-300">—</span>

  return (
    <span className="inline-block">
      <span className="whitespace-nowrap">{name || ident}</span>
      {name && ident && (
        <span className="block text-[12px] tabular-nums text-ink-500">{ident}</span>
      )}
    </span>
  )
}
