import type { CollectionConfig } from 'payload'
import {
  isAdmin,
  isAssociation,
  isAssociationAccess,
  isAuthenticated,
  organizationScopedRead,
} from '@/access'
import { requireOwnOrganization } from '@/access/guards'
import { relId } from '@/lib/visibility'
import { denyAccess } from '@/access/denied'
import { VERIFICATION_LIMIT } from '@/lib/verification-limit'

export const VERIFICATION_STATUSES = [
  { value: 'new', label: 'Подано' },
  { value: 'checking', label: 'На проверке' },
  { value: 'approved', label: 'Подтверждено' },
  { value: 'rejected', label: 'Отклонено' },
  /*
   * Отозвана хозяйством — не удалена.
   *
   * Одни и те же записи можно подать сколько угодно раз, и повторная
   * заявка означает для эксперта двойную работу: он разбирает то же самое
   * стадо второй раз, не зная, какая из двух заявок отражает нынешние
   * данные. Теперь при повторной подаче хозяйство обязано выбрать —
   * отозвать прежнюю или не подавать новую.
   *
   * Удалять отозванную нельзя: эксперт мог успеть взять её в работу
   * и записать замечания, и заявка, исчезнувшая у него из-под рук
   * без следа, читается как поломка. Отозванная остаётся в списках
   * со своим состоянием и с номером той заявки, ради которой её отозвали.
   */
  { value: 'cancelled', label: 'Отозвана' },
] as const

/** Заявки, которые ещё ждут решения: по ним повторная подача — дубль. */
export const OPEN_VERIFICATION_STATUSES = ['new', 'checking'] as const

export const VERIFICATION_PURPOSES = [
  { value: 'trust', label: 'Повысить достоверность записей' },
  { value: 'certificate', label: 'Подготовить к выпуску свидетельства' },
  { value: 'membership', label: 'Подтвердить племенной статус хозяйства' },
] as const

/**
 * Заявка хозяйства на верификацию своих животных.
 *
 * Чем отличается от пакета загрузки. Пакет — про файл: хозяйство прислало
 * данные, Ассоциация смотрит, что прислали. Заявка — про животных: данные
 * давно в системе, хозяйство просит подтвердить именно эти записи. Разные
 * поводы, разные единицы работы, разные очереди.
 *
 * Зачем это нужно было завести. До сих пор уровень «Верифицировано
 * ассоциацией» поднимался единственным способом — публикацией проверенного
 * пакета, то есть только тем животным, которых недавно грузили файлом.
 * Хозяйство, у которого данные лежат в системе полгода и не менялись,
 * не имело способа попросить их подтвердить. А именно это и требуется перед
 * выпуском свидетельства: подтверждают животное, а не последнюю загрузку.
 *
 * Как решается. Решение выносится по заявке целиком — так же, как по пакету.
 * Но подтверждение получают не все её животные: те, по которым эксперт
 * оставил замечание «требует исправления», остаются с прежним уровнем.
 * Замечание работает и объяснением, и исключением: хозяйство видит ровно те
 * записи, которые не прошли, и причину по каждой.
 */
