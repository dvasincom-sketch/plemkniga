import type { CollectionConfig } from 'payload'
import { DOCUMENT_TYPES, toOptions } from '@/lib/dictionaries'
import { documentMutate, documentRead, isAdmin, isAuthenticated } from '@/access'
import { associationIssuesOnly, requireOwnOrganization } from '@/access/guards'

export const Documents: CollectionConfig = {
  slug: 'documents',
  labels: { singular: 'Документ', plural: 'Документы' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'animal', 'issuedAt'],
    group: 'Племенная книга',
  },
  access: {
    read: documentRead,
    create: isAuthenticated,
    // Правит владелец документа и Ассоциация: свидетельства выпускает и отзывает она
    update: documentMutate,
    delete: isAdmin,
  },
  hooks: { beforeChange: [requireOwnOrganization, associationIssuesOnly] },
  fields: [
    { name: 'title', type: 'text', label: 'Название', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Тип документа',
          options: toOptions(DOCUMENT_TYPES),
          defaultValue: 'pedigreeCertificate',
        },
        {
          /*
           * Номер уникален. Он считался как «сколько уже выдано за год
           * плюс один», и без уникальности два одновременных выпуска
           * или одна удалённая строка давали два документа с одним
           * номером — молча. Номер свидетельства на него ссылаются
           * снаружи, и совпадение здесь не опечатка, а два разных
           * животных под одной бумагой.
           */
          name: 'number',
          type: 'text',
          label: 'Номер',
          unique: true,
          index: true,
        },
        { name: 'issuedAt', type: 'date', label: 'Дата выдачи' },
      ],
    },
    {
      /*
       * Код проверки подлинности — печатается на бланке рядом с QR.
       *
       * Номера документов идут подряд, поэтому одного номера для открытой
       * проверки мало: она превратилась бы в способ выгрузить из книги,
       * какие животные каким хозяйствам принадлежат, в обход и публичности
       * записей, и точечного доступа. Номер называет документ, код
       * доказывает, что документ у вас в руках.
       *
       * Пусто — у бумаг, загруженных хозяйством: справка ветеринара
       * не документ книги, и проверять её подлинность книге нечем.
       */
      name: 'publicCode',
      type: 'text',
      label: 'Код проверки',
      index: true,
      admin: { readOnly: true, description: 'Печатается на бланке рядом с QR-кодом' },
    },
    { name: 'animal', type: 'relationship', relationTo: 'animals', label: 'Животное' },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Организация',
    },
    { name: 'file', type: 'upload', relationTo: 'media', label: 'Файл' },
    {
      /*
       * Снимок данных на момент выпуска.
       *
       * Печатная форма собирается из живой записи, и бланк от этого всегда
       * актуален. Оборотная сторона называлась реже: выданный документ ничем
       * не подкреплён. Свидетельство выпущено с ИПЦ +812, через месяц
       * пересчёт — и объяснить число в бумаге, на которую сослались в сделке,
       * нечем.
       *
       * Рядом эта задача давно решена: у значения индекса хранится снимок
       * весов и версия базы сравнения, иначе через полгода число нечем
       * объяснить (решение №21). Здесь то же самое для документа.
       *
       * Внутри — плоские готовые строки и числа, а не ссылки на записи:
       * снимок, который ссылается на живые данные, снимком не является.
       * Форма описана в `src/lib/certificate-view.ts`, у неё есть версия.
       *
       * Пусто — документ выпущен до появления снимка либо загружен
       * хозяйством. Такой бланк показывается живым предпросмотром
       * с отметкой об этом, а не подделкой снимка задним числом.
       */
      name: 'snapshot',
      type: 'json',
      label: 'Снимок данных на момент выпуска',
      admin: { readOnly: true },
    },
    {
      /*
       * Кто выдал документ.
       *
       * Пустое поле — не пробел, а осмысленное состояние: так выглядят
       * бумаги, которые хозяйство загрузило само (ветеринарная справка,
       * договор). Заполненное означает, что документ выпустила Ассоциация,
       * и вот тогда вопрос «кто именно» рано или поздно задают — свидетельство
       * юридически значимо.
       */
      name: 'issuedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто выдал',
      index: true,
    },
    {
      /*
       * Отзыв документа.
       *
       * Выданное свидетельство не удаляют: оно существовало, на него
       * ссылались, по нему продавали. Удалить строку — переписать прошлое;
       * отозвать — сказать правду о настоящем. Поэтому отзыв это отметка,
       * а не удаление, и он требует причины.
       */
      name: 'revoked',
      type: 'group',
      label: 'Отзыв',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'at', type: 'date', label: 'Когда отозван', index: true },
            { name: 'by', type: 'relationship', relationTo: 'users', label: 'Кто отозвал' },
          ],
        },
        { name: 'reason', type: 'textarea', label: 'Причина отзыва' },
      ],
    },
  ],
}
