'use client'

import { useRouter } from 'next/navigation'
import { Select } from './Select'
import { NO_PROFILE, queryWithProfile, type SearchParams } from '@/lib/animal-query'
import type { ProfileChoice } from '@/lib/index-profiles'

/**
 * Выбор профиля, по которому считается индекс в списке.
 *
 * Стоит рядом с сортировкой, а не в настройках: профиль здесь — способ
 * посмотреть на выдачу, такой же как порядок строк. Настройки отвечают
 * на вопрос «какой профиль у хозяйства основной», книга — на вопрос
 * «а как эти животные выглядят вот под таким набором весов».
 *
 * Выбор живёт в адресе: ссылку на книгу, посчитанную по профилю «Молоко
 * на сыр», можно переслать, и она откроется тем же самым.
 */
export function ProfilePicker({
  sp,
  profiles,
  value,
}: {
  sp: SearchParams
  profiles: ProfileChoice[]
  /** Ключ выбранного профиля; NO_PROFILE — колонки нет, в списке только ИПЦ. */
  value: string
}) {
  const router = useRouter()

  /*
   * «Без профиля» — обычный пункт списка, а не пустое значение подсказки.
   * У хозяйства с основным профилем пустой выбор снова подставил бы этот
   * профиль, и отключить колонку стало бы нечем.
   */
  const options = [
    { value: NO_PROFILE, label: 'Без профиля — только ИПЦ' },
    ...profiles.map((p) => ({ value: p.key, label: p.label })),
  ]

  return (
    <Select
      name="profile"
      ariaLabel="Профиль расчёта индекса"
      onLight
      className="min-w-[210px]"
      placeholder=""
      defaultValue={value || NO_PROFILE}
      options={options}
      onChange={(v) => router.push(`${queryWithProfile(sp, v)}#results`)}
    />
  )
}
