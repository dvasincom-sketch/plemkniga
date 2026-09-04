import type {
  AdeResourceName,
  AdeResourceText,
  AdeSchemaDir,
  AdeThemeKey,
  AdeThemeText,
} from '@/lib/ade-schema-map'
import type { TextTable } from '@/lib/i18n/data-text'

/**
 * Подписи карты схем ICAR по-белорусски: наши ресурсы, темы стандарта
 * за пределами книги и заголовки групп схем.
 *
 * Казахский, армянский, белорусский и киргизский добавлены переводом
 * с русского с оглядкой на английский, и носитель языка их не читал:
 * признак `reviewed` у этих четырёх снят в `i18n/locales.ts`, а над
 * таблицей стоит оговорка.
 *
 * Имена самих схем (`icarAnimalCoreResource` и прочие) не переводятся
 * и не транслитерируются: это идентификаторы стандарта, по ним ищут
 * в его репозитории. Переведены только пояснения к ним. Слова взяты те
 * же, что в тексте страницы (`ade-page-text.ts`): «ацёл», «прыплод»,
 * «пералік» перечисление, «калекцыя» коллекция.
 */
export const ADE_RESOURCES_BE: TextTable<AdeResourceName, AdeResourceText> = {
  icarAnimalCoreResource: {
    title: 'Жывёла',
    what: 'Картка: нумары, пол, дата нараджэння, парода, бацькі.',
  },
  icarTestDayResultEventResource: {
    title: 'Кантрольнае даенне',
    what: 'Удой за суткі, тлушч, бялок, саматычныя клеткі на дату.',
  },
  icarReproParturitionEventResource: {
    title: 'Ацёл',
    what: 'Дата, нумар ацёлу, лёгкасць, пералік прыплоду з полам і статусам.',
  },
  icarReproInseminationEventResource: {
    title: 'Асемяненне',
    what: 'Дата, кратнасць, бык, спосаб узнаўлення.',
  },
  icarWeightEventResource: {
    title: 'Узважванне',
    what: 'Жывая маса на дату, у кілаграмах.',
  },
  icarReproPregnancyCheckEventResource: {
    title: 'Праверка цельнасці',
    what: 'Вынік тэсту; жыве пры асемяненні, свайго запісу не мае.',
  },
  icarTypeClassificationEventResource: {
    title: 'Ацэнка экстэр’еру',
    what: 'Лінейныя прыкметы і зводныя ацэнкі, з указаннем ацэншчыка.',
  },
  icarBreedingValueResource: {
    title: 'Пляменная каштоўнасць',
    what: 'Значэнне індэкса, дакладнасць, профіль вагаў, база параўнання.',
  },
  icarMovementArrivalEventResource: {
    title: 'Паступленне',
    what: 'Жывёла прыйшла ў гаспадарку: пакупка, увоз, перавод.',
  },
  icarMovementDepartureEventResource: {
    title: 'Выбыццё',
    what: 'Жывёла пайшла: продаж, перавод, выбракоўка на забой.',
  },
  icarMovementDeathEventResource: {
    title: 'Падзёж',
    what: 'Гібель на ферме — асобны рэсурс са сваімі палямі.',
  },
}

export const ADE_THEMES_BE: TextTable<AdeThemeKey, AdeThemeText> = {
  feed: {
    title: 'Кармы і рацыёны',
    why: 'Кармленне вядуць у сістэме кіравання статкам; кнізе патрэбны вынік, а не рацыён.',
  },
  health: {
    title: 'Здароўе і лячэнне',
    why: 'Ветэрынарны контур асобны і па законе, і па адказнасці.',
  },
  slaughter: {
    title: 'Забой і тушы',
    why: 'Мясны ўлік: іншая галіна, іншыя вымярэнні, іншы спажывец.',
  },
  groups: {
    title: 'Групы жывёл',
    why: 'Групавыя падзеі і сартаванне патрэбныя робатам на ферме, а не кнізе.',
  },
  devices: {
    title: 'Прылады і датчыкі',
    why: 'Паказанні даільнай залы і датчыкаў — сыравіна для фермы; у кнігу трапляе вынік.',
  },
  inventory: {
    title: 'Склад і абарот',
    why: 'Улік запасаў і руху тавару — задача гаспадаркі, а не пляменнага ўліку.',
  },
  repro: {
    title: 'Узнаўленне звыш нашага',
    why: 'Ахвоты, аборты, трансплантацыя эмбрыёнаў — наступны крок, названы ў разборы ICAR.',
  },
  milk: {
    title: 'Малако звыш нашага',
    why: 'Падрабязнасці даення па чвэрцях і візітах; кніга вядзе кантрольныя даенні.',
  },
  other: {
    title: 'Іншае ядро стандарту',
    why: 'Агульныя продкі, спасылкі на рэсурсы, службовыя абалонкі калекцый.',
  },
}

export const ADE_DIRS_BE: TextTable<AdeSchemaDir, string> = {
  resources: 'Рэсурсы',
  types: 'Тыпы',
  enums: 'Пералікі',
  collections: 'Калекцыі',
}
