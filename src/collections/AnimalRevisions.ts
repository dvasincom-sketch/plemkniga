import type { CollectionConfig } from 'payload'
import { animalScopedRead, isAdmin } from '@/access'

/**
 * Журнал правок карточки животного (ТЗ, п. 1.6).
 *
 * Зачем отдельная таблица, если в карточке уже есть «кто и когда менял».
 * Эти два поля отвечают на вопрос «кто трогал запись последним» и молчат
 * о том, что именно изменилось. Для загрузки файлом этого хватало: рядом
 * лежит пакет с исходным файлом, и спорный случай разбирают по нему.
 * Ручная правка не оставляет ничего — человек открыл карточку, поправил
 * дату рождения, ушёл. Через год выясняется, что дата неверна, и вопрос
 * «она такой была или её поправили» остаётся без ответа.
 *
 * Что пишется. Только осмысленные поля и только фактические изменения:
 * строка появляется, когда значение действительно стало другим. Служебное
 * (ранги сортировки, транслитерация клички, отметки времени) и расчётное
 * (снимок оценки, который кладёт хук истории) не пишется — это не правки
 * человека, а следствия.
 *
 * Что не пишется. Загрузка файлом: у неё свой след — пакет данных
 * с исходным файлом и протоколом. Дублировать его построчно значило бы
 * получить сорок тысяч записей на один импорт и утопить в них те несколько,
 * которые действительно кто-то ввёл руками.
 *
 * Строки неизменяемы: журнал, который можно поправить, journal'ом не является.
 */
export const AnimalRevisions: CollectionConfig = {
  slug: 'animal-revisions',
  labels: { singular: 'Правка', plural: 'Журнал правок' },
  admin: {
    useAsTitle: 'at',
    defaultColumns: ['animal', 'at', 'user', 'label', 'before', 'after'],
    group: 'Племенная книга',
  },
  access: {
    // Видно тем же, кому видно животное: это часть его истории
    read: animalScopedRead,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Животное',
          required: true,
          index: true,
        },
        { name: 'at', type: 'date', label: 'Когда', required: true, index: true },
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто изменил',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'path',
          type: 'text',
          label: 'Поле',
          required: true,
          admin: { description: 'Путь в модели: birthDate, summary.milkYield' },
        },
        { name: 'label', type: 'text', label: 'Название поля' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'before', type: 'text', label: 'Было' },
        { name: 'after', type: 'text', label: 'Стало' },
      ],
    },
    {
      name: 'source',
      type: 'select',
      label: 'Откуда правка',
      defaultValue: 'manual',
      options: [
        { value: 'manual', label: 'Вручную' },
        { value: 'admin', label: 'Из админки' },
        { value: 'system', label: 'Системой' },
      ],
    },
  ],
}
