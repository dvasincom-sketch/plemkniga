import codes from '@/data/icar-breed-codes.json'

/**
 * Какие породы книга умеет вести — и что это значит.
 *
 * ## Два справочника, и они про разное
 *
 * **Interbull / ICAR** — восемьдесят строк, трёхбуквенные коды.
 * Это внешний паспорт породы: код уезжает в обмен по ADE и входит
 * в международный номер животного. Источник при этом сам оговаривает,
 * что коды заведены для маркировки соломинок с семенем в международной
 * торговле и **не** используются для идентификации пород в генетических
 * оценках Interbull. Мы эту оговорку повторяем: выдавать торговый
 * справочник за научный — ровно тот вид неточности, который специалист
 * замечает первым.
 *
 * **ФГИАС ПР** — пятьсот пятьдесят шесть записей с uuid. Это
 * национальная идентичность: по ней сдают в реестр, и без неё выгрузка
 * не принимается.
 *
 * У породы в книге оба ключа сразу, и ни один не заменяет другой.
 *
 * ## Почему список кодов лежит в дереве, а не запрашивается
 *
 * Та же причина, что у схем ADE. Страница Interbull — вики, её правят
 * люди; прогон, ходящий за ней в сеть, падает, когда чужой сайт
 * недоступен, и — хуже — тихо зеленеет, когда недоступен незаметно.
 * Копия лежит рядом с датой и ссылкой, и обновляется отдельным шагом,
 * а не на каждый показ страницы.
 *
 * ## Три состояния, и почему их именно три
 *
 * «Поддерживаем пятьсот пород» читается как «у нас пятьсот книг».
 * Это неправда, и первый же зоотехник спросит, где посмотреть.
 * Поэтому состояние у каждой породы названо словами:
 *
 * **Книга ведётся** — есть организация, есть животные, книга открыта
 * по своему адресу. Сегодня такая одна.
 *
 * **Готово к ведению** — порода сшита с обоими справочниками, поля
 * заведены, кровность считается по улучшающей, профиль индекса
 * настраивается. Данных нет: книга заводится, когда придёт объединение
 * или хозяйство.
 *
 * **В справочнике** — порода известна системе, её можно указать
 * животному, но своей книги под неё не готовили.
 *
 * Состояние **вычисляется**, а не проставляется руками. Проставленное
 * однажды разойдётся с действительностью в первый же месяц: книгу
 * завели, галочку забыли — и витрина продолжает обещать «скоро».
 */

export type BreedDirection = 'dairy' | 'dual' | 'beef' | 'other'

export const DIRECTION_LABEL: Record<BreedDirection, string> = {
  dairy: 'молочное',
  dual: 'универсальное',
  beef: 'мясное',
  other: 'прочее',
}

/** Направления, о которых витрина говорит: их книга действительно ведёт. */
export const SHOWN_DIRECTIONS: BreedDirection[] = ['dairy', 'dual']

export type IcarBreed = { name: string; code: string; semenCode?: string }

export const ICAR_BREEDS: IcarBreed[] = codes.breeds
export const ICAR_SOURCE = codes.source
export const ICAR_FETCHED_AT = codes.fetchedAt
export const ICAR_NOTE = codes.note

/** Код ICAR → английское имя. Кодов меньше, чем строк: RDC стоит у четырёх. */
export const ICAR_BY_CODE = new Map<string, IcarBreed[]>()
for (const b of ICAR_BREEDS) {
  const list = ICAR_BY_CODE.get(b.code) ?? []
  list.push(b)
  ICAR_BY_CODE.set(b.code, list)
}

export type BreedState = 'book' | 'ready' | 'listed'

export const STATE_LABEL: Record<BreedState, string> = {
  book: 'Книга ведётся',
  ready: 'Готово к ведению',
  listed: 'В справочнике',
}

