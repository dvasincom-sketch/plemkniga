import Link from 'next/link'

/**
 * Каналы обмена данными.
 *
 * Файлы CSV — это способ начать, а не работать. Хозяйство уже ведёт стадо
 * в своей программе, лаборатории отдают результаты в своих форматах,
 * генотипы приходят с чипов. Раздел показывает, какие каналы обмена есть
 * сейчас и какие готовятся, чтобы не создавалось впечатления, будто система
 * умеет только принимать таблицы.
 *
 * Состояние каждого канала указано честно: обещать интеграцию, которой нет,
 * дороже, чем признать сроки.
 */

type State = 'live' | 'designed' | 'planned'

const STATE_VIEW: Record<State, { label: string; className: string }> = {
  live: { label: 'Работает', className: 'bg-brand-50 text-forest-600' },
  designed: { label: 'Спроектировано', className: 'bg-[#fff3d9] text-[#8a5a00]' },
  planned: { label: 'В плане', className: 'bg-[#f0f0f0] text-ink-700' },
}

type Channel = {
  title: string
  state: State
  formats: string
  text: string
}

const CHANNELS: Channel[] = [
  {
    title: 'Файлы таблиц',
    state: 'live',
    formats: 'CSV с разделителем «;», выгрузка в CSV и JSON',
    text: 'Базовый способ: подходит для разовой загрузки стада и для выгрузки данных к себе.',
  },
  {
    title: 'Генотипирование',
    state: 'designed',
    formats: 'PLINK PED/MAP и BED/BIM/FAM, VCF, Illumina FinalReport',
    text: 'Приём файлов с чипов Illumina и Thermo Fisher с контролем качества: call rate по образцу и маркеру, менделевские конфликты с родителями. Обязательные метаданные — модель чипа, сборка генома и конвенция кодирования аллелей: без них разные наборы нельзя объединять.',
  },
  {
    title: 'Лаборатории качества молока',
    state: 'designed',
    formats: 'ICAR ADE (JSON)',
    text: 'Результаты контрольных доек напрямую из лаборатории: суточный удой, жир, белок, соматические клетки, мочевина. Формат — открытый отраслевой стандарт ICAR ADE.',
  },
  {
    title: 'Системы управления стадом',
    state: 'planned',
    formats: 'DairyComp 305, DelPro, UNIFORM-Agri, AfiFarm',
    text: 'Отёлы, осеменения, выбытия забираются из программы, в которой хозяйство работает каждый день. Публичного API нет ни у одного вендора, поэтому канал строится адаптерами; передача данных оформляется соглашением с вендором или фермой.',
  },
  {
    title: 'Государственные реестры',
    state: 'planned',
    formats: 'ВетИС «Хорриот», ФГИАС ПР',
    text: 'Передача сведений о маркировании и о племенных животных. Шлюз ВетИС работает и доступен по заявке; по ФГИАС ПР ждём публикации форматов обмена.',
  },
]

export function IntegrationChannels() {
  return (
    <section className="mt-12">
      <h2 className="section-title mb-2">Обмен с внешними системами</h2>
      <p className="mb-7 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
        Данные не обязательно вводить заново: система рассчитана на то, чтобы забирать их оттуда,
        где они уже есть. Ниже — каналы обмена и их состояние на сегодня.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CHANNELS.map((c) => {
          const view = STATE_VIEW[c.state]
          return (
            <div key={c.title} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-[18px] font-medium leading-snug">{c.title}</h3>
                <span
                  className={`flex-none rounded-md px-2.5 py-1 text-[13px] font-medium ${view.className}`}
                >
                  {view.label}
                </span>
              </div>

              <p className="mt-2 text-[13px] leading-snug text-ink-500">{c.formats}</p>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-700">{c.text}</p>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-[14px] leading-relaxed text-ink-500">
        Нужен канал, которого здесь нет, — напишите в Ассоциацию: список составлен по тем системам,
        которые чаще всего встречаются в хозяйствах. Технические подробности каждого канала описаны
        в документации проекта, раздел{' '}
        <Link href="/account?tab=documents" className="underline underline-offset-4">
          «Документы»
        </Link>
        .
      </p>
    </section>
  )
}
