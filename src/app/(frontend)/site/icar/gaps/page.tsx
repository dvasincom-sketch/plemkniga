import { permanentRedirect } from 'next/navigation'
import { SITE_URL } from '@/lib/hosts'

/**
 * Старый адрес без языка — ссылки на него уже разошлись.
 *
 * Постоянное перенаправление и целым адресом: разбор — у соседей
 * по папке (`site/icar/page.tsx`).
 */
export default function RedirectIcarGaps() {
  permanentRedirect(`${SITE_URL}/ru/icar/gaps`)
}
