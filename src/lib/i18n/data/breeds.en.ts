/**
 * Имена пород по-английски: русское имя реестра → английское имя.
 *
 * Ключ — имя строки выписки ФГИАС ПР, то есть сам русский оригинал:
 * он и есть источник, отдельного русского словаря поэтому нет
 * (`i18n/data-text.ts`). Этот словарь вычитан и до переезда сюда жил
 * полем `nameEn` рядом с породой; формулировки перенесены дословно.
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
export const BREEDS_EN: Record<string, string> = {
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
