import type { Metadata } from 'next'
import React from 'react'
import './globals.css'
import { currentTenant } from '@/lib/tenant-server'

/*
 * Заголовок и язык берутся у книги, а не вписаны.
 *
 * Постоянное `metadata` здесь не годится: оно вычисляется один раз
 * на сборку, а книг две и они различаются по заголовку запроса.
 * Голштинское имя во вкладке показательной книги — первое, что увидел бы
 * гость, ещё не открыв страницу.
 *
 * `lang` важнее, чем кажется: по нему читающая программа выбирает голос
 * и правила чтения. Английская страница, помеченная `ru`, будет прочитана
 * вслух русским произношением — то есть неразборчиво.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await currentTenant()

  return {
    title: {
      default: `Племенная книга — ${t.org.full}`,
      template: '%s — Племенная книга',
    },
    description:
      'Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте (КРС) с целью определения наиболее перспективных быков-производителей для селекции.',
  }
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const t = await currentTenant()

  return (
    <html lang={t.lang}>
      <body className="min-h-screen bg-canvas antialiased">{children}</body>
    </html>
  )
}