export const STATE_HINT: Record<BreedState, string> = {
  book: 'Есть объединение, есть животные, книга открыта по своему адресу.',
  ready:
    'Порода сшита с обоими справочниками, поля и расчёты готовы. Данных пока нет — ' +
    'книга заводится, когда приходит объединение или хозяйство.',
  listed:
    'Порода известна системе: её можно указать животному и она уедет в реестр. ' +
    'Отдельной книги под неё не готовили.',
}

export const STATE_CLASS: Record<BreedState, string> = {
  book: 'bg-brand-50 text-forest-600',
  ready: 'bg-ink-50 text-ink-700',
  listed: 'bg-white text-ink-500 border border-ink-100',
}

export type BreedRow = {
  id: number | string
  name: string
  /** Английское имя породы, если оно у нас есть (`BREED_NAME_EN`). */
  nameEn: string | null
  /** Трёхбуквенный код ICAR, если сопоставлен. */
  icar: string | null
  /** Идентификатор породы в реестре ФГИАС ПР. */
  fgiasUuid: string | null
  direction: BreedDirection
  /** Может использоваться как улучшающая — важно для кровности. */
  improver: boolean
  state: BreedState
  /** Адрес действующей книги, если она есть. */
  bookUrl: string | null
}

/**
 * Состояние породы по тому, что о ней известно.
 *
 * Порядок проверок — от сильного к слабому, и он же порядок доверия:
 * действующая книга сильнее любой готовности, а готовность требует
 * обоих ключей. Порода с одним лишь именем остаётся «в справочнике»,
 * сколько бы полей у неё ни было: без кода ICAR она не уедет в обмен,
 * без uuid — в реестр.
 */
export function breedState(input: {
  icar: string | null
  fgiasUuid: string | null
  direction: BreedDirection
  bookUrl: string | null
}): BreedState {
  if (input.bookUrl) return 'book'
  if (!SHOWN_DIRECTIONS.includes(input.direction)) return 'listed'
  return input.icar && input.fgiasUuid ? 'ready' : 'listed'
}

/** Сколько пород в каждом состоянии — для чисел на витрине. */
export const countByState = (rows: BreedRow[]): Record<BreedState, number> => {
  const out: Record<BreedState, number> = { book: 0, ready: 0, listed: 0 }
  for (const r of rows) out[r.state] += 1
  return out
}

/* ------------------------------------------------------------------ *
 *  Мост между справочниками                                          *
 * ------------------------------------------------------------------ */

/**
 * Русское имя реестра → код ICAR. Список короткий и написан руками.
 *
 * Сопоставлять названия автоматически нельзя. «Красная датская»
 * и «Англерская» — разные строки реестра, но в списке ICAR обе входят
 * в European Red Dairy Breed с кодом RDC; «Черно-пестрая» — не Holstein,
 * а самостоятельная отечественная порода, хотя переводчик уверенно
 * поставил бы HOL. Ошибка здесь не косметическая: код уезжает
 * в международный номер животного, и чужой код означает чужую породу
 * в чужой стране.
 *
 * Поэтому здесь только те пары, за которые можно ответить. Остальные
 * остаются без кода — и это не пробел, а факт: у большинства
 * отечественных пород кода ICAR нет вовсе, потому что в международной
 * торговле семенем они не участвуют. Ровно этим породам книга и нужнее
 * всего: их нет ни в одном международном справочнике, и своей книги
 * у них тоже нет.
 */
export const RU_TO_ICAR: Record<string, string> = {
  Голштинская: 'HOL',
  'Российская голштинская': 'HOL',
  'Красно-пестрая': 'RED',
  Джерсейская: 'JER',
  Айрширская: 'RDC',
  Англерская: 'RDC',
  'Красная датская': 'RDC',
  'Норвижн ред': 'RDC',
  'Шведиш ред': 'RDC',
  Симментальская: 'SIM',
  'Бурая швицкая': 'BSW',
  Монбельярд: 'MON',
  Голландская: 'DFR',
  'Британо-фризская': 'BRF',
  Остфризская: 'DFR',
  Пинцгау: 'PIN',
  'Черно-пестрая немецкая': 'HOL',
  'Черно-пестрая польская': 'PZB',
  'Красная польская': 'RDC',
}

