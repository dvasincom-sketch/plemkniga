import Link from 'next/link'

/**
 * Навигация кабинета Ассоциации.
 *
 * Выглядит как навигация личного кабинета намеренно: это тот же уровень
 * и та же механика, человек не должен переучиваться. А вот разделы другие,
 * и в этом суть отдельного кабинета: у эксперта нет своего стада, у него
 * очередь чужих заявок.
 *
 * Разделы, которых ещё нет, показаны неактивными, а не спрятаны. Спрятанное
 * выглядит как «этого не будет»; тусклое — как «до этого дойдут руки»,
 * и это правда.
 */

/**
 * Разделы кабинета, разложенные по роду занятий.
 *
 * ## Почему появились группы
 *
 * Разделов стало восемь, и в одну полосу они перестали читаться: восемь
 * равноправных плашек — это не меню, а список, по которому каждый раз
 * ищут глазами. Причём равноправны они только на вид: половина — входящий
 * поток, который разбирают ежедневно, половина — справочные экраны,
 * куда заходят по случаю.
 *
 * Группы называют именно эту разницу: «что от меня ждут», «что в книге
 * заведено», «что с книгой происходит». Три подписи вместо восьми
 * одинаковых плашек сокращают поиск до выбора из трёх.
 *
 * ## Почему не свернули в выпадающее меню
 *
 * Спрятанный раздел перестаёт существовать: о нём вспоминают, только
 * когда уже знают, что он есть. Кабинет Ассоциации открывают несколько
 * человек, и половина разделов им незнакома — прятать их значит оставить
 * незнакомыми навсегда.
 */
export const ASSOCIATION_GROUPS = [
  { key: 'inbox', label: 'Что ждёт разбора' },
  { key: 'registry', label: 'Что заведено в книге' },
  { key: 'watch', label: 'Что с книгой происходит' },
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
    key: 'farms',
    group: 'registry',
    href: '/association/farms',
    label: 'Хозяйства',
    hint: 'Членство и заявки',
  },
  {
    key: 'journal',
    group: 'watch',
    href: '/association/journal',
    label: 'Журнал',
    hint: 'Что происходило в книге',
  },
  {
    key: 'directory',
    group: 'registry',
    href: '/association/directory',
    label: 'Справочник',
    hint: 'Карточки, заведённые контрагентами',
  },
  {
    key: 'verifications',
    group: 'inbox',
    href: '/association/verifications',
    label: 'Верификации',
    hint: 'Заявки хозяйств по животным',
  },
  {
    key: 'documents',
    group: 'registry',
    href: '/association/documents',
    label: 'Документы',
    hint: 'Выпуск и журнал выдачи',
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
     * Разбор колонок стоит последним и это не «по остаточному принципу».
     * Остальные разделы про то, что в книге уже есть; этот — про то,
     * чего в ней ещё нет и что хозяйства присылают. Обращаются сюда
     * не каждый день, а решение принимают надолго.
     */
    key: 'columns',
    group: 'inbox',
    href: '/association/columns',
    label: 'Новые колонки',
    hint: 'Что присылают хозяйства сверх реестра',
  },
] as const

export type AssociationTabKey = (typeof ASSOCIATION_TABS)[number]['key']

/*
 * Пустой `href` означает «раздел ещё не сделан»: такая плашка показывается
 * неактивной, а не прячется. Сейчас пустых нет — все пять разделов работают,
 * — но ветка оставлена: следующий раздел появится сначала в этом списке,
 * а уже потом в виде страницы, и в этот промежуток он должен быть виден.
 */
type Tab = {
  key: AssociationTabKey
  group: AssociationGroupKey
  href: string
  label: string
  hint: string
}

export function AssociationNav({ active }: { active?: AssociationTabKey }) {
  const tabs = ASSOCIATION_TABS as readonly Tab[]

  return (
    <nav aria-label="Разделы кабинета Ассоциации" className="mb-8 space-y-4">
      {ASSOCIATION_GROUPS.map((g) => {
        const items = tabs.filter((t) => t.group === g.key)
        if (!items.length) return null

        return (
          <div key={g.key}>
            {/*
               Подпись группы мелкая и приглушённая: она не пункт меню,
               а ярлык полки. Набранная наравне с разделами, она вступала бы
               с ними в спор за внимание — и восемь плашек превратились бы
               в одиннадцать.
            */}
            <p className="mb-2 text-[12px] uppercase tracking-[0.09em] text-ink-500">{g.label}</p>
            <ul className="flex gap-3 overflow-x-auto pb-1">{items.map(renderTab(active))}</ul>
          </div>
        )
      })}
    </nav>
  )
}

/*
 * Отрисовка одной плашки вынесена, потому что теперь зовётся из цикла
 * по группам. Внутри ничего не изменилось.
 */
const renderTab =
  (active?: AssociationTabKey) =>
  (t: Tab) => {
    const isActive = active === t.key
    const base = 'block rounded-xl px-5 py-3 transition-colors'

    if (!t.href) {
      return (
        <li key={t.key} className="flex-none">
          <span className={`${base} cursor-default bg-white/60 text-ink-500`} title="Раздел в работе">
            <span className="block whitespace-nowrap text-[15px] font-medium">{t.label}</span>
            <span className="mt-0.5 block whitespace-nowrap text-[12px] leading-snug">скоро</span>
          </span>
        </li>
      )
    }

    return (
      <li key={t.key} className="flex-none">
        <Link
          href={t.href}
          aria-current={isActive ? 'page' : undefined}
          className={`${base} ${
            isActive
              ? 'bg-forest-500 text-white'
              : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
          }`}
        >
          <span className="block whitespace-nowrap text-[15px] font-medium">{t.label}</span>
          <span
            className={`mt-0.5 block whitespace-nowrap text-[12px] leading-snug ${
              isActive ? 'text-white/75' : 'text-ink-500'
            }`}
          >
            {t.hint}
          </span>
        </Link>
      </li>
    )
  }
