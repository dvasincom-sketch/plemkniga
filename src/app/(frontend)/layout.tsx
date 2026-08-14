import type { Metadata } from 'next'
import React from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Племенная книга — Ассоциация производителей КРС голштинской породы',
    template: '%s — Племенная книга',
  },
  description:
    'Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте (КРС) с целью определения наиболее перспективных быков-производителей для селекции.',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-canvas antialiased">{children}</body>
    </html>
  )
}
