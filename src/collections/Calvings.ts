import type { CollectionConfig, CollectionAfterChangeHook } from 'payload'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField, adeOriginField } from '@/collections/shared'
import { raiseAgeGroup } from '@/lib/age-group'
import type { AgeGroup } from '@/lib/dictionaries'
import { BIRTH_TYPES, CALVING_EASE, CALVING_EVENTS, CALVING_RESULTS } from '@/lib/calving'
import { afterCommit } from '@/lib/after-commit'

/*
 * Списки переехали в `lib/calving.ts` и отдаются отсюда прежними именами.
 *
 * Читают их трое: эта коллекция, разбор загружаемого файла и форма
 * ручного ввода в кабинете. Последняя собирается для браузера, и импорт
 * из коллекции тянул бы в неё правила доступа и хуки — поэтому форма
 * держала у себя переписанную от руки копию списка. Копия и оригинал
 * разошлись бы молча в первый же день; теперь источник один.
 */
export { BIRTH_TYPES, CALVING_EASE, CALVING_EVENTS, CALVING_RESULTS }

/**
 * Отёл поднимает возрастную группу животного.
 *
 * ## Почему это хук, а не пересчёт при чтении
 *
 * Группа хранится в карточке и уезжает во ФГИАС вместе с датой своего
 * определения — вычислять её на лету значило бы не иметь такой даты вовсе.
 * А раз хранится, то кто-то обязан её поддерживать; до сих пор не поддерживал
 * никто, и на живой базе нашлись три тёлки с записанными отёлами,
 * пять первотёлок с двумя отёлами и тридцать пять «коров 3+ лактации»,
 * у которых отёлов меньше трёх.
 *
 * ## Только вверх
 *
 * Функция `raiseAgeGroup` физически не умеет понизить группу, и удаления
 * отёла этот хук намеренно не слушает. Разбор — в `lib/age-group.ts`:
 * запись отёла доказывает, что животное телилось, а отсутствие записи
 * не доказывает обратного.
 *
 * ## Отказ не роняет сохранение отёла
 *
 * Сам отёл к этому моменту уже записан, и он важнее заметки о возрасте.
 * Уронить его из-за того, что не удалось обновить соседнюю карточку,
 * значило бы потерять событие ради его последствия. Отказ уходит в лог —
 * тот же порядок, что у карантина колонок в решении №159.
 *
 * Обещание это долго было неправдой. Правка карточки шла с `req`, то есть
 * внутри транзакции записи отёла, и упавший запрос делал транзакцию
 * неспособной к коммиту: `catch` перехватывал ошибку, лог сообщал
 * «возрастная группа не обновилась», а откатывался при этом и сам отёл.
 * Теперь правка откладывается до коммита (`src/lib/after-commit.ts`),
 * и обещание держится по устройству, а не на слово.
 *
 * Заодно исчезло то, ради чего стоял `req`: после коммита блокировка
 * по внешнему ключу снята, и отдельное подключение перестало быть
 * ловушкой на пятнадцать минут.
 */
const raiseAnimalAgeGroup: CollectionAfterChangeHook = async ({ doc, req }) => {
  const animalId = typeof doc.animal === 'object' ? doc.animal?.id : doc.animal
  if (!animalId) return doc

  await afterCommit(req, `возрастная группа животного ${animalId}`, async (payload) => {
    const animal = await payload.findByID({
      collection: 'animals',
      id: animalId,
      depth: 0,
      overrideAccess: true,
    })

    /*
     * Считаются все отёлы животного, а не номер этого. Номер приходит
     * из файла и бывает любым: при переносе истории из прежней системы
     * учёта нумерация своя, и «отёл №7» может оказаться единственным
     * записанным. Группу определяет сколько их есть, а не как назван
     * последний.
     *
     * Считаются именно отёлы. Пока тип события был свален в «Результат»,
     * запись об аборте считалась наравне с отёлом — и тёлка, потерявшая
     * плод, становилась коровой. Ошибка была тихая: возрастная группа
     * поднимается сама, и посмотреть на неё некому.
     *
     * Записи без типа события считаются отёлами: до этой правки других
     * в книге не было, а миграция проставила «Аборт» ровно тем, у кого
     * он стоял в результате.
     */
    const { totalDocs } = await payload.count({
      collection: 'calvings',
      where: {
        and: [
          { animal: { equals: animalId } },
          {
            /*
             * Пустой тип читается как отёл, и написано это условием,
             * а не отрицанием: `!= 'аборт'` в SQL неверно для NULL —
             * такая строка не попала бы ни в одну сторону сравнения
             * и молча выпала бы из счёта.
             */
            or: [{ eventType: { equals: 'calving' } }, { eventType: { exists: false } }],
          },
        ],
      },
      overrideAccess: true,
    })

    const next = raiseAgeGroup(animal.ageGroup as AgeGroup | null, totalDocs)
    if (!next) return

    await payload.update({
      collection: 'animals',
      id: animalId,
      data: {
        ageGroup: next,
        /*
         * Дата определения — дата отёла, а не сегодняшняя. Отёл мог быть
         * загружен файлом за прошлый год, и записать «определено сегодня»
         * значило бы соврать реестру о дне, когда животное стало коровой.
         */
        ageGroupDate: doc.date ?? new Date().toISOString(),
      } as never,
      overrideAccess: true,
      /*
       * `req` не передаётся, и это не небрежность. Работа выполняется
       * после коммита записи отёла: транзакции больше нет, блокировка
       * по внешнему ключу снята, и отдельное подключение — единственный
       * возможный путь. Прежде здесь стоял `req` и пояснение про
       * зависание до таймаута; пояснение было верным ровно до тех пор,
       * пока правка шла внутри транзакции (решение №20).
       */
      context: { skipJournal: true },
    })
  })

  return doc
}

