import Image from 'next/image'
import { findPublicAsset } from '@/lib/media'

/**
 * Слот под фотографию.
 *
 * `name` — путь внутри /public без расширения, например `images/hero-plemkniga`.
 * Как только файл появляется в /public, он подхватывается без правок в коде;
 * поддерживаются svg, webp, avif, jpg, jpeg, png.
 *
 * Пока файла нет, рисуется абстрактная заставка в фирменной гамме — намеренно
 * без изображения животного: обобщённый рисунок коровы ничего не сообщает
 * о содержимом страницы и выглядит хуже, чем честная геометрия.
 */
export function ImageSlot({
  name,
  alt,
  className = '',
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 50vw',
}: {
  name: string
  alt: string
  className?: string
  priority?: boolean
  sizes?: string
}) {
  const src = findPublicAsset(name)

  return (
    <div className={`relative overflow-hidden rounded-card ${className}`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <Placeholder />
      )}
    </div>
  )
}

function Placeholder() {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="800" height="400" fill="#eef3e9" />
      <g fill="none" stroke="#8bb861" strokeWidth="2" opacity="0.55">
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx="640" cy="330" r={70 + i * 46} />
        ))}
      </g>
      <g fill="#7fae55" opacity="0.28">
        <path d="M0 400V236l150-40 150 52 150-64 150 44 200-52v224Z" />
      </g>
      <g fill="#5f9440" opacity="0.22">
        <path d="M0 400V300l170 34 160-46 180 40 150-32 140 26v78Z" />
      </g>
    </svg>
  )
}