export const VerificationRequests: CollectionConfig = {
  slug: 'verification-requests',
  labels: { singular: 'Заявка на верификацию', plural: 'Заявки на верификацию' },
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'organization', 'status', 'requestedAt'],
    group: 'Племенная книга',
  },
  access: {
    // Заявка — дело хозяйства и Ассоциации; соседям не показывается
    read: organizationScopedRead,
    create: isAuthenticated,
    /*
     * Решение по заявке принимает Ассоциация, и только она.
     *
     * Раньше здесь стояло `isAuthenticated`, как когда-то у отёлов и стад
     * (решение №45). Последствие было хуже: через API любой вошедший мог
     * выставить чужой заявке `status: approved`, дописать или снести
     * замечания — то есть подделать результат проверки, ради которой
     * Ассоциация и существует. Проверки жили только в серверных действиях,
     * а API работает в обход действий.
     *
     * Хозяйство свою заявку не правит вовсе: подать её можно, отозвать —
     * нет. Заявка на проверку, которую заявитель может переписать после
     * подачи, ничего не доказывает.
     */
    update: isAssociationAccess,
    delete: isAdmin,
  },
  defaultSort: '-requestedAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          type: 'text',
          label: 'Номер заявки',
          unique: true,
          index: true,
          admin: { readOnly: true, description: 'Присваивается автоматически' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Состояние',
          required: true,
          defaultValue: 'new',
          options: [...VERIFICATION_STATUSES],
          index: true,
        },
        {
          name: 'purpose',
          type: 'select',
          label: 'Зачем',
          defaultValue: 'trust',
          options: [...VERIFICATION_PURPOSES],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'organization',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Хозяйство',
          index: true,
        },
        {
          name: 'requestedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто подал',
        },
        { name: 'requestedAt', type: 'date', label: 'Когда подана', index: true },
      ],
    },
    {
      name: 'animals',
      type: 'relationship',
      relationTo: 'animals',
      hasMany: true,
      label: 'Животные заявки',
      required: true,
      index: true,
    },
    {
      name: 'comment',
      type: 'textarea',
      label: 'Сообщение Ассоциации',
      admin: { description: 'Что хозяйство хочет пояснить о поданных записях' },
    },
    /*
     * Две отметки об отзыве, и они намеренно простые: дата и номер новой
     * заявки текстом.
     *
     * Связью на саму заявку это не сделано сознательно. Связь потребовала
     * бы внешнего ключа и индекса, а имя ограничения у самоссылки
     * не помещается в 63 символа PostgreSQL и обрезается — то есть имя,
     * записанное в миграции, и имя в базе разошлись бы, и следующий
     * `migrate:create` увидел бы разницу там, где её нет. Номер заявки
     * для человека и так понятнее идентификатора, а искать по нему
     * — одно поле поиска.
     */
    {
      type: 'row',
      fields: [
        {
          name: 'withdrawnAt',
          type: 'date',
          label: 'Когда отозвана',
          admin: { readOnly: true },
        },
        {
          name: 'withdrawnFor',
          type: 'text',
          label: 'В пользу заявки',
          admin: { readOnly: true, description: 'Номер заявки, ради которой эта отозвана' },
        },
      ],
    },
    {
      name: 'review',
      type: 'group',
      label: 'Разбор',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'assignee',
              type: 'relationship',
              relationTo: 'users',
              label: 'Взял в работу',
              index: true,
            },
            {
              name: 'decidedBy',
              type: 'relationship',
              relationTo: 'users',
              label: 'Решение принял',
            },
            { name: 'decidedAt', type: 'date', label: 'Когда' },
          ],
        },
        { name: 'comment', type: 'textarea', label: 'Заключение' },
        {
          type: 'row',
          fields: [
            { name: 'approvedCount', type: 'number', label: 'Подтверждено записей' },
            { name: 'heldCount', type: 'number', label: 'Не подтверждено' },
          ],
        },
        {
          /*
           * Замечания эксперта. Тот же смысл, что и в пакете загрузки,
           * плюс одно дополнительное действие: замечание «требует
           * исправления» исключает своё животное из подтверждения.
           * Так список причин и список исключений — это один список,
           * а не два, которые однажды разойдутся.
           */
          name: 'findings',
          type: 'array',
          label: 'Замечания',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'animal',
                  type: 'relationship',
                  relationTo: 'animals',
                  label: 'Животное',
                },
                { name: 'field', type: 'text', label: 'Поле или показатель' },
                {
                  name: 'severity',
                  type: 'select',
                  label: 'Насколько существенно',
                  defaultValue: 'fix',
                  options: [
                    { value: 'fix', label: 'Требует исправления — запись не подтверждается' },
                    { value: 'note', label: 'На усмотрение хозяйства' },
                  ],
                },
              ],
            },
            { name: 'text', type: 'textarea', label: 'Что не так', required: true },
          ],
        },
        {
          /**
           * Автоматические находки, которые эксперт разобрал и признал
           * не ошибкой.
           *
           * ## Зачем это понадобилось
           *
           * До сих пор автоматические проверки эксперту только показывались.
           * Подтверждению они не мешали ничем: запись получала «Проверено
           * ассоциацией» с непогашенным `parent-younger` или
           * `blood-vs-parents`. Статус при этом означает наивысшую
           * достоверность — то есть система утверждала то, что сама же
           * и опровергала двумя экранами выше.
           *
           * Простое решение — запретить подтверждение при существенной
           * находке — отвергнуто. Правило написано программистом, а не
           * зоотехником; эксперт вправе счесть находку несущественной,
           * и это записано в каталоге проверок как обещание хозяйству.
           * Запрет отнял бы у него это право.
           *
           * Поэтому запрещено не подтверждение, а **молчание**. Существенная
           * находка должна быть либо перенесена в замечания (тогда запись
           * не подтверждается), либо снята здесь — с объяснением. Третьего
           * не дано, и «эксперт не заметил» перестаёт быть возможным
           * исходом.
           *
           * ## Почему с обязательной причиной
           *
           * Снятие находки — это утверждение «я посмотрел, здесь не ошибка».
           * Без объяснения оно неотличимо от «мне мешал красный значок»,
           * а разбирать потом, почему запись подтвердили вопреки проверке,
           * будет уже другой человек и через год.
           */
          name: 'dismissed',
          type: 'array',
          label: 'Снятые автоматические находки',
          labels: { singular: 'Снятая находка', plural: 'Снятые находки' },
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
                },
                {
                  /*
                   * Код проверки строкой, а не перечислением: то же решение,
                   * что и в `check_settings`. Проверки заводятся кодом,
                   * и новая не должна требовать миграции.
                   */
                  name: 'code',
                  type: 'text',
                  label: 'Код проверки',
                  required: true,
                },
              ],
            },
            {
              name: 'reason',
              type: 'textarea',
              label: 'Почему это не ошибка',
              required: true,
            },
            {
              name: 'by',
              type: 'relationship',
              relationTo: 'users',
              label: 'Кто снял',
              admin: { readOnly: true },
            },
            { name: 'at', type: 'date', label: 'Когда', admin: { readOnly: true } },
          ],
        },
      ],
    },
  ],

  hooks: {
    beforeChange: [
      /*
       * На создании правило доступа отдаёт булево и содержимого записи
       * не видит: хук сверяет организацию заявки с организацией
       * подающего, иначе заявку можно подать от чужого имени.
       */
      requireOwnOrganization,
      async ({ data, req, operation }) => {
        if (operation !== 'create') return data

        /*
         * Животные заявки — только свои, и не больше потолка.
         *
         * Действие (`actions/verification.ts`) это проверяло с самого
         * начала, а хук сверял одну организацию. Через `POST
         * /api/verification-requests` можно было подать заявку на чужих
         * животных, и решение эксперта поставило бы им «Проверено
         * ассоциацией»: эксперт видит номера, но кому они принадлежат,
         * страница не подсвечивает. Проверка молчит без пользователя —
         * так ходят сид и скрипты.
         */
        if (req.user && !isAssociation(req.user)) {
          const org = relId((req.user as { organization?: unknown }).organization)
          const ids = ((data.animals ?? []) as unknown[])
            .map((a) => relId(a))
            .filter((n): n is number => n !== null)
          if (ids.length > VERIFICATION_LIMIT) {
            denyAccess(`За раз можно подать не больше ${VERIFICATION_LIMIT} записей`)
          }
          if (ids.length) {
            const { totalDocs } = await req.payload.count({
              collection: 'animals',
              where: { and: [{ id: { in: ids } }, { owner: { equals: org } }] },
              overrideAccess: true,
              req,
            })
            if (totalDocs !== new Set(ids).size) {
              denyAccess('В заявке есть записи другого хозяйства')
            }
          }
        }

        if (req.user && !data.requestedBy) data.requestedBy = req.user.id
        if (!data.requestedAt) data.requestedAt = new Date().toISOString()

        /*
         * Номер заявки: год и порядковый номер внутри года. Человеку с ним
         * разговаривать по телефону, поэтому не UUID и не идентификатор
         * строки — «В-2026-014» произносится вслух.
         */
        if (!data.number) {
          const year = new Date().getFullYear()
          const { totalDocs } = await req.payload.count({
            collection: 'verification-requests',
            where: { number: { like: `В-${year}-` } },
            overrideAccess: true,
            /*
             * Счёт обязан идти внутри транзакции записи (решение №20).
             * Отдельное подключение не видит строк, которые эта же
             * запись уже вставила, — и две заявки, заведённые подряд,
             * получили бы один номер. Номер этот произносят по телефону.
             */
            req,
          })
          data.number = `В-${year}-${String(totalDocs + 1).padStart(3, '0')}`
        }

        return data
      },
    ],
  },
}
