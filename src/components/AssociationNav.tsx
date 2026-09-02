import Link from 'next/link'
import { SubTabs } from '@/components/SubTabs'

/**
 * Навигация кабинета Ассоциации — два уровня, как в кабинете хозяйства.
 *
 * ## Почему два, а не восемь плашек подряд
 *
 * Разделов стало восемь, и в одну полосу они читаться перестали: восемь
 * равноправных плашек — это не меню, а список, по которому каждый раз ищут
 * глазами. Первая попытка была мягче — те же восемь плашек, разложенные
 * по трём подписанным полкам. Стало опрятнее и не стало короче: искать
 * всё равно приходилось среди восьми, просто теперь в трёх местах.
 *
 * Настоящее сокращение даёт второй уровень: наверху три раздела, под ними
 * — подразделы того, в котором стоишь. Выбор всегда из трёх, а потом
 * из двух-трёх, и на экране одновременно не больше шести плашек вместо
 * восьми.
 *
 * ## Почему именно так, а не иначе
 *
 * Такой же двухуровневый переключатель уже работает в кабинете хозяйства:
 * «Стадо» наверху и «Список / Отчёты / Документы» под ним. Человек,
 * пришедший из своего кабинета в кабинет Ассоциации, не должен
 * переучиваться — механика одна, отличаются только разделы. Поэтому
 * второй уровень собран тем же `SubTabs`, а не похожим на него рядом.
 *
 * ## Верхний раздел — ссылка, а не переключатель
 *
 * Нажатие на раздел ведёт в его первый подраздел. Отдельной страницы
 * «раздел вообще» нет и заводить её незачем: она была бы оглавлением
 * из трёх ссылок, то есть повторением меню, которое человек только что
 * видел.
 */

export const ASSOCIATION_GROUPS = [
  {
    key: 'inbox',
    label: 'Разбор',
    hint: 'Пакеты, заявки, новые колонки',
  },
  {
    key: 'registry',
    label: 'Реестр',
    hint: 'Хозяйства, справочник, документы',
  },
  {
    key: 'watch',
    label: 'Наблюдение',
    hint: 'Журнал и качество книги',
  },
] as const

export type AssociationGroupKey = (typeof ASSOCIATION_GROUPS)[number]['key']

export const ASSOCIATION_TABS = [
  {
    key: 'queue',
    group: 'inbox',
    href: '/association',
    label: 'Очередь проверки',
    hint: 'Пакеты, ждущие разбора',
  },
  {
    key: 'verifications',
    group: 'inbox',
    href: '/association/verifications',
    label: 'Верификации',
    hint: 'Заявки хозяйств по животным',
  },
  {
    /*
     * Разбор колонок стоит в «Разборе» последним и это не «по остаточному
     * принципу». Остальное здесь — про то, что в книге уже есть; эта
     * страница про то, чего в ней ещё нет и что хозяйства присылают.
     * Обращаются сюда не каждый день, а решение принимают надолго.
     */
    key: 'columns',
    group: 'inbox',
    href: '/association/columns',
    label: 'Новые колонки',
    hint: 'Что присылают хозяйства сверх реестра',
  },
  {
    key: 'farms',
    group: 'registry',
    href: '/association/farms',
    label: 'Хозяйства',
    hint: 'Членство и заявки',
  },
  {
    key: 'directory',
    group: 'registry',
    href: '/association/directory',
    label: 'Справочник',
    hint: 'Карточки, заведённые контрагентами',
  },
  {
    key: 'documents',
    group: 'registry',
    href: '/association/documents',
    label: 'Документы',
    hint: 'Выпуск и журнал выдачи',
  },
  {
    key: 'journal',
    group: 'watch',
    href: '/association/journal',
    label: 'Журнал',
    hint: 'Что происходило в книге',
  },
  {
    key: 'quality',
    group: 'watch',
    href: '/association/quality',
    label: 'Качество книги',
    hint: 'Противоречия и достоверность',
  },
  {
    /*
     * Состояние стад стоит в «Наблюдении» рядом с качеством книги,
     * и соседство не случайно: качество отвечает на вопрос «верны ли
     * записи», состояние — «что в них написано». Обе страницы про то,
     * чтобы заметить, а не про то, чтобы решить.
     */
    key: 'herds',
    group: 'watch',
    href: '/association/herds',
    label: 'Состояние стад',
    hint: 'Зоотехническая картина по членам',
  },
  {
    /*
     * Рейтинг замыкает «Наблюдение», и это единственная страница раздела
     * про хорошее. Остальные три говорят о недостатках — противоречия,
     * передержка, очередь на разбор, — и объединение, которое умеет
     * обсуждать с хозяйством только беду, рано или поздно перестают
     * слушать. Соседство поэтому осознанное, а не «некуда было положить»:
     * заметить достижение — такая же работа наблюдателя, как заметить
     * неблагополучие.
     */
    key: 'ranking',
    group: 'watch',
    href: '/association/ranking',
    label: 'Рейтинг',
    hint: 'Лучшие животные книги поимённо',
  },
] as const

export type AssociationTabKey = (typeof ASSOCIATION_TABS)[number]['key']

type Tab = {
  key: AssociationTabKey
  group: AssociationGroupKey
  href: string
  label: string
  hint: string
}

export function AssociationNav({ active }: { active?: AssociationTabKey }) {
  const tabs = ASSOCIATION_TABS as readonly Tab[]

  /*
   * В каком разделе стоим. Неизвестная вкладка — не ошибка: страница может
   * не входить ни в один раздел (разбор одного пакета, карточка заявки),
   * и тогда открыт первый. Показывать в этом случае пустой второй уровень
   * было бы хуже: человек решил бы, что подразделов нет вовсе.
   */
  const current = tabs.find((t) => t.key === active)
  const group = current?.group ?? ASSOCIATION_GROUPS[0].key
  const items = tabs.filter((t) => t.group === group)

  return (
    <>
      <nav aria-label="Разделы кабинета Ассоциации" className="mb-8">
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {ASSOCIATION_GROUPS.map((g) => {
            const isActive = g.key === group
            const first = tabs.find((t) => t.group === g.key)
            if (!first) return null

            return (
              <li key={g.key} className="flex-none">
                <Link
                  href={first.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`block rounded-xl px-5 py-3 transition-colors ${
                    isActive
                      ? 'bg-forest-500 text-white'
                      : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                  }`}
                >
                  <span className="block whitespace-nowrap text-[15px] font-medium">{g.label}</span>
                  <span
                    className={`mt-0.5 block whitespace-nowrap text-[12px] leading-snug ${
                      isActive ? 'text-white/75' : 'text-ink-500'
                    }`}
                  >
                    {g.hint}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/*
         Второй уровень тем же компонентом, что и в кабинете хозяйства.
         Похожий на него ряд, набранный своими классами, разошёлся бы
         с ним при первой правке отступа — а человек узнаёт элемент
         по виду раньше, чем читает подпись.
      */}
      <SubTabs
        label="Подразделы"
        active={current?.key ?? items[0]?.key ?? ''}
        items={items.map((t) => ({ key: t.key, label: t.label, hint: t.hint, href: t.href }))}
      />
    </>
  )
}
