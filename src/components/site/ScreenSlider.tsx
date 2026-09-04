'use client'

import { useEffect, useState } from 'react'

/**
 * Несколько экранов кабинета, сменяющих друг друга.
 *
 * ## Зачем понадобилось
 *
 * Раздел «как это выглядит внутри» показывал один экран — карточку
 * животного, — и читатель делал вывод, что книга и есть карточка.
 * А самое убедительное лежит рядом: родословная с пометкой ДНК
 * и разбор индекса по вкладам. Три экрана отвечают на три разных
 * возражения, и ни одно из них не снимается остальными.
 *
 * ## Почему сменяются сами, а не ждут нажатия
 *
 * Вкладки, которые надо нажать, смотрит меньшинство: на витрине
 * читатель не работает, а листает, и лишнего движения не делает.
 * Первый экран при этом остаётся первым — тот, кто ушёл через три
 * секунды, увидит именно карточку животного, самое понятное из трёх.
 *
 * ## Почему нажатие всё-таки работает
 *
 * Смена сама по себе отнимает управление: увидев родословную, человек
 * не может к ней вернуться. Нажатие на подпись останавливает показ
 * и оставляет выбранное — дальше он смотрит столько, сколько нужно.
 * Отнять у читателя выбор ради красоты нельзя; добавить выбор
 * к движению — можно.
 *
 * ## Про тех, кому движение мешает
 *
 * Системная просьба «поменьше движения» оставляет первый экран
 * неподвижным. Подписи при этом работают, и все три экрана остаются
 * доступны — просто по нажатию, а не сами.
 */
export function ScreenSlider({
  items,
}: {
  items: { key: string; label: string; screen: React.ReactNode }[]
}) {
  const [active, setActive] = useState(0)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(() => setActive((i) => (i + 1) % items.length), 6_000)
    return () => clearInterval(timer)
  }, [held, items.length])

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => {
              setActive(i)
              setHeld(true)
            }}
            className={`rounded-xl px-4 py-2 text-[14px] transition-colors ${
              i === active
                ? 'bg-forest-500 text-white'
                : 'border border-ink-100 bg-white text-ink-700 hover:border-forest-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/*
         Экраны не размонтируются, а прячутся: у них разная высота,
         и при подмене узла страница дёргалась бы на каждой смене,
         утаскивая из-под читателя то, что он читает ниже.
      */}
      <div className="relative mt-5">
        {items.map((item, i) => (
          <div
            key={item.key}
            aria-hidden={i !== active}
            className={i === active ? 'block' : 'hidden'}
          >
            {item.screen}
          </div>
        ))}
      </div>
    </div>
  )
}