/**
 * Отёлы — «Таблица межотельного цикла».
 *
 * ТЗ, п. 5.2: каждое событие воспроизводства привязано к уникальному номеру
 * отёла (`ld_cow_n_otel`), что даёт непрерывную хронологию: осеменение →
 * стельность → отёл → лактация → запуск.
 */
export const Calvings: CollectionConfig = {
  slug: 'calvings',
  labels: { singular: 'Отёл', plural: 'Отёлы' },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'animal', 'number', 'result'],
    group: 'Воспроизводство',
  },
  access: {
    /*
     * Видимость наследуется от животного, а не «любой вошедший».
     * Надой, отёл и лечение чужой закрытой коровы — такие же её данные,
     * как и карточка: показывать их соседям система не должна.
     * Разбор — docs/dostup-i-vidimost.md.
     */
    read: animalScopedReadFor('production'),
    create: isAuthenticated,
    update: animalScopedMutate,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [requireOwnAnimal, stampOwnerOrg],
    afterChange: [raiseAnimalAgeGroup],
  },
  indexes: [{ fields: ['animal', 'number'] }],
  defaultSort: 'number',
  fields: [
    ownerOrgField,
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Корова',
          required: true,
          index: true,
          filterOptions: { sex: { equals: 'female' } },
        },
        {
          name: 'number',
          type: 'number',
          label: 'Номер отёла',
          required: true,
          /*
           * Нижняя граница у поля, а не только в базе. Ограничение
           * `chk_calvings_number` стоит давно, а `min` у поля не было:
           * человек, вписавший ноль, получал сырое имя ограничения
           * вместо понятного отказа. То же правило, что у остальных
           * границ, — форма и база разрешают одно и то же.
           */
          min: 1,
        },
        { name: 'date', type: 'date', label: 'Дата отёла', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          /*
           * Тип события — отёл, аборт или запуск. Все три заканчивают
           * лактацию и меряются от одной оси, поэтому лежат одной
           * коллекцией, как и у реестра.
           *
           * По умолчанию отёл: до этой правки в книге других записей
           * не было, и значение по умолчанию говорит о прошлом правду.
           */
          name: 'eventType',
          type: 'select',
          label: 'Тип события',
          options: CALVING_EVENTS.map((e) => ({ value: e.value, label: e.label })),
          defaultValue: 'calving',
          index: true,
        },
        {
          /*
           * «Результат» — это тип рождения: один, двойня, тройня.
           * Прежде здесь лежали «Тёлка» и «Бычок», то есть ответ
           * на другой вопрос; пол теперь считается числами ниже.
           */
          name: 'result',
          type: 'select',
          label: 'Результат',
          options: BIRTH_TYPES.map((b) => ({ value: b.value, label: b.label })),
          admin: { description: 'Сколько плодов было; пол — числами ниже' },
        },
        { name: 'milkingDays', type: 'number', label: 'Количество дойных дней', min: 0 },
        { name: 'dryOffDate', type: 'date', label: 'Дата запуска' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'ease',
          type: 'select',
          label: 'Лёгкость отёла',
          options: CALVING_EASE.map((e) => ({ value: e.value, label: e.label })),
        },
        {
          /*
           * «Живая масса», а не «вес»: величина та же, что во взвешиваниях,
           * и слово у неё должно быть одно — реестр спрашивает живую массу,
           * и весы меряют её же. Уточнение «телёнка при рождении» оставлено:
           * это разовое число внутри отёла, а не повторяемое взвешивание
           * из `weighings`, и путать их нельзя.
           */
          name: 'calfWeight',
          type: 'number',
          label: 'Живая масса телёнка, кг',
          admin: { description: 'При рождении. Повторные взвешивания живут в «Взвешиваниях»' },
        },
      ],
    },
    {
      /*
       * Три числа, а не одно поле «приплод».
       *
       * Реестр спрашивает их порознь, и порознь же их спрашивает жизнь:
       * доля мертворождений — показатель, по которому судят о работе
       * с отёлами, и вытащить её из слова «Мертворождение» в общем поле
       * было нельзя. Двойня, у которой один телёнок родился мёртвым,
       * прежде записывалась либо двойнёй, либо мертворождением —
       * и оба ответа были неполными.
       *
       * Пусто — не ноль. Ноль означает «посчитали, и не родилось
       * никого»; для отёла это неправда всегда, а для аборта числа
       * не имеют смысла по существу.
       */
      type: 'row',
      fields: [
        { name: 'liveHeifers', type: 'number', label: 'Живых тёлочек', min: 0 },
        { name: 'liveBulls', type: 'number', label: 'Живых бычков', min: 0 },
        {
          name: 'stillborn',
          type: 'number',
          label: 'Мертворождённых',
          min: 0,
          admin: { description: 'Включая нежизнеспособных' },
        },
      ],
    },
    {
      name: 'calves',
      type: 'relationship',
      relationTo: 'animals',
      hasMany: true,
      label: 'Полученный приплод',
    },
    { name: 'comment', type: 'textarea', label: 'Комментарий' },
    adeOriginField,
  ],
}
