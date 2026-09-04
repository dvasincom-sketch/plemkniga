'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Шкала места среди всей популяции — с движением.
 *
 * ## Что говорит движение
 *
 * То же, что рисунок первого экрана, только с другой стороны. Там —
 * «среди скольких», здесь — «на каком месте», и место у каждого
 * животного своё. Неподвижная шкала с числом 47 говорила про одну
 * тёлку; шкала, на которой отметка переезжает от сорок седьмого места
 * к тысяче двухсотому, говорит, что счёт ведётся каждому.
 *
 * ## Почему здесь движение плавное, а на первом экране скачком
 *
 * Разные фигуры и разные утверждения. Поле — множество, и выделение
 * в нём перескакивает: «а вот другое хозяйство». Шкала — прямая,
 * и на прямой у величины есть соседи: между сорок седьмым и тысячным
 * местом лежат все промежуточные, и провести отметку через них честнее,
 * чем телепортировать. Число при этом считается вместе с отметкой,
 * а не подставляется в конце: иначе оно спорило бы с её положением
 * целую секунду.
 *
 * ## Почему остановки именно такие
 *
 * Три места из разных частей списка: почти вершина, середина верхней
 * трети, начало второй тысячи. Числа выдуманные, и это не беда —
 * рисунок объясняет устройство, а не показывает данные. Беда была бы
 * в обратном: подставить сюда настоящее животное настоящего хозяйства.
 *
 * ## Про тех, кому движение мешает
 *
 * Тот же порядок, что у поля на первом экране: системная просьба
 * «поменьше движения» останавливает показ на первой остановке.
 * Проверяется она здесь, а не медиавыражением, потому что число
 * считается кодом и остановить его правилом стиля нельзя.
 */

/** Сколько всего животных в списке — знаменатель у всех остановок. */
const TOTAL = 21_480

/** Места, между которыми ходит отметка. */
const STOPS = [47, 1_208, 312]

/** Сколько стоит на остановке и сколько едет до следующей, мс. */
const HOLD = 2_600
const MOVE = 900

export function RankScale({ title }: { title: string }) {
  const [rank, setRank] = useState(STOPS[0]!)
  const frame = useRef<number>(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let stop = 0
    let timer: ReturnType<typeof setTimeout>

    const glide = (from: number, to: number, started: number) => {
      const step = (now: number) => {
        const passed = Math.min(1, (now - started) / MOVE)
        /*
         * Замедление к концу: равномерное движение читается как машинное,
         * а отметка изображает не механизм, а перебор животных.
         */
        const eased = 1 - Math.pow(1 - passed, 3)
        setRank(Math.round(from + (to - from) * eased))
        if (passed < 1) frame.current = requestAnimationFrame(step)
        else timer = setTimeout(next, HOLD)
      }
      frame.current = requestAnimationFrame(step)
    }

    const next = () => {
      const from = STOPS[stop]!
      stop = (stop + 1) % STOPS.length
      glide(from, STOPS[stop]!, performance.now())
    }

    timer = setTimeout(next, HOLD)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame.current)
    }
  }, [])

  /*
   * Положение считается из места, а не хранится отдельно: два числа,
   * означающие одно и то же, рано или поздно разъезжаются — и тогда
   * отметка стоит не там, где написано.
   */
  const at = `${(rank / TOTAL) * 100}%`

  return (
    <div role="img" aria-label={`${title}: ${rank} место из ${TOTAL}`} className="w-full max-w-[320px]">
      <div className="relative pt-7">
        <span
          className="absolute top-0 -translate-x-1/2 text-[13px] font-medium tabular-nums text-forest-600"
          style={{ left: at }}
        >
          {rank.toLocaleString('ru-RU')}
        </span>

        <div className="h-3 w-full rounded-full bg-ink-100">
          <div className="h-3 rounded-full bg-forest-500" style={{ width: at }} />
        </div>

        <span
          className="absolute -translate-x-1/2 rounded-full border-[3px] border-forest-500 bg-white"
          style={{ left: at, top: '1.5rem', height: '1.125rem', width: '1.125rem' }}
        />
      </div>

      <div className="mt-3 flex justify-between text-[12px] tabular-nums text-ink-500">
        <span>1</span>
        <span>{TOTAL.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  )
}
