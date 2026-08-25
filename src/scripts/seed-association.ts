import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Наполнение кабинета Ассоциации: показать работу, а не пустые списки.
 *
 * ## Зачем отдельный сид
 *
 * `seed` наполняет книгу животными, `seed:bulk` набирает объём,
 * `seed:bull-card` делает эталонную карточку. Кабинет Ассоциации при этом
 * остаётся пустым: в нём нет ни одного пакета на разборе, ни одной заявки,
 * ни одной неопознанной колонки. Человек, впервые открывший кабинет, видит
 * восемь разделов и в каждом «пока ничего» — и не может понять, чем этот
 * кабинет вообще занимается.
 *
 * ## Главное правило: разнообразие состояний, а не количество записей
 *
 * Двадцать одинаковых пакетов со статусом «загружено» показывают ровно
 * столько же, сколько один. Ценность кабинета в том, что работа проходит
 * через состояния: пакет загружен, взят на проверку, принят или отклонён;
 * заявка подана, разобрана, отозвана в пользу новой. Поэтому здесь
 * по одной-две записи на каждое состояние и ни одной лишней.
 *
 * То же с колонками карантина: важно не сколько их, а насколько они разные
 * — балльная шкала, дата, признак «да/нет», известный признак под чужим
 * названием. По ним видно, какие решения вообще бывают.
 *
 * ## Что скрипт не трогает
 *
 * Животных не создаёт и не правит: их дело других сидов. Из чужих записей
 * он только берёт первые попавшиеся, чтобы приложить к заявке, — заявка
 * без животных не сохраняется, поле обязательное.
 *
 *   npm run seed:association
 *   npm run seed:association -- --undo   — убрать созданное
 *
 * ## Как откат находит своё
 *
 * По номеру записи, а не по метке в тексте. Пакеты и заявки нумеруются
 * с девятисотого — настоящие идут с единицы, — а колонки помечены меткой
 * в поле набора. Списка рядом со скриптом не ведём: след в самой записи
 * переживёт что угодно, а список рассыпется при первом же ручном удалении.
 *
 * Членство хозяйств откат не возвращает: мы его не заводили, а меняли,
 * и прежнего значения не помним. Восстановить его — дело `npm run seed`.
 */

const TAG = 'SEED-ASSOC'
const UNDO = process.argv.includes('--undo')

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/**
 * Убрать всё, что этот сид когда-либо создавал.
 *
 * Зовётся и откатом, и началом обычного прогона. Второе важнее первого:
 * номера пакетов уникальны, и повтор без уборки падал бы на дубликате
 * — причём падал бы на середине, оставив кабинет наполовину заполненным.
 * Сид, который нельзя запустить дважды, на деле нельзя запустить и один
 * раз: первый же прогон обрывается на незнакомом значении справочника,
 * и дальше нужен именно повтор.
 *
 * Ищем по номеру, а не по метке в тексте. Комментарий у пакета лежит
 * внутри группы разбора, а не в корне записи, и отбор по нему ничего
 * не находил бы молча — уборка сообщала бы «удалено ноль» на полном
 * кабинете. Номер же виден и человеку: ПД-2026-9xx и ЗВ-2026-9xx
 * заведомо наши, настоящие нумеруются с единицы.
 */
