'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Отметки в таблице стада и что с отмеченным делать.
 *
 * ## Почему обёртка, а не клиентская таблица
 *
 * Таблица книги — серверная: четырнадцать колонок, справочники, разбор
 * замка, значения индекса. Перевести её на клиент ради подсчёта галочек
 * значило бы отправить всё это в браузер и получить заметную задержку
 * на списке из двухсот строк.
 *
 * Здесь наоборот: таблица остаётся серверной и приходит сюда как
 * `children`, а обёртка слушает одно событие на форме. Галочки —
 * обычные `input` без состояния; сколько их отмечено, обёртка узнаёт
 * у самой формы в момент изменения.
 *
 * ## Почему полоса появляется, а не висит всегда
 *
 * Пустая полоса «отмечено 0» занимает место и ничего не сообщает. Она
 * возникает с первой галочкой — там же, где возникает и вопрос
 * «а что теперь с этим делать».
 *
 * ## Что можно сделать с отмеченным
 *
 * Выпустить ссылку на просмотр — форма ссылки принимает список номеров,
 * и до этого их набирали руками, глядя в ту же таблицу. И сравнить
 * отмеченных быков.
 *
 * Остальное («подать на верификацию», «выгрузить отмеченные») ждёт
 * сохранённых выборок — там отметка живёт дольше одной страницы,
 * и обещать это полосой, которая обнуляется при листании, нечестно.
 *
 * ## Почему сравнение предлагается только быкам
 *
 * Не из-за того, что экран называется «Сравнение быков». Сравнивать
 * быка и корову — разные действия, и второго у нас нет.
 *
 * Быка сравнивают по дочерям: его собственных удоев не существует,
 * и единственное, что о нём говорят числа, — разница со сверстницами
 * у его дочерей. Такую таблицу глазами не собрать, для неё и написан
 * отдельный экран.
 *
 * У коровы удой, жир, белок и ИПЦ стоят в её собственной строке,
 * и таблица стада уже показывает их рядом — это и есть сравнение.
 * Отдельный экран, который перенёс бы те же четыре числа из строк
 * в колонки, ничего бы не добавил, а выглядел бы обещанием, что
 * добавил.
 *
 * Поэтому кнопка появляется, когда отмечено хотя бы два быка,
 * и берёт из отмеченного только их. Когда рядом с быками отмечены
 * коровы, полоса говорит об этом вслух: молчаливое «взяли не всех»
 * читается как поломка.
 */

/** Столько быков помещается в сравнение — то же число, что на самом экране. */
const MAX_BULLS = 6

type Picked = { number: string; id: string; bull: boolean }