/** Порода из выписки реестра — то, что известно о ней без нашей базы. */
export type RegistryBreed = { uuid: string; name: string; code: string }

/** Имя породы для сравнения: регистр и «ё» здесь ничего не значат. */
export const normBreed = (v: string) => v.toLowerCase().replace(/ё/g, 'е').trim()

/* ------------------------------------------------------------------ *
 *  Английские имена пород                                            *
 * ------------------------------------------------------------------ */

/**
 * Русское имя реестра → английское имя породы.
 *
 * ## Почему список написан руками, а не взят из ICAR
 *
 * В копии списка Interbull английские имена есть, но связь с ним идёт
 * через трёхбуквенный код, а код грубее породы намеренно: под `RDC`
 * стоят Ayrshire, Norwegian Red, Swedish Red и European Red Dairy Breed,
 * под `HOL` — три строки реестра. Обратный ход «код → имя» дал бы
 * айрширской корове имя European Red Dairy Breed, то есть чужое имя
 * в единственном столбце, ради которого страница и переводилась.
 *
 * ## Откуда взяты имена
 *
 * Для международных пород — принятое английское имя (Holstein, Jersey,
 * Brown Swiss). Для отечественных и союзных — имя из FAO DAD-IS, где
 * они и описаны: Kholmogory, Yaroslavl, Istoben, Red Gorbatov. Перевода
 * по частям здесь нет намеренно: «Black-motley» и подобное — не имя
 * породы, а подстрочник, и специалист опознаёт его с первой строки.
 *
 * ## Что требует проверки носителем
 *
 * У одиннадцати пород принятого английского имени найти не удалось,
 * и стоит транслитерация или имя по образцу соседних строк. Это
 * не догадка на глаз, но и не источник, на который можно сослаться:
 *
 *   Альгау                    → Allgäu
 *   Аулиеатинская             → Aulie-Ata
 *   Белоголовая украинская    → Ukrainian Whitehead
 *   Бушуевская                → Bushuev
 *   Восточно-финская          → Eastern Finncattle
 *   Красно-пестрая немецкая   → German Red Pied
 *   Красный белорусский скот  → Belarusian Red
 *   Северная комолая          → Northern Polled
 *   Сибирячка                 → Sibiryachka
 *   Черно-пестрая датская     → Danish Black Pied
 *   Черно-пестрая шведская    → Swedish Black Pied
 */
export const BREED_NAME_EN: Record<string, string> = {
  Айрширская: 'Ayrshire',
  Алатауская: 'Alatau',
  Альгау: 'Allgäu',
  Англерская: 'Angeln',
  Аулиеатинская: 'Aulie-Ata',
  'Белоголовая украинская': 'Ukrainian Whitehead',
  Бестужевская: 'Bestuzhev',
  'Британо-фризская': 'British Friesian',
  'Бурая карпатская': 'Carpathian Brown',
  'Бурая латвийская': 'Latvian Brown',
  'Бурая швицкая': 'Brown Swiss',
  Бушуевская: 'Bushuev',
  'Восточно-финская': 'Eastern Finncattle',
  Голландская: 'Dutch Friesian',
  Голштинская: 'Holstein',
  'Горный скот Дагестана': 'Dagestan Mountain',
  Джерсейская: 'Jersey',
  Истобенская: 'Istoben',
  'Кавказская бурая': 'Caucasian Brown',
  Костромская: 'Kostroma',
  'Красная горбатовская': 'Red Gorbatov',
  'Красная датская': 'Danish Red',
  'Красная литовская': 'Lithuanian Red',
  'Красная польская': 'Polish Red',
  'Красная степная': 'Red Steppe',
  'Красная тамбовская': 'Red Tambov',
  'Красная эстонская': 'Estonian Red',
  'Красно-пестрая': 'Russian Red Pied',
  'Красно-пестрая немецкая': 'German Red Pied',
  'Красный белорусский скот': 'Belarusian Red',
  Курганская: 'Kurgan',
  Лебединская: 'Lebedin',
  Монбельярд: 'Montbéliarde',
  'Норвижн ред': 'Norwegian Red',
  Остфризская: 'East Friesian',
  Пинцгау: 'Pinzgau',
  'Российская голштинская': 'Russian Holstein',
  'Северная комолая': 'Northern Polled',
  'Серая украинская': 'Ukrainian Grey',
  Сибирячка: 'Sibiryachka',
  Симментальская: 'Simmental',
  Суксунская: 'Suksun',
  Сычевская: 'Sychevka',
  Тагильская: 'Tagil',
  'Украинская красная молочная': 'Ukrainian Red Dairy',
  Холмогорская: 'Kholmogory',
  'Черно-пестрая': 'Russian Black Pied',
  'Черно-пестрая датская': 'Danish Black Pied',
  'Черно-пестрая литовская': 'Lithuanian Black Pied',
  'Черно-пестрая немецкая': 'German Black Pied',
  'Черно-пестрая польская': 'Polish Black and White',
  'Черно-пестрая шведская': 'Swedish Black Pied',
  'Черно-пестрая эстонская': 'Estonian Black Pied',
  'Шведиш ред': 'Swedish Red',
  Ярославская: 'Yaroslavl',
}

