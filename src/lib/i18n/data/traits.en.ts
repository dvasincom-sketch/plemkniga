import type { TraitTexts } from '@/lib/i18n/data/traits'

/**
 * Названия признаков и единицы измерения по-английски.
 *
 * Формулировки перенесены дословно из полей `labelEn` и `unitEn`, которые
 * стояли парами рядом с русскими в `breeding-index.ts`: они вычитаны, и
 * переписывать их при переезде не за чем. Английский теперь на общих
 * правах с остальными пятью языками — отдельным словарём, полным по типу,
 * а не половиной пары, которую страница выбирала признаком `english`.
 * Соседние четыре словаря добавлены переводом без вычитки носителем;
 * этот — единственный, о котором такого сказать нельзя.
 */
export const TRAITS_EN: TraitTexts = {
  milk: { label: 'Milk yield', unit: 'kg' },
  fatKg: { label: 'Fat', unit: 'kg' },
  proteinKg: { label: 'Protein', unit: 'kg' },
  productiveLongevity: { label: 'Productive life', unit: 'months' },
  udderHealth: { label: 'Udder health', unit: 'point' },
  fertility: { label: 'Fertility', unit: '%' },
  calvingEase: { label: 'Calving ease', unit: 'point' },
  calfMortality: { label: 'Calf mortality', unit: '%' },
  bodyComposite: { label: 'Body weight composite', unit: 'point' },
  udderComposite: { label: 'Udder composite', unit: 'point' },
  legsComposite: { label: 'Feet and legs composite', unit: 'point' },
}
