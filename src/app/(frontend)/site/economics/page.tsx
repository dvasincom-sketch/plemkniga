import { redirect } from 'next/navigation'

/** Адрес без языка: ссылки расходятся по письмам, и ломать их нельзя. */
export default function RedirectEconomics() {
  redirect('/ru/economics')
}