const EN_BY_NORM = new Map(
  Object.entries(BREED_NAME_EN).map(([ru, en]) => [normBreed(ru), en] as const),
)

/**
 * Английское имя породы, если оно у нас есть.
 *
 * Возвращает `null`, а не русское имя: подстановка русского молча выдала
 * бы пробел в словаре за перевод, и новая строка реестра приехала бы
 * на английскую страницу по-русски, ничем себя не выдав.
 */
export const breedNameEn = (name: string): string | null => EN_BY_NORM.get(normBreed(name)) ?? null

/**
 * Свести выписку реестра, список ICAR и то, что заведено в книге.
 *
 * Источник строк — выписка реестра: это ответ на вопрос «какие породы
 * вообще бывают в стране», и он не наш. Наша база добавляет к строке
 * два обстоятельства: заведена ли порода у нас и есть ли под неё книга.
 *
 * ## Почему книга ищется по имени породы, а не по коду ICAR
 *
 * Первая редакция связывала книгу с трёхбуквенным кодом, и прогон
 * тут же показал, во что это выливается: под `HOL` в реестре стоят
 * «Голштинская», «Российская голштинская» и «Чёрно-пёстрая немецкая»,
 * и все три объявились «книга ведётся». Одна действующая книга обещала
 * себя за три породы.
 *
 * Код ICAR грубее породы намеренно — он заведён для международной
 * торговли семенем, где четыре северные красные породы сведены в один
 * `RDC`. Для обмена это верно, для вопроса «чья это книга» — нет.
 * Книга ведётся по конкретной породе реестра, и связь идёт по её имени.
 */
export function buildCatalog(
  registry: RegistryBreed[],
  ours: {
    id: number | string
    name: string
    whffCode?: string | null
    fgiasUuid?: string | null
    direction?: string | null
    isImprover?: boolean | null
  }[],
  /** Имя породы реестра → адрес действующей книги. */
  books: Record<string, string>,
): BreedRow[] {
  const byName = new Map(ours.map((o) => [normBreed(o.name), o]))
  const bookByBreed = new Map(Object.entries(books).map(([k, v]) => [normBreed(k), v]))

  return registry
    .map((r): BreedRow => {
      const mine = byName.get(normBreed(r.name))
      const icar = mine?.whffCode?.trim().toUpperCase() || RU_TO_ICAR[r.name] || null
      const bookUrl = bookByBreed.get(normBreed(r.name)) ?? null

      return {
        id: mine?.id ?? r.uuid,
        name: r.name,
        nameEn: breedNameEn(r.name),
        icar,
        fgiasUuid: r.uuid,
        direction: (mine?.direction as BreedDirection) ?? 'dairy',
        improver: Boolean(mine?.isImprover),
        state: breedState({ icar, fgiasUuid: r.uuid, direction: 'dairy', bookUrl }),
        bookUrl,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
