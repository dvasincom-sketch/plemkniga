import { normBreed } from '@/lib/breeds-catalog'
import { pickText, type TextTables } from '@/lib/i18n/data-text'
import type { Locale } from '@/lib/i18n/locales'
import { BREEDS_BE } from '@/lib/i18n/data/breeds.be'
import { BREEDS_EN } from '@/lib/i18n/data/breeds.en'
import { BREEDS_HY } from '@/lib/i18n/data/breeds.hy'
import { BREEDS_KK } from '@/lib/i18n/data/breeds.kk'
import { BREEDS_KY } from '@/lib/i18n/data/breeds.ky'

/**
 * Имена пород на пяти языках, собранные над русским оригиналом.
 *
 * Русского словаря здесь нет и быть не может: имя породы приходит
 * из выписки реестра, и оно же служит ключом (`i18n/data-text.ts`).
 * Английский вычитан, остальные четыре — казахский, армянский,
 * белорусский и киргизский — добавлены переводом, носитель языка их
 * не читал, и над таблицей об этом сказано оговоркой.
 *
 * ## Почему полнота словаря не проверяется типом
 *
 * У остальных наборов ключ закрыт и известен при сборке, поэтому запись
 * без перевода там не соберётся. Здесь ключ приезжает снаружи: завтра
 * в реестре появится порода, которой ни в одном словаре нет. Тип такое
 * поймать не может, и вместо него считает прогон проверки — в словаре
 * каждого языка обязано быть столько же имён, сколько строк в выписке.
 *
 * ## Почему поиск идёт по нормализованному имени
 *
 * По той же причине, по какой так ищет мост на коды ICAR: в выписке
 * «Чёрно-пёстрая» записана без «ё», и глазами это неотличимо
 * (`breeds-catalog.ts`, `normBreed`). Словарь, промахнувшийся на одной
 * букве, отдал бы русское имя посреди армянской таблицы и ничем себя
 * не выдал бы.
 */
export const BREED_NAMES: TextTables<string, string> = {
  en: BREEDS_EN,
  kk: BREEDS_KK,
  hy: BREEDS_HY,
  be: BREEDS_BE,
  ky: BREEDS_KY,
}

const normKeys = (table: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(table).map(([ru, name]) => [normBreed(ru), name]))

const NORMED: TextTables<string, string> = {
  en: normKeys(BREEDS_EN),
  kk: normKeys(BREEDS_KK),
  hy: normKeys(BREEDS_HY),
  be: normKeys(BREEDS_BE),
  ky: normKeys(BREEDS_KY),
}

/**
 * Имя породы на языке показа. Русское имя реестра — и ключ, и откат.
 *
 * Откат отдаёт русское имя, а не пустую ячейку: порода, которой
 * в словаре нет, всё равно должна быть узнаваема — по русскому имени
 * видно хотя бы то, о какой породе речь.
 */
export const breedName = (locale: Locale): ((russian: string) => string) => {
  const table = pickText(NORMED, locale, (key: string) => key)

  return (russian) => {
    const key = normBreed(russian)
    const name = table(key)

    /*
     * Откат `pickText` отдаёт сам ключ, а ключ здесь нормализован —
     * строчными и без «ё». В таблице нужно имя реестра как оно записано,
     * поэтому исходная строка возвращается сама, а не собирается обратно
     * из ключа.
     */
    return name === key ? russian : name
  }
}
