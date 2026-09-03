import { redirect } from 'next/navigation'

/** Старый адрес без языка — ссылки на него уже разошлись. */
export default function RedirectIcarGaps() {
  redirect('/ru/icar/gaps')
}
