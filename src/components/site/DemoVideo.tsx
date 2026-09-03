import { findPublicAsset } from '@/lib/media'

/**
 * Место под запись работы в кабинете.
 *
 * ## Зачем видео, когда есть нарисованные экраны
 *
 * Рисунок отвечает на вопрос «как это выглядит», запись — на вопрос
 * «как этим пользуются». Второй возникает у того, кто уже поверил
 * первому: он хочет увидеть не картинку, а движение — как открывается
 * карточка, как выпускается документ, как выглядит поиск по книге.
 *
 * ## Почему заглушка, а не «пока уберём блок»
 *
 * Блока, которого нет, не видно в вёрстке, и о нём забывают. Место,
 * которое ждёт файл, само напоминает о себе на каждой сборке —
 * и, что важнее, вёрстка вокруг него уже выверена: подставленный
 * позже файл не сдвинет соседние экраны.
 *
 * ## Как поставить запись
 *
 * Положите файл в `public/` под именем `demo` — подхватятся `.mp4`,
 * `.webm` или `.mov`. Рядом можно положить `demo-poster` (`.jpg`,
 * `.png`, `.webp`) — это первый кадр, который виден до нажатия.
 *
 * Отдельного хранилища заводить не нужно: файл едет вместе с выкладкой
 * и отдаётся с того же домена. Это важнее удобства — запись
 * с постороннего сервиса тянет за собой его счётчики и его правила,
 * а страница, которая обещает прослеживаемость, не должна подгружать
 * ничего чужого.
 *
 * ## Почему без автозапуска и без звука
 *
 * Автозапуск со звуком — первое, что заставляет закрыть вкладку,
 * а на мобильной сети это ещё и десятки мегабайт, которых человек
 * не просил. Запись стартует по нажатию.
 */
export function DemoVideo({
  title,
  lead,
  note,
}: {
  title: string
  lead: string
  /** Что делать, если файла ещё нет, — видно только нам. */
  note: string
}) {
  const video = findPublicAsset('demo', ['mp4', 'webm', 'mov'])
  const poster = findPublicAsset('demo-poster', ['jpg', 'jpeg', 'png', 'webp'])

  return (
    <section className="mt-20">
      <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{title}</h2>
      <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-ink-700">{lead}</p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
        {video ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            className="block h-auto w-full"
            controls
            preload="metadata"
            playsInline
            poster={poster ?? undefined}
          >
            <source src={video} />
          </video>
        ) : (
          /*
           * Пока файла нет — не пустой прямоугольник, а объяснение.
           * Пустое место читается как поломка вёрстки; объяснённое —
           * как то, что оно и есть.
           */
          <div className="flex aspect-[16/9] flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <circle cx="28" cy="28" r="26" fill="#fff" stroke="#D7DBD9" />
              <path d="M23 20l14 8-14 8V20Z" fill="#2E7D52" />
            </svg>
            <p className="max-w-[46ch] text-[14px] leading-relaxed text-ink-500">{note}</p>
          </div>
        )}
      </div>
    </section>
  )
}