async function removeSeeded(payload: Awaited<ReturnType<typeof getPayload>>): Promise<number> {
  let removed = 0

  for (const [collection, prefix] of [
    ['data-submissions', 'ПД-'],
    ['verification-requests', 'ЗВ-'],
  ] as const) {
    const { docs } = await payload.find({
      collection,
      where: { number: { like: prefix } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs) {
      await payload.delete({ collection, id: d.id, overrideAccess: true })
      removed += 1
    }
  }

  const cols = await payload.find({
    collection: 'pending-columns',
    where: { dataset: { like: TAG } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  for (const d of cols.docs) {
    await payload.delete({ collection: 'pending-columns', id: d.id, overrideAccess: true })
    removed += 1
  }

  return removed
}

async function main() {
  const payload = await getPayload({ config })

  if (UNDO) {
    console.log(`\nУдалено записей: ${await removeSeeded(payload)}\n`)
    process.exit(0)
  }

  const cleared = await removeSeeded(payload)
  if (cleared > 0) console.log(`\nУбрано с прошлого прогона: ${cleared}`)

  /* --------------------------- Что уже есть --------------------------- */
  const orgs = await payload.find({
    collection: 'organizations',
    limit: 8,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
  })

  if (orgs.docs.length < 3) {
    console.error('В книге меньше трёх хозяйств. Сначала: npm run seed\n')
    process.exit(1)
  }

  const users = await payload.find({
    collection: 'users',
    limit: 5,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
  })

  const expert = users.docs.find((u) => u.role === 'admin' || u.role === 'expert')
  const farmer = users.docs.find((u) => u.role === 'farmer') ?? users.docs[0]

  const animals = await payload.find({
    collection: 'animals',
    limit: 12,
    depth: 0,
    sort: '-ipc',
    overrideAccess: true,
  })

  if (!animals.docs.length) {
    console.error('В книге нет животных. Сначала: npm run seed\n')
    process.exit(1)
  }

  const animalIds = animals.docs.map((a) => a.id as number)
  const org = (i: number) => orgs.docs[i % orgs.docs.length].id as number

  console.log('\nНаполнение кабинета Ассоциации\n')

  /* ------------------------- Пакеты загрузки ------------------------- */
  /*
   * По пакету на каждое состояние. Числа приёмки заполнены осмысленно:
   * принятый пакет не может иметь пропущенных строк больше, чем всего,
   * а у отклонённого причина отказа должна быть видна в списке непринятых
   * строк — иначе отказ выглядит произволом Ассоциации.
   */
  const submissions = [
    {
      status: 'uploaded' as const,
      kind: 'events' as const,
      org: 0,
      days: 1,
      intake: { rows: 240, created: 0, updated: 0, skipped: 0 },
      issues: [],
      comment: `${TAG}: контрольные дойки за август, ждёт разбора`,
    },
    {
      status: 'checking' as const,
      kind: 'animals' as const,
      org: 1,
      days: 3,
      intake: { rows: 58, created: 51, updated: 0, skipped: 7 },
      issues: [
        { row: 12, ident: '312400010045', reason: 'Не указана дата рождения' },
        { row: 19, ident: '312400010052', reason: 'Отец не найден в книге' },
        { row: 33, ident: '312400010066', reason: 'Кровность 140 % — вне диапазона 0…100' },
      ],
      comment: `${TAG}: пополнение стада, три строки под вопросом`,
    },
    {
      status: 'checked' as const,
      kind: 'productivity' as const,
      org: 2,
      days: 6,
      intake: { rows: 1840, created: 1840, updated: 0, skipped: 0 },
      issues: [],
      comment: `${TAG}: дойки за квартал, замечаний нет — ждёт публикации`,
    },
    {
      status: 'accepted' as const,
      kind: 'events' as const,
      org: 0,
      days: 14,
      intake: { rows: 96, created: 71, updated: 25, skipped: 0 },
      issues: [],
      comment: `${TAG}: отёлы за июль, принято и опубликовано`,
    },
    {
      status: 'rejected' as const,
      kind: 'genomics' as const,
      org: 1,
      days: 21,
      intake: { rows: 40, created: 0, updated: 0, skipped: 40 },
      issues: [
        { row: 1, ident: '—', reason: 'Формат файла не распознан: ожидался CSV или XLSX' },
      ],
      comment: `${TAG}: результаты генотипирования в неизвестном формате`,
    },
  ]

  let created = 0
  for (const [i, s] of submissions.entries()) {
    await payload.create({
      collection: 'data-submissions',
      overrideAccess: true,
      data: {
        number: `ПД-${new Date().getFullYear()}-${String(900 + i)}`,
        kind: s.kind,
        status: s.status,
        organization: org(s.org),
        submittedBy: farmer?.id,
        submittedAt: daysAgo(s.days),
        comment: s.comment,
        intake: {
          ...s.intake,
          issues: s.issues.map((x) => ({ row: x.row, ident: x.ident, reason: x.reason })),
        },
      } as never,
    })
    created += 1
  }
  console.log(`  пакетов загрузки: ${submissions.length} — по одному на каждое состояние`)

  /* --------------------------- Заявки на верификацию --------------------------- */
  /*
   * Заявка отличается от пакета предметом: пакет про файл, заявка про
   * животных. Поэтому у каждой здесь свой набор записей и своя цель —
   * повысить достоверность, подготовить свидетельство, подтвердить
   * племенной статус хозяйства.
   */
  const requests = [
    {
      status: 'new' as const,
      purpose: 'trust' as const,
      org: 0,
      days: 2,
      animals: animalIds.slice(0, 5),
      comment: `${TAG}: проверьте происхождение, документы приложены`,
    },
    {
      status: 'checking' as const,
      purpose: 'certificate' as const,
      org: 1,
      days: 5,
      animals: animalIds.slice(2, 6),
      comment: `${TAG}: готовим свидетельства к продаже`,
    },
    {
      status: 'approved' as const,
      purpose: 'membership' as const,
      org: 2,
      days: 18,
      animals: animalIds.slice(0, 8),
      comment: `${TAG}: подтверждение племенного статуса, подтверждено полностью`,
      review: { approvedCount: 8, heldCount: 0, comment: 'Расхождений не найдено' },
    },
    {
      status: 'rejected' as const,
      purpose: 'trust' as const,
      org: 1,
      days: 25,
      animals: animalIds.slice(4, 7),
      comment: `${TAG}: отклонена — у двух записей нет подтверждения происхождения`,
      review: {
        approvedCount: 1,
        heldCount: 2,
        comment: 'Происхождение не подтверждено документами; ДНК-тест не приложен',
      },
    },
    {
      /*
       * Отзыв называется `cancelled`, а не `withdrawn`: первый прогон
       * упал на «Следующее поле недействительно: Состояние», потому что
       * значение я написал по смыслу, а не по справочнику. Ошибка полезная
       * — она показывает, что перечисление проверяется, а не принимает
       * любую строку.
       */
      status: 'cancelled' as const,
      purpose: 'trust' as const,
      org: 0,
      days: 30,
      animals: animalIds.slice(0, 3),
      comment: `${TAG}: отозвана хозяйством в пользу новой заявки`,
    },
  ]

  for (const [i, r] of requests.entries()) {
    await payload.create({
      collection: 'verification-requests',
      overrideAccess: true,
      data: {
        number: `ЗВ-${new Date().getFullYear()}-${String(900 + i)}`,
        status: r.status,
        purpose: r.purpose,
        organization: org(r.org),
        requestedBy: farmer?.id,
        requestedAt: daysAgo(r.days),
        animals: r.animals,
        comment: r.comment,
        ...(r.review
          ? {
              review: {
                decidedBy: expert?.id,
                decidedAt: daysAgo(r.days - 1),
                comment: r.review.comment,
                approvedCount: r.review.approvedCount,
                heldCount: r.review.heldCount,
              },
            }
          : {}),
      } as never,
    })
    created += 1
  }
  console.log(`  заявок на верификацию: ${requests.length} — включая отозванную`)

  /* --------------------------- Неопознанные колонки --------------------------- */
  /*
   * Здесь ценно не количество, а разнородность: по примерам значений
   * должно быть видно, что за величина и какое решение она требует.
   * Балльная шкала — кандидат в признаки; дата — скорее служебное поле;
   * «да/нет» — признак наличия; знакомый признак под чужим названием —
   * повод не заводить новый, а сопоставить.
   */
  const columns = [
    {
      title: 'Упитанность (BCS)',
      samples: ['3.0', '3.25', '2.75', '3.5', '3.0', '2.5'],
      seen: 7,
      rows: 4120,
      status: 'new' as const,
    },
    {
      title: 'Ширина задней доли вымени',
      samples: ['5', '7', '4', '6', '8', '5'],
      seen: 4,
      rows: 1870,
      status: 'new' as const,
    },
    {
      title: 'Дата последней обрезки копыт',
      samples: ['12.08.2024', '03.02.2025', '19.11.2024'],
      seen: 2,
      rows: 640,
      status: 'new' as const,
    },
    {
      title: 'Рогатость',
      samples: ['да', 'нет', 'нет', 'да', 'комолая'],
      seen: 3,
      rows: 2210,
      status: 'new' as const,
    },
    {
      title: 'Глуб. вымени',
      samples: ['6', '4', '5', '7'],
      seen: 1,
      rows: 310,
      status: 'duplicate' as const,
      mapsTo: 'udderDepth',
      decision: 'Это глубина вымени под сокращённым названием — сопоставлена с реестром',
    },
    {
      title: 'Примечание оператора',
      samples: ['перевод в 3 корпус', 'хромота, лечим', 'осмотр 12.03'],
      seen: 5,
      rows: 980,
      status: 'declined' as const,
      decision:
        'Свободный текст без шкалы: признаком не станет, для заметок есть поле примечания в карточке',
    },
  ]

  for (const c of columns) {
    await payload.create({
      collection: 'pending-columns',
      overrideAccess: true,
      data: {
        title: c.title,
        normalized: c.title.trim().toLowerCase(),
        dataset: `${TAG}: Добавление животных`,
        status: c.status,
        mapsTo: c.mapsTo,
        seenTimes: c.seen,
        rowsWithValue: c.rows,
        firstSeenAt: daysAgo(c.seen * 9),
        lastSeenAt: daysAgo(1),
        samples: c.samples,
        organizations: orgs.docs.slice(0, Math.min(3, orgs.docs.length)).map((o) => o.id as number),
        ...(c.decision
          ? {
              decision: {
                comment: c.decision,
                decidedBy: expert?.id,
                decidedAt: daysAgo(2),
              },
            }
          : {}),
      } as never,
    })
    created += 1
  }
  console.log(`  неопознанных колонок: ${columns.length} — четыре ждут разбора, две разобраны`)

  /* ------------------------------ Членство ------------------------------ */
  /*
   * Разные состояния членства нужны разделу «Хозяйства»: список, где все
   * записи одинаковы, не показывает, что с ними вообще можно делать.
   * Правится только членство и только у первых трёх — остальные хозяйства
   * остаются как были.
   */
  const memberships = ['pending', 'member', 'suspended'] as const
  for (const [i, m] of memberships.entries()) {
    const target = orgs.docs[i]
    if (!target) continue
    await payload.update({
      collection: 'organizations',
      id: target.id,
      overrideAccess: true,
      data: { membership: m } as never,
    })
  }
  console.log('  членство хозяйств: заявка на рассмотрении, действующий член, приостановлено')

  console.log(`\nГотово. Создано записей: ${created}`)
  console.log('Кабинет: /association')
  console.log(`Убрать созданное: npm run seed:association -- --undo\n`)
  process.exit(0)
}

main().catch((e) => {
  console.error('\nОшибка наполнения:', e instanceof Error ? e.message : e)
  process.exit(1)
})
