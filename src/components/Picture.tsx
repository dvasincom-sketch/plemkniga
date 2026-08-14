import Image from 'next/image'
import type { ReactNode } from 'react'
import { findPublicAsset } from '@/lib/media'

/**
 * Картинка из /public с векторной заглушкой.
 *
 * `name` — путь внутри /public без расширения, например `images/cow-head`.
 * Если файла нет, рисуется `fallback`. Поддерживаются svg, webp, avif, jpg, png.
 */
export function Picture({
  name,
  alt,
  fallback,
  className = '',
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 50vw',
}: {
  name: string
  alt: string
  fallback: ReactNode
  className?: string
  priority?: boolean
  sizes?: string
}) {
  const src = findPublicAsset(name)

  if (!src) return <>{fallback}</>

  return (
    <div className={`relative ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  )
}