export function HerdSelection({ children }: { children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null)
  const [picked, setPicked] = useState<Picked[]>([])
  const router = useRouter()

  const boxes = () =>
    Array.from(form.current?.querySelectorAll<HTMLInputElement>('input[name="pick"]') ?? [])

  const master = () =>
    form.current?.querySelector<HTMLInputElement>('input[name="pick-all"]') ?? null

  /**
   * Пересчёт отмеченного и состояние общей галочки.
   *
   * Промежуточный вид у неё — не украшение: без него «отмечено 3 из 40»
   * выглядит как «не отмечено ничего», и человек жмёт её, ожидая отметить
   * всё, а получает снятие трёх. Задать `indeterminate` разметкой нельзя,
   * только из кода, — поэтому он выставляется здесь.
   */
  const recount = () => {
    const all = boxes()
    const checked = all.filter((i) => i.checked)
    setPicked(
      checked
        .filter((i) => i.value)
        .map((i) => ({
          number: i.value,
          id: i.dataset.id ?? '',
          bull: i.dataset.sex === 'male',
        })),
    )

    const m = master()
    if (m) {
      m.checked = all.length > 0 && checked.length === all.length
      m.indeterminate = checked.length > 0 && checked.length < all.length
    }
  }

  /*
     Событие ловится на форме, а пришло оно от галочки внутри.
     React типизирует `target` у формы как саму форму, и приведение
     к `HTMLInputElement` он справедливо не принимает: пересечения
     у типов нет. `instanceof` разбирается с этим без приведения
     вовсе — и заодно честнее: он проверяет, а не утверждает.
  */
  const onChange = (e: React.FormEvent<HTMLFormElement>) => {
    const target = e.target
    /*
       Общая галочка отмечает и снимает всё на странице — именно
       на странице, а не во всём стаде. Обещать «отметить все 1240»
       кнопкой, которая видит двадцать пять строк, нельзя: остальные
       на клиенте не существуют.
    */
    if (target instanceof HTMLInputElement && target.name === 'pick-all') {
      for (const i of boxes()) i.checked = target.checked
    }
    recount()
  }

  /*
   * Быки среди отмеченного — с идентификатором. Запись без него в сравнение
   * не отправить, а промолчать о ней нельзя: она отмечена, и человек ждёт,
   * что её возьмут. Такого в живой таблице не бывает, поэтому она просто
   * не считается быком и попадает в объяснение вместе с коровами.
   */
  const bulls = picked.filter((p) => p.bull && p.id)
  const cows = picked.length - bulls.length

  const clear = () => {
    for (const i of boxes()) i.checked = false
    const m = master()
    if (m) {
      m.checked = false
      m.indeterminate = false
    }
    setPicked([])
  }

  return (
    <form ref={form} onChange={onChange}>
      {children}

      {picked.length > 0 && (
        /*
           Полоса прилипает к низу окна, а не стоит под таблицей.

           Отмечают, листая длинный список, и кнопка, уехавшая на две
           тысячи пикселей вниз, равносильна её отсутствию: человек
           отметил двадцать записей и не знает, где нажать.
        */
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-ink-900 px-5 py-3.5 text-white shadow-[0_4px_16px_rgb(23_24_26_/_0.24)]">
          <span className="text-[15px]">
            Отмечено <span className="font-medium tabular-nums">{picked.length}</span>
          </span>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/account/access?numbers=${encodeURIComponent(
                  picked.map((p) => p.number).join(', '),
                )}`,
              )
            }
            className="rounded-lg bg-white px-3 py-2 text-[14px] text-ink-900 transition-colors hover:bg-[#f0f0f0]"
          >
            Поделиться ссылкой
          </button>

          {bulls.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/bulls/compare?ids=${bulls
                    .slice(0, MAX_BULLS)
                    .map((p) => p.id)
                    .join(',')}`,
                )
              }
              className="rounded-lg bg-white px-3 py-2 text-[14px] text-ink-900 transition-colors hover:bg-[#f0f0f0]"
            >
              Сравнить {bulls.length > MAX_BULLS ? MAX_BULLS : bulls.length}{' '}
              {bulls.length > MAX_BULLS ? 'из ' + bulls.length + ' быков' : 'быков'}
            </button>
          )}

          {/*
             Пояснение к кнопке, а не оправдание её отсутствия.

             Оно появляется только тогда, когда отмеченное и взятое
             в сравнение расходятся: рядом с быками отмечены коровы либо
             быков больше, чем помещается. Молчаливое «взяли не всех»
             читается как поломка, а объяснение, висящее всегда, —
             как отговорка.
          */}
          {bulls.length >= 2 && (cows > 0 || bulls.length > MAX_BULLS) && (
            <span className="text-[13px] leading-snug text-white/70">
              {cows > 0 && `коров сравнение не берёт: их удои и так стоят рядом в таблице`}
              {cows > 0 && bulls.length > MAX_BULLS && '; '}
              {bulls.length > MAX_BULLS &&
                `в таблицу помещается ${MAX_BULLS} — дальше она не читается без прокрутки вбок`}
            </span>
          )}

          <button
            type="button"
            onClick={clear}
            className="ml-auto text-[14px] text-white/70 underline underline-offset-4 hover:text-white"
          >
            Снять отметки
          </button>
        </div>
      )}
    </form>
  )
}
