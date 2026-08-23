'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { searchBullAction, type BullMatch } from '@/actions/bulls'
import { MAX_BULLS } from '@/lib/bull-compare'

/**
 * Добавить быка в сравнение.
 *
 * ## Почему выбор живёт в адресе
 *
 * Сравнение пересылают: зоотехник собрал пятерых и показывает
 * руководителю, покупатель — поставщику. Состояние в памяти компонента
 * этого не переживает, а адрес пересылается как есть и открывается тем же.
 * Тот же довод, что у профиля расчёта индекса в книге.
 *
 * ## Почему добавление, а не выбор из списка
 *
 * Быков в книге тысячи, и выбирают из них не листанием: покупатель
 * приходит с номерами из каталога поставщика или с кличками, которые ему
 * назвали. Печатать четыре цифры быстрее, чем искать глазами.
 */
export function BullPicker({ chosen }: { chosen: number[] }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<BullMatch[]>([])
  const [searching, setSearching] = useState(false)
  const latest = useRef(0)
  const router = useRouter()

  const full = chosen.length >= MAX_BULLS

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || full) {
      setMatches([])
      return
    }
    const ticket = ++latest.current
    setSearching(true)
    const timer = setTimeout(() => {
      searchBullAction(q)
        .then((r) => {
          /* Показываем ответ на последний отправленный запрос, а не на последний
             пришедший: серверное действие не отменить, и ответы возвращаются
             не в том порядке, в каком ушли. Тот же приём в `AnimalPicker`. */
          if (ticket !== latest.current) return
          setMatches(r.filter((m) => !chosen.includes(m.id)))
        })
        .finally(() => {
          if (ticket === latest.current) setSearching(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, chosen, full])

  const add = (id: number) => {
    setQuery('')
    setMatches([])
    router.push(`/bulls/compare?ids=${[...chosen, id].join(',')}`)
  }

  if (full) {
    return (
      <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
        В сравнении {MAX_BULLS} быков — больше не помещается: таблица, которую надо
        листать вбок, перестаёт быть сравнением, потому что соседние числа больше
        не стоят рядом. Уберите кого-нибудь, чтобы добавить нового.
      </p>
    )
  }

  return (
    <div className="max-w-[46ch] text-[14px]">
      <label className="block">
        Добавить быка
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Номер или кличка"
          className="field field-on-light mt-1.5 block w-full"
          autoComplete="off"
        />
      </label>

      {searching && matches.length === 0 && (
        <p className="mt-2 text-[13px] text-ink-500">Ищем…</p>
      )}

      {matches.length > 0 && (
        <ul className="mt-2 divide-y divide-[#e6e6e6] rounded-md border border-[#e6e6e6]">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => add(m.id)}
                className="block w-full px-3 py-2 text-left hover:bg-[#f6f6f6]"
              >
                <span className="block">{m.title}</span>
                {m.hint && <span className="block text-[13px] text-ink-500">{m.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !searching && matches.length === 0 && (
        <p className="mt-2 text-[13px] leading-snug text-ink-500">
          Быка с таким номером или кличкой в книге нет. Записи, закрытые их
          хозяйствами, в подсказках не показываются.
        </p>
      )}
    </div>
  )
}
