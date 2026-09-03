import { getClient } from '@/lib/payload'
import { BOOK_URL } from '@/lib/hosts'
import { TENANTS } from '@/lib/tenant'
import registry from '@/data/fgias-dairy-breeds.json'
import { buildCatalog, type BreedRow, type RegistryBreed } from '@/lib/breeds-catalog'

/**
 * Каталог пород, собранный по живой базе.
 *
 * ## Почему отдельный файл
 *
 * Тот же довод, что у «чьей это книги» (`lib/tenant-server.ts`): сборка
 * каталога — чистая, её проверяет прогон без базы, а поход в базу —
 * дело сервера. Смешав их, мы бы затащили Payload в проверку, и она
 * перестала бы запускаться дёшево.
 *
 * ## Почему числа считаются здесь, а не на каждой странице
 *
 * Их показывают двое: главная («столько пород готово») и сам каталог.
 * Посчитанные порознь, они разойдутся в первый же день — не потому,
 * что кто-то ошибётся, а потому, что одна страница возьмёт базу, другая
 * обойдётся выпиской. Расхождение чисел на соседних страницах читается
 * как небрежность во всём остальном.
 */
export async function loadBreedCatalog(): Promise<BreedRow[]> {
  const payload = await getClient()
  const ours = await payload.find({ collection: 'breeds', limit: 1000, depth: 0 })

  /*
   * Действующие книги — из настройки арендаторов: заведут вторую,
   * и она появится в каталоге сама. Связь идёт по имени породы,
   * а не по коду ICAR: код грубее породы, и под одним `HOL` в реестре
   * стоят три строки — одна книга объявила бы себя за три породы.
   */
  const books: Record<string, string> = TENANTS.holstein.breed
    ? { [TENANTS.holstein.breed.name]: BOOK_URL }
    : {}

  return buildCatalog(
    registry.breeds as RegistryBreed[],
    ours.docs as unknown as Parameters<typeof buildCatalog>[1],
    books,
  )
}
