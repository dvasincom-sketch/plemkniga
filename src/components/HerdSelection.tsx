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
 * Пока одно — выпустить ссылку на просмотр. Это не заглушка на будущее,
 * а закрытие настоящей дыры: форма ссылки принимает список номеров,
 * и до сих пор их приходилось набирать руками, глядя в ту же таблицу.
 * Остальное («подать на верификацию», «выгрузить отмеченные») ждёт
 * сохранённых выборок — там отметка живёт дольше одной страницы,
 * и обещать это полосой, которая обнуляется при листании, нечестно.
 */
export function HerdSelection({ children }: { children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null)
  const [picked, setPicked] = useState<string[]>([])
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
    setPicked(checked.map((i) => i.value).filter(Boolean))

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
              router.push(`/account/access?numbers=${encodeURIComponent(picked.join(', '))}`)
            }
            className="rounded-lg bg-white px-3 py-2 text-[14px] text-ink-900 transition-colors hover:bg-[#f0f0f0]"
          >
            Поделиться ссылкой
          </button>

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
