import Link from 'next/link'
import { publicityLabel } from '@/lib/visibility'

/**
 * Третья колонка шапки: управление своей записью.
 *
 * ## Почему колонка, а не ярус и не всплывашка
 *
 * Блок искал место три раза. Сперва он лежал подвалом вкладки «Общие
 * данные» — то есть настройка записи там, где написано «данные животного»,
 * и исчезала при переключении вкладки. Потом стал ярусом между шапкой
 * и меню разделов — три строки на каждом открытии карточки ради
 * настройки, которую меняют раз в месяц. Потом кнопкой со всплывающей
 * панелью — и выглядело это приклеенным сбоку.
 *
 * Верное место оказалось простым: шапка карточки состоит из трёх колонок,
 * и это её третья.
 *
 *   1. кто это животное — кличка, номер, владелец;
 *   2. что известно о записи — обновлено, просмотры, достоверность;
 *   3. что я могу с записью сделать — эта колонка.
 *
 * Три колонки читаются слева направо как три вопроса, и каждый следующий
 * уже колонки предыдущего: имя шире служебных сведений, служебные сведения
 * шире управления.
 *
 * ## Почему раскрытие адресом, а не состоянием в памяти
 *
 * Формы длинные — переключатели с пояснениями, причина архивации,
 * список зависимых записей. В узкой колонке они не помещаются, во
 * всплывающей панели читаются плохо. Поэтому колонка показывает только
 * состояние и две ссылки, а сама форма разворачивается полноширинным
 * блоком под шапкой — по параметру адреса, тем же способом, каким
 * на карточке переключаются разделы.
 *
 * Выигрыш не только в месте: на такое состояние можно сослаться. Ссылка
 * «поправьте видимость вот здесь» открывает карточку сразу с раскрытой
 * формой, и работает это без единой строки на клиенте.
 */
export function RecordPanel({
  animalId,
  publicVisible,
  publicDetails,
  archived,
  open,
  onDark,
}: {
  animalId: number
  publicVisible: boolean
  publicDetails: boolean
  archived: boolean
  /** Что сейчас раскрыто под шапкой: адрес — единственный источник правды. */
  open: 'visibility' | 'archive' | null
  onDark?: boolean
}) {
  const link = (what: 'visibility' | 'archive', text: string) => {
    const active = open === what
    return (
      <Link
        href={active ? `/animals/${animalId}` : `/animals/${animalId}?manage=${what}`}
        scroll={false}
        aria-current={active ? 'true' : undefined}
        className={`block rounded-lg px-3 py-2 text-[14px] leading-snug transition-colors ${
          active
            ? 'bg-forest-500 text-white'
            : onDark
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'bg-white text-ink-900 hover:bg-[#f0f0f0]'
        }`}
      >
        {text}
      </Link>
    )
  }

  return (
    <div
      className={`w-full min-w-[13rem] rounded-xl px-4 py-3.5 lg:w-[15rem] ${
        onDark ? 'bg-white/10' : 'bg-canvas'
      }`}
    >
      <p
        className={`text-[12px] uppercase tracking-[0.09em] ${
          onDark ? 'text-white/70' : 'text-ink-500'
        }`}
      >
        Ваша запись
      </p>

      {/*
         Состояние словами и первой строкой: владелец должен видеть,
         открыта запись или нет, до того, как что-нибудь нажмёт.
      */}
      <p className={`mt-1 text-[14px] font-medium leading-snug ${onDark ? 'text-white' : ''}`}>
        {archived ? 'В архиве' : publicityLabel(publicVisible, publicDetails)}
      </p>

      <div className="mt-3 space-y-1.5">
        {link('visibility', 'Настроить видимость')}
        {link('archive', archived ? 'Вернуть из архива' : 'Убрать из книги')}
      </div>
    </div>
  )
}
