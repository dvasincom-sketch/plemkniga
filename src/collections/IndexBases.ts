import type { CollectionConfig } from 'payload'
import { anyone, isAdmin } from '@/access'
import { TRAIT_BASE } from '@/lib/breeding-index'

/**
 * База сравнения: средние и стандартные отклонения признаков.
 *
 * Племенная ценность измеряется отклонением от базы, поэтому база решает,
 * какое число получится. Пока своей выборки нет, используется заимствованная —
 * Net Merit 2025 (CDCB), переведённая в метрические единицы; она лежит в коде.
 * Когда Ассоциация накопит собственную популяцию, отклонения пересчитывают
 * по ней (`npm run rebase:index`), и здесь появляется новая версия.
 *
 * Версии хранятся историей, а не заменяют друг друга. Это не архивная
 * аккуратность: рядом с каждым рассчитанным значением записана версия базы,
 * и без самой базы объяснить старое число было бы нечем. Активная — одна,
 * остальные остаются для справок.
 *
 * Заводит и переключает базы Ассоциация: смена базы двигает индекс у всех
 * животных сразу, и это решение уровня породы, а не хозяйства.
 */

export const IndexBases: CollectionConfig = {
  slug: 'index-bases',
  labels: { singular: 'База сравнения', plural: 'Базы сравнения' },
  admin: {
    useAsTitle: 'version',
    defaultColumns: ['version', 'source', 'isActive', 'computedAt'],
    group: 'Племенная книга',
  },
  access: {
    // Читать может кто угодно: без базы нельзя объяснить ни одно значение индекса
    read: anyone,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  defaultSort: '-computedAt',
  fields: [
    {
      name: 'version',
      type: 'text',
      label: 'Версия',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Например, АПГ-2026-08 — попадает в каждое рассчитанное значение' },
    },
    {
      name: 'source',
      type: 'select',
      label: 'Происхождение',
      defaultValue: 'own',
      options: [
        { value: 'own', label: 'Популяция Ассоциации' },
        { value: 'borrowed', label: 'Заимствованная (CDCB / Interbull)' },
      ],
    },
    { name: 'note', type: 'text', label: 'Пояснение' },
    {
      name: 'isActive',
      type: 'checkbox',
      label: 'Действующая',
      defaultValue: false,
      index: true,
    },
    {
      name: 'animalsUsed',
      type: 'number',
      label: 'Животных в выборке',
      admin: { readOnly: true },
    },
    { name: 'computedAt', type: 'date', label: 'Когда посчитана' },
    {
      name: 'traits',
      type: 'array',
      label: 'Признаки',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'trait',
              type: 'select',
              required: true,
              options: TRAIT_BASE.map((t) => ({ value: t.key, label: `${t.label}, ${t.unit}` })),
            },
            { name: 'mean', type: 'number', label: 'Среднее', required: true },
            {
              /*
               * Генетическое отклонение — то, по которому стандартизуется
               * признак. Получено из наблюдаемого разброса оценок делением
               * на корень из средней надёжности.
               */
              name: 'sd',
              type: 'number',
              label: 'Генетическое σ',
              required: true,
            },
            { name: 'sdObserved', type: 'number', label: 'Разброс оценок' },
            {
              /*
               * Это среднее той же самой R, что стоит у каждой оценки, —
               * и названо оно так же. Пока здесь была «достоверность»,
               * поле выглядело четвёртой величиной под тем же словом,
               * хотя никакой своей шкалы у него нет.
               */
              name: 'meanR',
              type: 'number',
              label: 'Средняя надёжность, R %',
            },
            {
              name: 'n',
              type: 'number',
              label: 'Оценок в выборке',
              admin: { description: 'По скольким животным посчитано' },
            },
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        // Действующая база — ровно одна: иначе непонятно, по какой считается индекс
        if (data.isActive) {
          await req.payload.update({
            collection: 'index-bases',
            where: {
              and: [
                { isActive: { equals: true } },
                ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
              ],
            },
            data: { isActive: false },
            overrideAccess: true,
            /* Внутри транзакции записи — решение №20. */
            req,
          })
        }
        return data
      },
    ],
  },
}
