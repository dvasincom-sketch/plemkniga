import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BullProofBlock, BullStatusNote } from '@/components/BullProof'
import { bullProof } from '@/lib/bull-proof'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ExteriorChart, LinearScoreChart } from '@/components/ExteriorChart'
import { AnimalEventsTab } from '@/components/AnimalEventsTab'
import { AnimalOriginTab } from '@/components/AnimalOriginTab'
import { TrustBadge } from '@/components/TrustBadge'
import { InfoTip } from '@/components/InfoTip'
import { Computed } from '@/components/Computed'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { LactationDynamics } from '@/components/LactationDynamics'
import { AnimalPassport } from '@/components/AnimalPassport'
import { AnimalEditBlock } from '@/components/AnimalEditBlock'
import { AnimalEventForms } from '@/components/AnimalEventForms'
import { AnimalRevisionsPanel } from '@/components/AnimalRevisionsPanel'
import { blockValues, type Choice } from '@/lib/animal-edit'
import { CertificateSection } from '@/components/CertificateSection'
import { certificateReadiness } from '@/lib/certification'
import { ClosedAnimal } from '@/components/ClosedAnimal'
import { AccessRequestForm } from '@/components/AccessRequestForm'
import { RecordPanel } from '@/components/RecordPanel'
import { VisibilityForm } from '@/components/VisibilityForm'
import { ArchiveBlock } from '@/components/ArchiveBlock'
import { ARCHIVE_RETENTION_DAYS } from '@/lib/archive-retention'
import { resolveShare } from '@/lib/share-links'
import { GrantBanner, ScopeLocked } from '@/components/AccessScope'
import { grantsFor, scopesForAnimal } from '@/lib/grants'
import { recordAnimalView, uniqueViews } from '@/lib/access-log'
import { isAssociation } from '@/access'
import type { AccessScope } from '@/lib/dictionaries'
import { after } from 'next/server'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAnimalLocked, relId, viewerOf } from '@/lib/visibility'
import {
  AGE_GROUPS,
  CALVING_ROLE_TRAITS,
  CALVING_TRAITS,
  DOCUMENT_TYPES,
  EXTERIOR_COMPOSITES,
  EXTERIOR_TRAITS,
  LONGEVITY_TRAITS,
  PRODUCTION_TRAITS,
  labelOf,
} from '@/lib/dictionaries'
import { THRESHOLDS } from '@/lib/bull-status'
import { afcMonths } from '@/lib/afc'
import { cowEvidence } from '@/lib/cow-evidence'
import { dateRu, nf, plural, signed } from '@/lib/format'
import { IndexBreakdown } from '@/components/IndexBreakdown'
import { EvaluationHistory } from '@/components/EvaluationHistory'
import { Collapsible } from '@/components/Collapsible'
import { computeIndex } from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import { resolveProfile } from '@/lib/index-profiles'
import { percentileFromStored } from '@/lib/index-values'
import type { AccessRequest, Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'general', label: 'Общие данные' },
  { key: 'evaluation', label: 'Оценка' },
  { key: 'events', label: 'События' },
  { key: 'origin', label: 'Происхождение' },
  { key: 'documents', label: 'Документы' },
  { key: 'media', label: 'Фото/Видео' },
] as const

type TabKey = (typeof TABS)[number]['key']

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return { title: `Животное № ${id}` }
}

/** Имя связанной записи справочника. */
const relName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = o.name ?? o.fullName ?? o.title
    if (typeof n === 'string' && n) return n
  }
  return '—'
}

/*
 * Что можно поправить на карточке и в каком блоке.
 *
 * Списки короткие намеренно. Правят руками паспорт и происхождение —
 * то, что переписывают со свидетельства. Оценки сюда не входят: у них своя
 * история (`animal_evaluations`), и правка «на глаз» в обход неё сделала бы
 * снимок и историю разными вещами. Владелец и уровень достоверности тоже
 * не правятся: первое — передача животного, второе — решение ассоциации.
 */
const IDENTITY_FIELDS = [
  'identNumber',
  'idFormat',
  'name',
  'sex',
  'state',
  'ageGroup',
  'birthDate',
  'breed',
  'bloodPercent',
  'coatColor',
  'bloodGroup',
  'purpose',
  'altIds.earTag',
  'altIds.internationalId',
] as const

const ORIGIN_FIELDS = [
  'category',
  'registrationBasis',
  'breedingClass',
  'line',
  'family',
  'inbreeding',
  'pedigreeText.fatherId',
  'pedigreeText.fatherName',
  'pedigreeText.motherId',
  'pedigreeText.motherName',
  'pedigreeText.fatherFatherId',
  'pedigreeText.motherFatherId',
] as const

const CARRIER_LABEL: Record<string, string> = {
  unknown: 'не тестировано',
  free: 'свободен',
  carrier: 'носитель',
}

/**
 * Достоверность самой оценки (шкала 1…5) — это не то же самое, что уровень
 * достоверности записи в шапке (шкала −1…3). Формулировки разведены намеренно,
 * чтобы их не путали.
 */
const ReliabilityNote = ({ value }: { value?: number | null }) => (
  <span className="inline-flex items-center gap-1.5 text-[13px] leading-none text-ink-500">
    По документу:{' '}
    <span className="font-medium tabular-nums text-ink-900">{value ?? '—'}</span>
    <span>из 5</span>
    <InfoTip label="Откуда взялась эта пятибалльная оценка">
      <p className="mb-2 font-medium text-ink-900">Уровень достоверности по документу</p>
      <p className="mb-2">
        Это оценка того, кто прислал данные, а не наш расчёт. Расчётный центр ставит её
        по своим правилам: 1 — оценка предварительная, 5 — подтверждена большим массивом
        данных. Мы её показываем как есть и в индексе не используем.
      </p>
      <p className="mb-2">
        <b>Не путайте с колонкой «R, %» в таблице рядом.</b> Там надёжность каждого признака
        по отдельности — она посчитана из числа учтённых потомков и лактаций и у разных
        признаков разная. Пятибалльная оценка одна на весь блок и приходит извне; совпадать
        они не обязаны и часто не совпадают.
      </p>
      <p>
        И ни то ни другое — не уровень достоверности записи в шапке карточки: тот показывает,
        кем проверены сами данные.
      </p>
    </InfoTip>
  </span>
)

/**
 * Ниже этой надёжности прогноз показывается приглушённо.
 *
 * Порог не выбран для красоты: при R = 50 % половина изменчивости
 * прогноза ничем не объяснена, и число ошибается примерно так же часто,
 * как угадывает. Та же граница отделяет предварительную оценку
 * от недостаточной в `src/lib/bull-status.ts`, и разъезжаться этим двум
 * местам нельзя — иначе карточка назовёт оценку предварительной
 * и тут же покажет её наравне с надёжной.
 */
const WEAK_RELIABILITY = THRESHOLDS.preliminary.reliability * 100

/**
 * Таблица «Показатель | Прогноз | R,%».
 *
 * ## Почему ненадёжное показано бледнее
 *
 * Первая редакция печатала все числа одинаково. На эталонной карточке
 * это сразу вылезло: удой стоял с надёжностью 82 %, фертильность дочерей
 * — с 36 %, и оба обычным шрифтом. Разница не в аккуратности данных,
 * а в природе признаков: у фертильности наследуемость 0,04, и той же
 * полусотни дочерей ей хватает на треть надёжности вместо четырёх пятых.
 * Читатель, не знающий этого, складывает два числа в одну картину быка
 * и получает уверенность, которой нет.
 *
 * Колонка R стояла рядом и всё это честно сообщала — но колонка сообщает
 * тому, кто в неё посмотрел, а бледный шрифт виден раньше, чем прочитан.
 *
 * ## Почему бледнее, а не спрятано
 *
 * Соблазн был прятать прогноз до порога надёжности. Так делать нельзя:
 * слабая оценка — это всё же оценка, и она нужна тому, кто выбирает
 * молодого быка осознанно. Спрятать её значит решить за покупателя;
 * приглушить — предупредить его.
 */
function MetricTable({
  head,
  rows,
}: {
  head: string[]
  rows: { label: string; unit?: string; forecast?: number | null; r?: number | null; digits?: number }[]
}) {
  /*
   * Таблица из одних прочерков не рисуется.
   *
   * У коровы без привезённой оценки в этих таблицах не бывает ни одного
   * значения — а рисовались они целиком: тридцать две строки «— —»
   * с заголовками, единицами и подписями шкал. Прочерк на месте одного
   * числа сообщает «этого нет»; тридцать два прочерка подряд сообщают
   * только то, что читателю здесь делать нечего, и занимают под это
   * пол-экрана.
   *
   * Названия признаков при этом теряются, и это осознанная потеря: строка
   * ниже говорит, чего именно нет, а полный перечень признаков профиля
   * стоит в разборе индекса, где он к месту.
   */
  const anyValue = rows.some(
    (r) => typeof r.forecast === 'number' || typeof r.r === 'number',
  )

  if (!anyValue) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-500">
        В документе оценок по этим признакам нет.
      </p>
    )
  }

  return (
    <>
      <table className="metric-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i === 0 ? '' : 'text-right'} colSpan={i === 0 ? 2 : 1}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const low = typeof r.r === 'number' && r.r > 0 && r.r < WEAK_RELIABILITY
            return (
              <tr key={r.label + (r.unit ?? '')}>
                <td>{r.label}</td>
                <td className="w-14 text-ink-500">{r.unit ?? ''}</td>
                <td className={`text-right tabular-nums ${low ? 'text-ink-300' : ''}`}>
                  {nf(r.forecast, r.digits ?? 2)}
                </td>
                <td
                  className={`w-20 text-right tabular-nums ${low ? 'font-medium text-accent-600' : ''}`}
                >
                  {nf(r.r, 1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

    </>
  )
}

/**
 * Пояснение про бледные прогнозы — одно на карточку.
 *
 * Стояло под каждой таблицей, где нашлась слабая надёжность, и на быке
 * с заполненными данными напечаталось трижды: под воспроизводством,
 * под семенем и под отёлами. Повтор через два абзаца — не настойчивость,
 * а шум: третий раз его уже не читают, а место он занимает в каждом блоке.
 *
 * Условие показа осталось прежним по смыслу: если бледного на карточке
 * нет, объяснять нечего.
 */
function WeakNote() {
  return (
    <p className="-mt-2 mb-6 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
      Бледным ниже показаны прогнозы с надёжностью меньше {nf(WEAK_RELIABILITY, 0)} %: данных
      по таким признакам накоплено меньше половины нужного, и значение может заметно измениться.
      Это не ошибка в карточке — у признаков с низкой наследуемостью надёжность растёт
      медленнее, и одного и того же числа дочерей им хватает на меньшее.
    </p>
  )
}

export default async function AnimalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; share?: string; manage?: string }>
}) {
  const { id } = await params
  const { tab: tabParam, share: shareParam, manage: manageParam } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'evaluation'

  /*
   * Что раскрыто в управлении записью — из адреса, а не из памяти
   * страницы. На такое состояние можно сослаться, и работает оно
   * без единой строки на клиенте: тем же способом, каким на карточке
   * переключаются разделы.
   */
  const manage: 'visibility' | 'archive' | null =
    manageParam === 'visibility' || manageParam === 'archive' ? manageParam : null

  const user = await getCurrentUser()
  const viewer = viewerOf(user)
  const payload = await getClient()

  /*
   * Ссылка на просмотр приходит адресом, а не входом в систему.
   *
   * Посетитель по ссылке — обычно человек без учётной записи: покупатель,
   * ветеринар, страховой агент. Прав у него нет никаких, и запись ему
   * отдаётся не потому, что он кто-то, а потому, что владелец выпустил
   * ссылку именно на неё. Поэтому здесь два условия, а не одно: токен
   * действует **и** запись входит в эту ссылку. Подставить в адрес чужой
   * идентификатор с чужим токеном не поможет — второе условие не сойдётся.
   */
  const share = await resolveShare(payload, shareParam)
  /*
   * `Number(id)` — не косметика. Адрес отдаёт идентификатор строкой,
   * а в ссылке лежат числа: `Set<number>.has('579')` всегда ложь, и первая
   * редакция молча не пускала по совершенно правильной ссылке.
   */
  const sharedHere = Boolean(share && share.animalIds.has(Number(id)))

  let animal: Animal | null = null
  try {
    animal = (await payload.findByID({
      collection: 'animals',
      id,
      depth: 2,
      /*
       * Обычные права обошли бы ссылку: у гостя их нет, и закрытая запись
       * не отдалась бы ему никогда. Обход включается ровно для записи,
       * названной в действующей ссылке, — и ни для какой другой.
       */
      overrideAccess: sharedHere,
      user,
    })) as Animal
  } catch {
    notFound()
  }
  if (!animal) notFound()

  const owner =
    typeof animal.owner === 'object' && animal.owner ? animal.owner.name : '—'

  const exteriorRaw = (animal.exterior ?? {}) as Record<string, number | null | undefined>

  /*
   * Собственный промер животного — из своей группы, а не из `exterior`.
   * Блок показывается, только если промер есть: у быка его не бывает,
   * у коровы бывает не всегда, и пустая таблица на восемнадцать строк
   * читается как потеря данных.
   */
  const linearRaw = (animal.linearScore ?? {}) as Record<string, number | null | undefined>
  const hasLinearScore = EXTERIOR_TRAITS.some((t) => typeof linearRaw[t.key] === 'number')

  /*
   * Экстерьер по потомству показывается, только когда он есть.
   *
   * Блок рисует восемнадцать признаков со шкалами, тремя композитами
   * и двумя абзацами объяснений — половину экрана. У коровы без
   * привезённой оценки в нём не бывает ни одного значения, и половина
   * экрана уходит на то, чтобы восемнадцать раз сказать «нет данных».
   *
   * Признак тот же, что у собственного промера строкой выше: есть ли
   * хоть одно число. Разное поведение у двух соседних блоков с одним
   * содержимым читалось бы как разница в данных, которой нет.
   */
  const hasExteriorPta = [...EXTERIOR_TRAITS, ...EXTERIOR_COMPOSITES].some(
    (t) => typeof exteriorRaw[t.key] === 'number',
  )

  /*
   * Достоверность группы показывается только при заполненной группе.
   *
   * «По документу: 3 из 5» стояло над блоком, в котором нет ни одного
   * прогноза, — и это то же самое, что процентиль у неизмеренного
   * животного: уровень достоверности у данных, которых нет. Тройка
   * к тому же стоит в базе значением по умолчанию, то есть сообщала
   * не о документе, а о нашей схеме.
   */
  const hasGroupValues = (
    group: unknown,
    traits: readonly { key: string }[],
  ): boolean =>
    traits.some(
      (t) =>
        typeof (group as Record<string, { forecast?: number | null }> | undefined)?.[t.key]
          ?.forecast === 'number',
    )

  /*
   * Разделение отёлов по роли быка показывается, только когда оно есть
   * в данных: у отечественных оценок его нет вовсе, и пустые строки
   * читались бы как потеря.
   */
  const hasCalvingRoles = CALVING_ROLE_TRAITS.some(
    (t) =>
      typeof (
        (animal.calvingRoles as Record<string, { forecast?: number | null }> | undefined)?.[t.key]
      )?.forecast === 'number',
  )

  // Животное «своё», если принадлежит организации пользователя. От этого
  // зависит, показывать ли навигацию кабинета и куда ведёт цепочка возврата.
  const userOrgId =
    typeof user?.organization === 'object' && user.organization
      ? user.organization.id
      : (user?.organization ?? null)
  const ownerId = typeof animal.owner === 'object' && animal.owner ? animal.owner.id : animal.owner
  const isMine = Boolean(user && userOrgId && ownerId && userOrgId === ownerId)

  /*
   * Списки для выпадающих полей правки грузятся только владельцу: постороннему
   * они ни к чему, а это четыре запроса к справочникам на каждое открытие
   * чужой карточки — а чужих открывают чаще своих.
   */
  const editChoices: Record<string, Choice[]> = {}
  if (isMine) {
    const dicts = [
      ['breed', 'breeds'],
      ['coatColor', 'coat-colors'],
      ['bloodGroup', 'blood-groups'],
      ['purpose', 'animal-purposes'],
      ['category', 'breeding-categories'],
      ['breedingClass', 'breeding-classes'],
      ['line', 'lines'],
      ['family', 'lines'],
    ] as const

    const loaded = await Promise.all(
      dicts.map(([, collection]) =>
        payload.find({
          collection: collection as never,
          limit: 300,
          sort: 'name',
          depth: 0,
          overrideAccess: true,
        }),
      ),
    )

    dicts.forEach(([path], i) => {
      editChoices[path] = (loaded[i]?.docs ?? []).map((d: Record<string, unknown>) => ({
        value: String(d.id),
        label: String(d.name ?? d.title ?? d.id),
      }))
    })
  }

  /*
   * Списки для форм событий — только на вкладке «События» и только владельцу.
   * Стада берутся его собственные: перемещение внутри хозяйства не должно
   * предлагать чужие площадки, а передача животного другому хозяйству —
   * не перемещение, а отдельная операция.
   */
  const eventChoices: Record<string, Choice[]> = {}
  if (isMine && tab === 'events') {
    const [herds, reasons, technicians] = await Promise.all([
      payload.find({
        collection: 'herds',
        where: { organization: { equals: userOrgId } },
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'disposal-reasons',
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'technicians',
        limit: 200,
        sort: 'fullName',
        depth: 0,
        overrideAccess: true,
      }),
    ])

    const asChoices = (docs: { id: number | string; name?: string; fullName?: string }[]) =>
      docs.map((d) => ({ value: String(d.id), label: String(d.name ?? d.fullName ?? d.id) }))

    eventChoices.herds = asChoices(herds.docs)
    eventChoices.disposalReasons = asChoices(reasons.docs)
    eventChoices.technicians = asChoices(technicians.docs)
  }

  /*
   * Не своё животное оформляется иначе — целиком.
   *
   * Зоотехник открывает карточки вперемешку: своих и чужих. Одинаковый вид
   * приводит к тому, что чужие данные принимают за свои и пытаются править.
   * Поэтому вся страница уходит в бледно-зелёный фон, а шапка с кличкой
   * и номером — на тёмную плашку: отличие видно раньше, чем прочитан
   * владелец.
   *
   * Гостю оформление нужно ровно так же. Раньше оно включалось только после
   * входа, и неавторизованный посетитель видел карточку в том же виде,
   * что фермер — свою собственную: страница выглядела как «моё животное»
   * у человека, у которого животных вообще нет.
   */
  const isForeign = !isMine

  /**
   * Цвет шапки карточки: тёмно-серый у быка, зелёный у чужой записи.
   *
   * ## Зачем быку своя окраска
   *
   * Книга уже размечает карточки цветом: чужая запись идёт под зелёной
   * плашкой, своя — без плашки вовсе. Бык из этого ряда выпадал, хотя
   * отличается от коровы сильнее, чем чужая корова от своей: у него нет
   * ни удоя, ни вымени, ни лактаций, и каждое число в его карточке —
   * прогноз по дочерям, а не измерение. Подписями это сказано в трёх
   * местах, но подпись читают после того, как решили читать; цвет
   * работает раньше.
   *
   * ## Почему серый, а не ещё один зелёный
   *
   * Зелёный в книге занят — им отмечено «чужое». Второй зелёный означал бы
   * «то же самое, но другое», и различать их пришлось бы по оттенку.
   * Тёмно-серый в палитре уже есть (`basement`, подложка подвала) и ничем
   * не занят.
   *
   * ## Что происходит с чужим быком
   *
   * Побеждает бычья окраска, и это осознанный размен. Принадлежность
   * сказана словами прямо над шапкой — «Это животное принадлежит…», —
   * а вид животного словами не сказан нигде до самой шапки. Терять цветом
   * то, что уже сказано текстом, дешевле, чем то, что не сказано.
   */
  const isBullHeader = animal.sex === 'male'
  const headerTone = isBullHeader
    ? 'rounded-card bg-basement p-7 text-white sm:p-8'
    : isForeign
      ? 'rounded-card bg-forest-500 p-7 text-white sm:p-8'
      : ''
  const onDark = isBullHeader || isForeign

  /*
   * Формулировка зависит от того, знаем ли мы, кто смотрит.
   *
   * Вошедшему можно сказать «чужое хозяйство» — мы сравнили организации.
   * Гостю сказать нечего: он вполне может быть сотрудником этого самого
   * хозяйства. Поэтому ему сообщается не про принадлежность, а про режим
   * показа — владелец открыл эти данные публично.
   */
  const foreignNote = user
    ? {
        badge: 'Чужое хозяйство',
        text: `Это животное принадлежит ${owner} — данные доступны только для просмотра.`,
      }
    : {
        badge: 'Открытые данные',
        text: `Это животное принадлежит ${owner} — данные открыты для публичного просмотра владельцем.`,
      }

  /*
   * Закрытая карточка — отдельная страница, а не редирект на вход.
   *
   * Замок ставит владелец, и вход в систему его не снимает. Прежний редирект
   * на /login обещал обратное: человек вводил пароль и попадал на ту же
   * закрытую запись. Теперь страница объясняет, кто закрыл данные, и даёт
   * два выхода — запрос владельцу и похожие открытые животные.
   */
  /*
   * Что открыто этому посетителю точечно.
   *
   * Замок теперь снимается не только флажком `publicDetails`: у карточки
   * появилось третье состояние — открыта частично. Запись при этом отдаётся
   * (правило `animalRead` пропустило её по гранту), но половина вкладок
   * закрыта, и закрыты они по-разному от человека к человеку.
   *
   * Пустое множество означает «грантов нет» и ничего не меняет: страница
   * ведёт себя ровно как прежде.
   */
  const grants = await grantsFor(payload, userOrgId)
  const grantedScopes = scopesForAnimal(grants, animal.id as number, ownerId as number | null)

  /*
   * Области из ссылки добавляются к тем, что есть у посетителя.
   *
   * Складываются, а не заменяют: по ссылке может прийти и участник книги,
   * у которого свой грант на эту же запись. Отнять у него то, что ему уже
   * открыто, из-за того что он открыл присланный адрес, было бы наказанием
   * за переход по ссылке.
   */
  if (share && sharedHere) {
    for (const s of share.scopes) grantedScopes.add(s)
  }

  const lockedByOwner = isAnimalLocked(animal, viewer)
  /** Раздел показывается: карточка открыта целиком либо область выдана грантом. */
  const maySee = (scope: AccessScope): boolean => !lockedByOwner || grantedScopes.has(scope)
  /** Карточка открылась только благодаря гранту, и открылась не вся. */
  const partial = lockedByOwner && grantedScopes.size > 0

  if (lockedByOwner && grantedScopes.size === 0) {
    const [request, similar] = await Promise.all([
      user
        ? payload
            .find({
              collection: 'access-requests',
              where: {
                and: [{ animal: { equals: animal.id } }, { requester: { equals: user.id } }],
              },
              sort: '-createdAt',
              limit: 1,
              depth: 0,
              overrideAccess: false,
              user,
            })
            .then((r) => (r.docs[0] as AccessRequest | undefined) ?? null)
            .catch(() => null)
        : Promise.resolve(null),
      payload
        .find({
          collection: 'animals',
          where: {
            and: [
              { publicDetails: { equals: true } },
              { id: { not_equals: animal.id } },
              ...(animal.sex ? [{ sex: { equals: animal.sex } }] : []),
              ...(animal.ageGroup ? [{ ageGroup: { equals: animal.ageGroup } }] : []),
            ],
          },
          sort: '-ipcRank',
          limit: 6,
          depth: 1,
          overrideAccess: false,
          user,
        })
        .then((r) => r.docs as Animal[])
        .catch(() => [] as Animal[]),
    ])

    // Ссылка «все похожие» повторяет те же условия в отборе книги, чтобы
    // список можно было продолжить, а не начинать поиск заново
    const params = new URLSearchParams()
    if (animal.sex) params.set('sex', animal.sex)
    if (animal.ageGroup) params.set('ageGroup', animal.ageGroup)

    return (
      <>
        <SiteHeader active="/" />

        {/* Тот же бледно-зелёный фон, что и у чужой карточки: это не своё
            животное, и страница не должна выглядеть как раздел кабинета */}
        <main className="container-page foreign-animal pb-8">
          <Breadcrumbs
            items={[
              { label: 'Племенная книга', href: '/' },
              { label: `№ ${animal.identNumber}` },
            ]}
          />

          <ClosedAnimal
            animal={animal}
            ownerName={owner}
            signedIn={Boolean(user)}
            request={request}
            similar={similar}
            similarHref={`/?${params.toString()}#results`}
          />
        </main>

        <SiteFooter />
      </>
    )
  }

  const readiness = tab === 'documents' ? await certificateReadiness(payload, animal) : null

  /*
   * Оценка по дочерям считается только быку и только на вкладке «Оценка».
   * Это четыре агрегата по книге, и платить за них при открытии
   * происхождения или документов незачем.
   */
  /*
   * Признак быка спрашивается один раз и здесь.
   *
   * Ниже он решает не одно «показывать ли», а как подписаны блоки:
   * у быка все оценки — прогноз по дочерям, у коровы те же блоки
   * означают её собственные измерения. Проверка, повторённая в пяти
   * местах, разошлась бы при первом же расхождении полей.
   *
   * Спрашивается пол, а не бывшее поле «Тип животного»: оно убрано,
   * потому что на живой базе оказалось умолчанием формы и полу
   * не противоречило ни разу. Разбор — в `lib/dictionaries.ts`.
   */
  const isBull = animal.sex === 'male'

  /*
   * Есть ли на карточке хоть один слабый прогноз — считается один раз
   * и здесь, а не внутри каждой таблицы: пояснение к бледному шрифту
   * должно стоять над блоками единожды, а не повторяться под каждым.
   *
   * Перебираются те же наборы признаков, что и показываются ниже. Если
   * появится новый набор, он попадёт сюда же — иначе бледные числа
   * останутся без объяснения, что хуже, чем объяснение без бледных чисел.
   */
  const rOf = (v: unknown) => (v as { r?: number | null } | undefined)?.r
  const group = (g: unknown, keys: readonly { key: string }[]) =>
    keys.map((t) => rOf((g as Record<string, unknown> | undefined)?.[t.key]))

  const hasWeakReliability = [
    ...group(animal.production, PRODUCTION_TRAITS),
    ...group(animal.health, LONGEVITY_TRAITS),
    ...group(animal.health, CALVING_TRAITS),
    rOf(animal.reproduction?.fertility),
    rOf(animal.semen?.conception),
  ].some((r) => typeof r === 'number' && r > 0 && r < WEAK_RELIABILITY)

  const proof =
    tab === 'evaluation' && isBull ? await bullProof(payload, animal.id as number) : null

  /*
   * Возраст первого отёла коровы — на вкладке оценки, а не только в событиях.
   *
   * У быка он есть по дочерям и стоит рядом с остальной оценкой; у коровы
   * своего не было нигде на этом экране, хотя это признак того же ряда,
   * что удой и долголетие: раннее плодотворное осеменение экономит корма
   * и сдвигает всю продуктивную жизнь. Зоотехник, разбирающий племенную
   * ценность, смотрит его вместе с остальным, а не переходя на другую
   * вкладку и обратно.
   *
   * Берётся из `calvings`, а не из массива лактаций в карточке. Оба места
   * содержат дату отёла, но источник истины — отдельная таблица (решение
   * про ленту событий), и лента на соседней вкладке считает по ней. Взяв
   * здесь другое, мы получили бы два возраста первого отёла на одной
   * карточке.
   */
  const firstCalving =
    tab === 'evaluation' && !isBull && maySee('production')
      ? (
          await payload.find({
            collection: 'calvings',
            where: { animal: { equals: animal.id } },
            sort: 'date',
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
        ).docs[0]
      : null

  const afcOwn = firstCalving ? afcMonths(animal.birthDate, firstCalving.date) : null

  /*
   * На чём стоит оценка коровы — то же, что у быка «55 дочерей
   * в 17 хозяйствах», только для собственных наблюдений. Разбор
   * в `src/lib/cow-evidence.ts`.
   */
  const evidence =
    tab === 'evaluation' && !isBull && maySee('evaluation')
      ? await cowEvidence(payload, animal.id as number)
      : null

  /*
   * Инбридинг и возраст первого отёла — числа не из индекса, но того же
   * разговора: ценность и родственное спаривание читают вместе, а возраст
   * первого отёла это признак того же ряда, что удой и долголетие.
   *
   * Собраны здесь, а рисуются в подвале панели индекса. Каждое — один факт
   * и ссылка туда, где он разбирается: разбор родословной и список отёлов
   * остаются на своих вкладках, сюда вынесено только число. Дублирование
   * дешевле, чем переход туда и обратно посреди чтения оценки.
   */
  const fact = (label: string, value: ReactNode, href: string, linkText: string) => (
    <div key={label}>
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p className="mt-1 flex items-baseline gap-2.5 text-[15px] leading-snug">
        <span className="tabular-nums">{value}</span>
        <Link href={href} className="underline underline-offset-4 hover:text-forest-500">
          {linkText}
        </Link>
      </p>
    </div>
  )

  const ownFacts =
    typeof animal.inbreeding === 'number' || afcOwn !== null ? (
      <>
        {typeof animal.inbreeding === 'number' &&
          fact(
            'Коэффициент инбридинга',
            <Computed formula="inbreeding">{nf(animal.inbreeding, 2)} %</Computed>,
            `/animals/${id}?tab=origin`,
            'разбор родословной',
          )}
        {afcOwn !== null &&
          fact(
            'Возраст первого отёла',
            <>
              <Computed formula="afc">{afcOwn}</Computed>
              <span className="ml-1.5 text-[13px] font-normal text-ink-500">мес.</span>
            </>,
            `/animals/${id}?tab=events`,
            'отёлы',
          )}
      </>
    ) : null

  /*
   * Индекс считается по профилю смотрящего: хозяйство со своим набором весов
   * должно видеть карточку своими глазами. У гостя и у хозяйства без своего
   * профиля это стандартный профиль Ассоциации.
   *
   * Число считается здесь, а не берётся хранимым, потому что рядом показывается
   * разбор вклада признаков — а он живёт только в расчёте. Хранимое значение
   * даёт другое: место в группе сравнения, для которого нужна вся популяция.
   */
  const indexBlock =
    tab === 'evaluation'
      ? await (async () => {
          const [profile, base] = await Promise.all([
            resolveProfile(undefined, userOrgId ?? undefined),
            loadActiveBase(payload),
          ])
          const result = computeIndex(animal!, profile, base)
          const birthYear = animal!.birthDate ? new Date(animal!.birthDate).getFullYear() : null
          const percentile = await percentileFromStored(
            payload,
            profile.key,
            Math.round(result.value * 100) / 100,
            birthYear,
            animal!.id as number,
          )
          return { result, percentile }
        })()
      : null

  /*
   * Подробности гранта — только для показа и только на редком пути.
   *
   * Срок и охват в горячий загрузчик не попадают намеренно: он отвечает
   * на вопрос «что открыто», и лишние поля в нём платились бы на каждой
   * странице книги. Здесь же путь редкий — так ходят только те, кому
   * действительно что-то выдали, — и один запрос по индексу дешевле,
   * чем таскать эти поля везде.
   */
  const grantForBanner = partial
    ? await payload
        .find({
          collection: 'access-grants',
          where: {
            and: [
              { grantee: { equals: userOrgId } },
              { owner: { equals: ownerId } },
              { revokedAt: { exists: false } },
              { or: [{ animal: { equals: animal.id } }, { animal: { exists: false } }] },
            ],
          },
          sort: '-createdAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        .then((r) => r.docs[0] ?? null)
        .catch(() => null)
    : null

  /*
   * Просмотр записывается после отдачи страницы.
   *
   * `after()` выполняет это, когда ответ уже ушёл: запись в журнал не должна
   * стоить посетителю миллисекунд на горячем пути (карточка — 0,10 с),
   * а сбой записи не должен ронять страницу. Тот же принцип, что у отметки
   * «ленту посмотрели».
   *
   * Кого не считаем — решает `recordAnimalView`: себя, анонимов
   * и Ассоциацию. Здесь это не повторяется, чтобы правило жило в одном месте.
   */
  after(async () => {
    await recordAnimalView(payload, {
      animalId: animal!.id as number,
      ownerId: ownerId as number | null,
      viewerOrgId: userOrgId as number | null,
      viewerUserId: user?.id ?? null,
      grantId: partial ? relId(grantForBanner) : null,
      scopes: [...grantedScopes],
      isAssociation: isAssociation(user),
    })
  })

  /*
   * Счётчик уникальных просмотров — только тому, чьи это данные,
   * и Ассоциации.
   *
   * Число отвечает на вопрос «сколько хозяйств интересовалось моим быком»,
   * и это сведение для владельца. Показывать его всем — значит сообщать
   * соседу, чем интересуются в чужом стаде; ни одна сторона об этом
   * не просила.
   */
  const views = isMine || isAssociation(user) ? await uniqueViews(payload, animal.id as number) : null

  /*
   * Что уйдёт вместе с карточкой и что не даст ей уйти.
   *
   * Считается только владельцу и только на вкладке общих данных — там,
   * где стоит сама кнопка. Пять счётчиков и три запроса заслона на каждом
   * открытии чужой карточки были бы платой ни за что: цифры нужны ровно
   * в момент, когда человек смотрит на кнопку «в архив».
   */
  const archiveFacts =
    isMine && tab === 'general'
      ? await (async () => {
          const { removalBlockers } = await import('@/lib/archive-retention')
          const [calvings, milk, inseminations, health, evaluations, blockers] = await Promise.all([
            payload.count({ collection: 'calvings', where: { animal: { equals: animal.id } }, overrideAccess: true }),
            payload.count({ collection: 'milk-tests', where: { animal: { equals: animal.id } }, overrideAccess: true }),
            payload.count({ collection: 'inseminations', where: { animal: { equals: animal.id } }, overrideAccess: true }),
            payload.count({ collection: 'health-events', where: { animal: { equals: animal.id } }, overrideAccess: true }),
            payload.count({ collection: 'animal-evaluations', where: { animal: { equals: animal.id } }, overrideAccess: true }),
            removalBlockers(payload, animal.id as number),
          ])
          return {
            dependents:
              calvings.totalDocs +
              milk.totalDocs +
              inseminations.totalDocs +
              health.totalDocs +
              evaluations.totalDocs,
            blockers: blockers.map((b) => b.text),
          }
        })()
      : null

  const crumbs = isMine
    ? [
        { label: 'Личный кабинет', href: '/account' },
        { label: 'Стадо', href: '/account?tab=herd' },
        { label: animal.name ?? String(animal.identNumber) },
      ]
    : [
        { label: 'Племенная книга', href: '/' },
        { label: animal.name ?? String(animal.identNumber) },
      ]

  return (
    <>
      <SiteHeader active={isMine ? '/account' : '/'} />

      <main className={`container-page pb-8 ${isForeign ? 'foreign-animal' : ''}`}>
        {/*
           Своя карточка — это страница кабинета, и оба ряда над ней стоят
           полностью: раздел и подраздел. Раньше стоял только раздел,
           и получалось, что на карточке навигация обрывается на полпути —
           ровно та болезнь, от которой в `DataNav` завели постоянный ряд.

           В шапке при этом подсвечивается «Моё хозяйство», а не «Племенная
           книга»: своя корова — это своё стадо, а не общая книга, хотя адрес
           у карточки один на обе.
        */}
        {isMine && (
          <>
            <AccountNav active="herd" />
            <HerdNav active="list" />
          </>
        )}

        {isForeign && (
          <p className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-[15px] text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
            <span className="rounded-md bg-forest-500 px-2 py-0.5 text-[13px] font-medium text-white">
              {foreignNote.badge}
            </span>
            {foreignNote.text}
          </p>
        )}

        {partial && (
          <GrantBanner
            ownerName={owner}
            scopes={[...grantedScopes]}
            expiresAt={grantForBanner?.expiresAt ?? null}
            wholeHerd={!grantForBanner?.animal}
          />
        )}

        {/*
            Архивная карточка обязана сказать это первой строкой.

            Из книги она пропадает, но по прямой ссылке открывается —
            из закладки, из письма, из чужой родословной. Без плашки она
            выглядит обычной записью, и человек будет читать удой коровы,
            которой через две недели не станет.

            Плашка видна всем, кому карточка вообще доступна, а не только
            владельцу: тот, кто пришёл по ссылке, и есть тот, кого надо
            предупредить.
        */}
        {animal.archived && (
          <p className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-[15px] text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
            <span className="rounded-md bg-[#8a6d3b] px-2 py-0.5 text-[13px] font-medium text-white">
              В архиве
            </span>
            {animal.archivedAt
              ? `Запись убрана из книги ${dateRu(animal.archivedAt)}. ` +
                `Через ${ARCHIVE_RETENTION_DAYS} дней после этого карточка удаляется, ` +
                'а в реестре удалённых записей остаётся строка о ней.'
              : 'Запись убрана из книги.'}
          </p>
        )}

        <div>
          <div className="min-w-0">
        <Breadcrumbs items={crumbs} />

        {/* ------------------------------ Шапка ------------------------------ */}
        <section
          className={`flex flex-wrap items-start justify-between gap-x-10 gap-y-6 ${headerTone}`}
        >
          <div className="min-w-0">
            <div className="min-w-0">
              <p
                className={`text-[12px] uppercase tracking-[0.09em] ${
                  onDark ? 'text-white/70' : 'text-ink-500'
                }`}
              >
                Кличка
              </p>

              <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-[30px] font-medium leading-[1.08] sm:text-[36px]">
                <span className="break-words">{animal.name ?? '—'}</span>
                <span
                  className={`rounded-md px-2.5 py-1 text-[13px] font-normal leading-none ${
                    onDark ? 'bg-white/20 text-white' : 'bg-[#eeeeee] text-ink-700'
                  }`}
                >
                  {labelOf(AGE_GROUPS, animal.ageGroup)}
                </span>
              </h1>

              <p className="mt-3 text-[17px] leading-none">
                <span className={onDark ? 'text-white/70' : 'text-ink-500'}>Инд. №</span>{' '}
                <span className="font-medium tabular-nums">{animal.identNumber}</span>
              </p>

              <p
                className={`mt-2 text-[15px] leading-snug ${
                  onDark ? 'text-white/90' : 'text-ink-700'
                }`}
              >
                <span className={onDark ? 'text-white/70' : 'text-ink-500'}>Владелец:</span>{' '}
                {/* Ссылка ведёт в книгу с отбором по этому хозяйству —
                    «а что ещё у них есть» самый частый следующий вопрос */}
                {owner === '—' ? (
                  owner
                ) : (
                  <Link
                    href={`/?owner=${encodeURIComponent(owner)}#results`}
                    className={`underline underline-offset-4 ${
                      onDark ? 'hover:text-white' : 'hover:text-forest-500'
                    }`}
                    title={`Показать животных хозяйства «${owner}»`}
                  >
                    {owner}
                  </Link>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2.5 lg:items-end">
            <p className={`text-[13px] ${onDark ? 'text-white/70' : 'text-ink-500'}`}>
              Обновлено {dateRu(animal.updatedAt)}
            </p>

            {/*
                Счётчик просмотров — здесь же, под датой обновления.

                Сначала он был первой строкой страницы, выше хлебных крошек
                и клички: открывая свою корову, человек получал отчёт
                о посещаемости раньше самой коровы. Потом уехал под шапку —
                и оказался ничьим: висел отдельной строкой над вкладками,
                на полосе, где больше ничего нет, и читался как заголовок
                следующего раздела.

                Место ему рядом с «Обновлено»: обе строки — служебные
                сведения о карточке, а не о животном, и стоять им вместе.

                Счётчик виден только владельцу и Ассоциации. Ноль показан
                словами: «0 хозяйств» читается как поломка, «пока никто» —
                как ответ на вопрос.
            */}
            {views !== null && (
              <p
                className={`max-w-[36ch] text-[13px] leading-snug lg:text-right ${
                  onDark ? 'text-white/70' : 'text-ink-500'
                }`}
              >
                {views === 0
                  ? 'Эту карточку пока не открывало ни одно хозяйство'
                  : `Карточку смотрели ${views} ${
                      views % 10 === 1 && views % 100 !== 11
                        ? 'хозяйство'
                        : [2, 3, 4].includes(views % 10) && ![12, 13, 14].includes(views % 100)
                          ? 'хозяйства'
                          : 'хозяйств'
                    } — считаются вошедшие, кроме вашего и Ассоциации`}
              </p>
            )}

            {/*
               Знака публичности здесь нет намеренно.
               
               Первая редакция ставила его рядом с достоверностью — и тем
               нарушала правило, ради которого полоса и заводилась: шапку
               видят все, и меняться в зависимости от смотрящего она
               не должна. Вдобавок состояние оказывалось написано дважды
               в одном экране, в двух сантиметрах друг от друга.
               
               Состояние теперь живёт там же, где управление: в полосе
               владельца над меню разделов. Чужому по-прежнему отвечает
               плашка «Доступ закрыт владельцем» — она о другом, о том,
               почему он не видит подробностей.
            */}
            <TrustBadge level={animal.trustLevel} onDark={onDark} />
          </div>

          {/*
             Третья колонка шапки — управление своей записью.

             Шапка отвечает на три вопроса подряд: кто это животное,
             что известно о записи, что я могу с ней сделать. Первые два
             видны всем, третий только владельцу — и это не нарушение
             единого каркаса, а его продолжение: колонка либо есть, либо
             её нет, а две первые не съезжают. Разбор — `RecordPanel`.
          */}
          {isMine && (
            <RecordPanel
              animalId={animal.id as number}
              publicVisible={Boolean(animal.publicVisible)}
              publicDetails={Boolean(animal.publicDetails)}
              archived={Boolean(animal.archived)}
              open={manage}
              onDark={onDark}
            />
          )}
        </section>


        {/*
           Управление записью раскрывается здесь: полной шириной, между
           шапкой и меню разделов, и только когда его позвали адресом.
           Формы длинные — переключатели с пояснениями, причина архивации,
           список зависимых записей, — и в узкой колонке им не поместиться.
           Постоянного места они при этом не занимают: закрытая карточка
           выглядит ровно так же, как у чужого.
        */}
        {isMine && manage && (
          <section className="card mt-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <h2 className="panel-heading !mb-0">
                {manage === 'visibility'
                  ? 'Видимость записи в книге'
                  : animal.archived
                    ? 'Возврат записи из архива'
                    : 'Убрать запись из книги'}
              </h2>
              <Link
                href={`/animals/${id}`}
                scroll={false}
                className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
              >
                закрыть
              </Link>
            </div>

            {manage === 'visibility' ? (
              <VisibilityForm
                animalId={animal.id as number}
                publicVisible={Boolean(animal.publicVisible)}
                publicDetails={Boolean(animal.publicDetails)}
              />
            ) : (
              archiveFacts && (
                <ArchiveBlock
                  animalId={animal.id as number}
                  archived={Boolean(animal.archived)}
                  archivedAt={animal.archivedAt ? String(animal.archivedAt) : null}
                  archiveReason={animal.archiveReason ?? null}
                  dependents={archiveFacts.dependents}
                  blockers={archiveFacts.blockers}
                />
              )
            )}
          </section>
        )}

        {/* ------------------------------ Вкладки ---------------------------- */}
        <p className="mb-3 mt-8 text-[12px] uppercase tracking-[0.09em] text-ink-500">
          Разделы карточки
        </p>
        <nav aria-label="Разделы карточки животного" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/animals/${id}?tab=${t.key}`}
              className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* ------------------------------ Оценка ----------------------------- */}
        {/* Закрытая область показывает плашку, а не прочерки: прочерк читается
            как «данных нет», и человек уходит искать животное в другом месте */}
        {tab === 'evaluation' && !maySee('evaluation') && (
          <ScopeLocked scope="evaluation" ownerName={owner} canAsk={Boolean(user)} />
        )}
        {tab === 'events' && !maySee('production') && (
          <ScopeLocked scope="production" ownerName={owner} canAsk={Boolean(user)} />
        )}
        {tab === 'origin' && !maySee('origin') && (
          <ScopeLocked scope="origin" ownerName={owner} canAsk={Boolean(user)} />
        )}
        {tab === 'documents' && !maySee('documents') && (
          <ScopeLocked scope="documents" ownerName={owner} canAsk={Boolean(user)} />
        )}

        {/*
           Инбридинг и возраст первого отёла — одной строкой, а не плашками.
           Каждое число — один факт со ссылкой туда, где он разбирается;
           плашка в четверть ширины под такой факт это место, потраченное
           не на сведения.
        */}
        {tab === 'evaluation' && maySee('evaluation') && (
          <>
            {indexBlock && (
              <section className="mt-8">
                <IndexBreakdown
                  result={indexBlock.result}
                  percentile={indexBlock.percentile}
                  href={isMine ? '/account/indices' : undefined}
                  evidence={evidence}
                  facts={ownFacts}
                />
              </section>
            )}

            {/*
               «На чём стоит оценка» переехало внутрь панели индекса.

               Стояло соседней карточкой со своим заголовком, своей рамкой
               и тремя плашками под три однозначных числа. Предмет у них
               один — сколько стоит индекс и на чём он держится, — а два
               заголовка об одном читаются как два разных разговора.
               Разбор и сама строка основания — в `IndexBreakdown`.

               Здесь остался только случай, когда панели индекса нет вовсе:
               профиль не выбран или расчёт не построен. Основание при этом
               показать всё равно нужно — оно про животное, а не про индекс.
            */}
            {evidence && !indexBlock && (
              <section className="card mt-8">
                <h2 className="panel-heading mb-0">На чём стоит оценка</h2>
                <p className="mt-2 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                  Индекс по этому животному не построен, но основание для надёжности
                  видно и без него: {nf(evidence.lactations, 0)}{' '}
                  {plural(evidence.lactations, 'отёл', 'отёла', 'отёлов')},{' '}
                  {nf(evidence.milkTests, 0)}{' '}
                  {plural(
                    evidence.milkTests,
                    'контрольная дойка',
                    'контрольные дойки',
                    'контрольных доек',
                  )}
                  ,{' '}
                  {evidence.hasSire && evidence.hasDam
                    ? 'оба родителя в книге'
                    : evidence.hasSire
                      ? 'в книге только отец'
                      : evidence.hasDam
                        ? 'в книге только мать'
                        : 'родителей в книге нет'}
                  .
                </p>
              </section>
            )}

            {/*
               Инбридинг и возраст первого отёла переехали в подвал панели
               индекса. Стояли они двумя плашками между панелью и следующим
               блоком — ничьи: к индексу формально не относятся, а читаются
               вместе с ним. Высокий индекс при F = 12 % означает не то же,
               что при нуле, и решение о подборе принимают по обоим числам
               сразу.

               Здесь остался только случай без панели: индекс не построен,
               а числа всё равно есть и нужны.
            */}
            {!indexBlock && ownFacts && (
              <section className="card mt-8 flex flex-wrap gap-x-10 gap-y-3">{ownFacts}</section>
            )}

            {/*
               Статус оценки прижат к индексу, а не спрятан в блоке ниже.

               Это первый блок макета — «индекс и статус», — и порядок
               в нём такой: сначала число, сразу за ним ответ на вопрос,
               можно ли этому числу верить. Разъединять их нельзя: оценка
               на десяти дочерях выглядит так же уверенно, как на трёхстах,
               и разницу видит только тот, кто помнит формулу надёжности.

               Пороги выведены из формулы, а не назначены: разбор
               в `src/lib/bull-status.ts` и в `docs/karta-byka.md`.
            */}
            {proof && proof.daughters > 0 && (
              <section className="mt-6">
                <BullStatusNote daughters={proof.daughters} herds={proof.farms} />
              </section>
            )}

            {/*
               Оценка по дочерям стоит выше «Данных из документов»,
               рядом с расчётным индексом, — потому что это тоже наш расчёт
               по книге, а не привезённое число. И выше собственной
               продуктивности её ставить не нужно: у быка её просто нет.
            */}
            {proof && (
              <section className="mt-8">
                <BullProofBlock data={proof} bullId={animal.id} />
              </section>
            )}

            {/*
               Граница между расчётом и первоисточником проведена явно.
               Выше — то, что система посчитала сама и умеет разложить
               на слагаемые. Ниже — то, что пришло извне: из документов,
               выгрузок и протоколов оценки. Смешивать их в один поток
               карточек значило бы уравнять «мы посчитали» и «нам прислали».
            */}
            {/*
               История оценок стоит между расчётом и документами намеренно.
               Она про то же число, что и блок выше, но во времени: сегодняшняя
               оценка без ряда предыдущих не даёт понять, устоялась она
               или ещё ползёт. Блок сам себя прячет, когда истории нет.
            */}
            <section className="mt-8">
              <EvaluationHistory animalId={animal.id} />
            </section>

            <h2 className="section-title mt-10">Данные из документов</h2>
            {/*
               Пояснение про дочерей стоит здесь, над всеми блоками сразу,
               а не в каждом заголовке.
               
               Карточка уже объясняла это про удой — там, где и так
               очевидно, что доить быка нечем, — и молчала про экстерьер
               и здоровье, где непонятно. У быка своих измерений нет
               ни одного: всё, что ниже, — прогноз того, какими будут
               дочери. Единственное, что бывает собственным, —
               оплодотворяющая способность семени, и её в книге пока нет.
            */}
            <p className="-mt-2 mb-6 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              {isBull ? (
                <>
                  Все числа ниже — <b>прогноз по дочерям</b>, а не измерения самого быка:
                  ни удоя, ни вымени, ни лактаций у него не бывает. Оценки привезены вместе
                  с животным, индекс выше считается из них.
                </>
              ) : (
                <>
                  Оценки по признакам, экстерьер и лактации привезены вместе с животным. Индекс
                  выше считается из них.
                </>
              )}
            </p>

            {hasWeakReliability && <WeakNote />}

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                {/*
                   Заголовок называет источник, если он известен.

                   «Оценка расчётного центра» без имени — это вопрос,
                   а не подпись: индекс TPI из американского каталога
                   и индекс областного центра разные величины, и читать
                   их надо по-разному. Пока источник не заполнен, честнее
                   сказать «источник не указан», чем оставить безымянность
                   незамеченной: незаполненное поле, о котором молчат,
                   не заполняют никогда.
                */}
                <Collapsible
                  title={
                    animal.ipcDetails?.center
                      ? `Оценка: ${animal.ipcDetails.center}`
                      : 'Оценка расчётного центра'
                  }
                  note={
                    [
                      animal.ipcDetails?.base
                        ? `База сравнения: ${animal.ipcDetails.base}`
                        : null,
                      animal.evaluationDate ? `оценка от ${dateRu(animal.evaluationDate)}` : null,
                      !animal.ipcDetails?.center && !animal.ipcDetails?.base
                        ? 'Источник не указан — без него сравнивать эту оценку с расчётом книги не с чем'
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') ||
                    'Привезена вместе с данными о животном'
                  }
                  defaultOpen
                >
                  <table className="metric-table">
                    <thead>
                      <tr>
                        <th>Индекс</th>
                        <th className="text-right">Прогноз</th>
                        <th className="text-right">R, %</th>
                        <th className="text-right">Процентиль</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>ИПЦ</td>
                        <td className="text-right tabular-nums">
                          {signed(animal.ipcDetails?.forecast ?? animal.ipc)}
                        </td>
                        <td className="text-right tabular-nums">{nf(animal.ipcDetails?.r, 1)}</td>
                        <td className="text-right tabular-nums">
                          {nf(animal.ipcDetails?.percentile, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Collapsible>

                <Collapsible
                  title={isBull ? 'Продуктивность дочерей' : 'Продуктивные признаки'}
                  aside={
                    hasGroupValues(animal.production, PRODUCTION_TRAITS) ? (
                      <ReliabilityNote value={animal.production?.reliabilityLevel} />
                    ) : undefined
                  }
                  defaultOpen
                >
                  <MetricTable
                    head={['Селекционный признак', 'Прогноз', 'R, %']}
                    rows={PRODUCTION_TRAITS.map((t) => {
                      const v = (animal!.production as Record<string, { forecast?: number | null; r?: number | null }> | undefined)?.[t.key]
                      return {
                        label: t.label,
                        unit: t.unit,
                        forecast: v?.forecast,
                        r: v?.r,
                        digits: t.unit === 'кг' || t.unit === '' ? 1 : 2,
                      }
                    })}
                  />
                </Collapsible>

                {/*
                   Здоровье и долголетие идут сразу за продуктивностью,
                   а отёлы вынесены в самый низ группы — так же, как
                   в каталогах CDCB и Lactanet.

                   Порядок отвечает вопросам покупателя семени в том
                   порядке, в каком тот их задаёт: сколько даст молока,
                   сколько проживёт, придёт ли в охоту, оплодотворит ли
                   семя, легко ли отелится. Прежний порядок был порядком
                   полей в коллекции — то есть историей того, как их
                   заводили, а не смыслом.
                */}
                <Collapsible
                  title={isBull ? 'Здоровье и долголетие дочерей' : 'Здоровье и долголетие'}
                  aside={
                    hasGroupValues(animal.health, LONGEVITY_TRAITS) ? (
                      <ReliabilityNote value={animal.health?.reliabilityLevel} />
                    ) : undefined
                  }
                  defaultOpen
                >
                  <MetricTable
                    head={['Индексы', 'Прогноз', 'R, %']}
                    rows={LONGEVITY_TRAITS.map((t) => {
                      const v = (animal!.health as Record<string, { forecast?: number | null; r?: number | null }> | undefined)?.[t.key]
                      return { label: t.label, unit: t.unit, forecast: v?.forecast, r: v?.r, digits: 1 }
                    })}
                  />
                </Collapsible>

                {/*
                   У быка две разные фертильности, и они не связаны:
                   собственная оплодотворяющая способность семени
                   и способность дочерей приходить в охоту. В книге пока
                   есть только вторая, поэтому она и названа — а первой
                   лучше не быть вовсе, чем стоять пустой строкой,
                   которую примут за неё.
                */}
                <Collapsible
                  title={isBull ? 'Воспроизводство дочерей' : 'Воспроизводительные качества'}
                  defaultOpen
                >
                  <MetricTable
                    head={['Индексы', 'Прогноз', 'R, %']}
                    rows={[
                      {
                        label: 'Фертильность',
                        unit: 'балл',
                        forecast: animal.reproduction?.fertility?.forecast,
                        r: animal.reproduction?.fertility?.r,
                        digits: 1,
                      },
                    ]}
                  />
                </Collapsible>

                {/*
                   Семя стоит отдельным блоком между дочерними,
                   и это разделение физическое, а не подписью.
                   
                   Всё выше и ниже — прогноз по дочерям; здесь —
                   единственное измерение самого быка. Строкой в общем
                   списке «Воспроизводительных качеств» оно соседствовало бы
                   с фертильностью дочерей, а эти две величины и так путают:
                   первая отвечает «оплодотворит ли его семя», вторая —
                   «будут ли дочери приходить в охоту».
                   
                   У коровы блока нет вовсе, а не пустой: семени у неё
                   не бывает.
                */}
                {isBull && animal.semen?.conception?.forecast !== null &&
                  animal.semen?.conception?.forecast !== undefined && (
                    <Collapsible title="Семя — собственный признак быка" defaultOpen>
                      <MetricTable
                        head={['Показатель', 'Значение', 'R, %']}
                        rows={[
                          {
                            label: 'Оплодотворяющая способность',
                            unit: 'п.п.',
                            forecast: animal.semen.conception.forecast,
                            r: animal.semen.conception.r,
                          },
                          {
                            /*
                               Число осеменений — не оценка, и достоверности
                               у него нет: это объём выборки, на котором
                               посчитана строка выше. Пустое место в колонке
                               R честнее прочерка — прочерк читался бы как
                               «достоверность неизвестна».
                            */
                            label: 'Осеменений в расчёте',
                            forecast: animal.semen.inseminations,
                            digits: 0,
                          },
                        ]}
                      />
                      <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
                        Отклонение стельности от среднего по породе: +2 означает, что в стаде
                        со средней стельностью 30 % это семя даёт 32 %. Единственное число
                        в карточке, измеренное у самого быка, — всё остальное прогноз
                        по дочерям.
                      </p>
                    </Collapsible>
                  )}

                {/*
                   Отёлы вынесены из «Здоровья» в свою группу.

                   Лёгкость отёла и смертность приплода лежат в тех же
                   полях коллекции, что и здоровье вымени, — но отвечают
                   на другой вопрос: не «как дочь проживёт лактацию»,
                   а «переживёт ли она отёл и выживет ли телёнок».
                   Так их и разделяют CDCB, Lactanet и европейцы,
                   и покупатель спрашивает про отёлы отдельно, обычно
                   раньше вопроса о долголетии.

                   Чего мы за ними не повторяем — разделения лёгкости
                   отёла на «как отец» и «как дед по матери». Различать
                   их правильно: это два разных числа, легко ли телятся
                   осеменённые им коровы и легко ли телятся его дочери.
                   Но данных у нас нет ни под одно, ни под другое
                   в отдельности, и две колонки из одного числа были бы
                   не точностью, а её изображением.
                */}
                <Collapsible
                  title={isBull ? 'Отёлы у дочерей' : 'Отёлы'}
                  note="Лёгкость отёла и судьба телёнка — отдельная группа, а не часть здоровья"
                  defaultOpen
                >
                  <MetricTable
                    head={['Индексы', 'Прогноз', 'R, %']}
                    rows={CALVING_TRAITS.map((t) => {
                      const v = (animal!.health as Record<string, { forecast?: number | null; r?: number | null }> | undefined)?.[t.key]
                      return { label: t.label, unit: t.unit, forecast: v?.forecast, r: v?.r, digits: 1 }
                    })}
                  />

                  {/*
                     Разделение по роли быка показывается, только когда оно
                     в данных есть.

                     Пустые строки «как отец» и «как дед» на карточке быка,
                     о котором так не считали, читались бы как потеря данных
                     — а это не потеря: у отечественных оценок разделения нет
                     вовсе. Появится выгрузка с двумя столбцами — появятся
                     и строки, ничего доделывать не придётся.
                  */}
                  {hasCalvingRoles && (
                    <>
                      <p className="mt-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                        Ниже то же самое в разрезе роли быка. Он участвует в отёле дважды:
                        когда им осеменяют корову — от него зависит телёнок; когда телится
                        его дочь — от него зависит она сама. Числа не обязаны совпадать.
                      </p>
                      <div className="mt-3">
                        <MetricTable
                          head={['Роль быка', 'Прогноз', 'R, %']}
                          rows={CALVING_ROLE_TRAITS.map((t) => {
                            const v = (
                              animal!.calvingRoles as
                                | Record<string, { forecast?: number | null; r?: number | null }>
                                | undefined
                            )?.[t.key]
                            return {
                              label: t.label,
                              unit: t.unit,
                              forecast: v?.forecast,
                              r: v?.r,
                              digits: 1,
                            }
                          })}
                        />
                      </div>
                    </>
                  )}
                </Collapsible>
              </div>

              {/*
                 У быка это не его экстерьер, а прогноз по дочерям —
                 и заголовок обязан говорить именно это. Показывать быку
                 линейные признаки правильно, так делают CDCB, Lactanet
                 и Holstein USA; ошибкой была подпись, из которой
                 выходило, что у быка есть глубина вымени.
              */}
              {/*
                 Собственный промер — отдельным блоком и выше передачи
                 потомству.

                 Это два разных измерения, а не два взгляда на одно.
                 Балл — что бонитёр увидел у этой коровы; отклонение —
                 что она передаёт дочерям. Раньше они лежали в одном
                 месте и показывались одной таблицей, так что приезд
                 бонитёра переписывал оценку по потомству, и заметить
                 это было нельзя: числа выглядели одинаково.

                 Выше — потому что это факт, а ниже вывод. У быка блока
                 нет вовсе: его никто не осматривал по вымени, и пустая
                 таблица здесь означала бы недостачу данных вместо
                 свойства животного.
              */}
              {hasLinearScore && (
                <Collapsible
                  title="Линейная оценка"
                  note={
                    (animal.linearScore?.assessedAt
                      ? `Осмотр от ${dateRu(animal.linearScore.assessedAt)}. `
                      : '') +
                    'Собственный промер животного по девятибалльной шкале: пятёрка — среднее по породе'
                  }
                  defaultOpen
                >
                  <LinearScoreChart
                    traits={EXTERIOR_TRAITS.map((t) => ({
                      key: t.key,
                      label: t.label,
                      value: linearRaw[t.key],
                      trait: t,
                    }))}
                  />
                </Collapsible>
              )}

              {hasExteriorPta && (
              <Collapsible
                title={isBull ? 'Экстерьер дочерей' : 'Экстерьер: передача потомству'}
                note={
                  isBull
                    ? 'Восемнадцать линейных признаков и три композита — прогноз того, какими будут дочери'
                    : 'Не промер этой коровы, а то, что она передаёт дочерям: отклонение от среднего по породе'
                }
                defaultOpen
              >
                <ExteriorChart
                  traits={EXTERIOR_TRAITS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    value: exteriorRaw[t.key],
                    trait: t,
                  }))}
                  composites={EXTERIOR_COMPOSITES.map((t) => ({
                    key: t.key,
                    label: t.label,
                    value: exteriorRaw[t.key],
                  }))}
                />
              </Collapsible>
              )}
            </section>

            {/* ----------------------------- Фенотип ---------------------------- */}
            {/*
               Быку таблица лактаций не показывается вовсе, а не показывается
               пустой. Прочерки в одиннадцати колонках читаются как «данных
               не завезли» и заставляют искать, кто их не завёз, — тогда как
               лактаций у быка не бывает по устройству животного.
            */}
            {animal.sex !== 'male' && (
            <section className="mt-6">
              <Collapsible
                title="Фенотип по лактациям"
                note="Фактические показатели, а не оценки: что животное дало в каждую лактацию"
                defaultOpen
              >
                <div className="overflow-x-auto">
                  <table className="metric-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th>№ л</th>
                        <th>Дата отёла</th>
                        <th>Дата осем.</th>
                        <th>Серв-бык</th>
                        <th>ДД</th>
                        <th>У кг</th>
                        <th>У_305</th>
                        <th>Ж 305,%</th>
                        <th>Б 305,%</th>
                        <th>КСК</th>
                        <th>Запуск</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(animal.lactations ?? []).length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-ink-500">
                            Данные о лактациях отсутствуют
                          </td>
                        </tr>
                      )}
                      {(animal.lactations ?? []).map((l, i) => (
                        <tr key={l.id ?? i}>
                          <td>{l.number ?? '—'}</td>
                          <td>{dateRu(l.calvingDate)}</td>
                          <td>{dateRu(l.inseminationDate)}</td>
                          <td>{l.serviceBull ?? '—'}</td>
                          <td className="tabular-nums">{l.dd ?? '—'}</td>
                          <td className="tabular-nums">{l.milkYield ?? '—'}</td>
                          <td className="tabular-nums">{l.milk305 ?? '—'}</td>
                          <td className="tabular-nums">{nf(l.fat305, 2)}</td>
                          <td className="tabular-nums">{nf(l.protein305, 2)}</td>
                          <td className="tabular-nums">{l.scc ?? '—'}</td>
                          <td>{dateRu(l.dryOffDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Collapsible>
            </section>
            )}
          </>
        )}

        {/* --------------------------- Общие данные -------------------------- */}
        {tab === 'general' && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AnimalPassport animal={animal} />

            {/*
               Идентификация — единственный блок карточки, который правят
               руками чаще прочего: сюда переписывают со свидетельства.
               Поэтому он умеет превращаться в форму на месте, а не уводит
               на отдельную страницу правки. Владельцу видна ссылка
               «Править», остальным блок выглядит как обычная сводка.
            */}
            <AnimalEditBlock
              animalId={animal.id as number}
              title="Идентификация"
              canEdit={isMine}
              values={blockValues(animal, IDENTITY_FIELDS, editChoices)}
              note="Индивидуальный номер меняйте только если в нём ошибка: по нему животное узнают другие системы и бумажные документы."
              extras={[
                { label: 'Чип RFID', value: animal.altIds?.chipNumber || '' },
                { label: 'Номер в ГПК', value: animal.altIds?.gpkNumber || '' },
                { label: 'GUID (ФГИАС ПР)', value: animal.uuid || '' },
              ]}
            />

            <div>
              {/* Кривая лактации быку не строится по той же причине. */}
              {animal.sex !== 'male' && <LactationDynamics animal={animal} />}
              {animal.notes && (
                <p className="mt-4 text-sm leading-relaxed text-ink-700">{animal.notes}</p>
              )}
            </div>

            <div className="card lg:col-span-2">
              <h2 className="panel-heading">Генетика</h2>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                <dl className="divide-y divide-[#ededed] text-sm">
                  {[
                    ['CVM', CARRIER_LABEL[animal.genetics?.cvm ?? 'unknown']],
                    ['BLAD', CARRIER_LABEL[animal.genetics?.blad ?? 'unknown']],
                    ['DUMPS', CARRIER_LABEL[animal.genetics?.dumps ?? 'unknown']],
                    ['Каппа-казеин', animal.genetics?.kappaCasein || '—'],
                    ['Бета-казеин', animal.genetics?.betaCasein || '—'],
                    ['Бета-лактоглобулин', animal.genetics?.betaLactoglobulin || '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between gap-6 py-2.5">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="text-right">{v as string}</dd>
                    </div>
                  ))}
                </dl>

                <div>
                  <h3 className="mb-2 text-[15px] font-medium text-forest-500">Гаплотипы</h3>
                  {(animal.haplotypes ?? []).length === 0 ? (
                    <p className="text-sm text-ink-500">Не определялись</p>
                  ) : (
                    <ul className="text-sm">
                      {(animal.haplotypes ?? []).map((h, i) => (
                        <li
                          key={h.id ?? i}
                          className="flex justify-between gap-6 border-b border-[#ededed] py-2 last:border-0"
                        >
                          <span>{relName(h.type)}</span>
                          <span className="text-ink-700">{CARRIER_LABEL[h.status ?? 'unknown']}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-[15px] font-medium text-forest-500">ДНК-тесты</h3>
                  {(animal.dnaTests ?? []).length === 0 ? (
                    <p className="text-sm text-ink-500">Не проводились</p>
                  ) : (
                    <ul className="text-sm">
                      {(animal.dnaTests ?? []).map((t, i) => (
                        <li key={t.id ?? i} className="border-b border-[#ededed] py-2 last:border-0">
                          <div className="flex justify-between gap-6">
                            <span>{relName(t.type)}</span>
                            <span className="text-ink-500">{dateRu(t.date)}</span>
                          </div>
                          {t.result && <p className="mt-1 text-ink-700">{t.result}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------ События ---------------------------- */}
        {tab === 'events' && maySee('production') && (
          <>
            <AnimalEventsTab animal={animal} />

            <section className="mt-8 grid grid-cols-1 gap-6">
              {isMine && (
                <AnimalEventForms
                  animalId={animal.id as number}
                  herds={eventChoices.herds ?? []}
                  disposalReasons={eventChoices.disposalReasons ?? []}
                  technicians={eventChoices.technicians ?? []}
                />
              )}
              <AnimalRevisionsPanel animalId={animal.id as number} />
            </section>
          </>
        )}

        {/* -------------------------- Происхождение -------------------------- */}
        {tab === 'origin' && maySee('origin') && (
          <>
            <AnimalOriginTab animal={animal} />

            {/*
               Блок правки стоит под родословной, а не над ней: сначала
               смотрят, что уже известно, и только потом дописывают. Отец
               и мать здесь записываются так, как стоят в свидетельстве, —
               связь с карточками этих животных устанавливается отдельно
               и по номеру, а не выбором из списка: быков в книге тысячи.
            */}
            <section className="mt-8 grid grid-cols-1 gap-6">
              <AnimalEditBlock
                animalId={animal.id as number}
                title="Происхождение по документам"
                canEdit={isMine}
                values={blockValues(animal, ORIGIN_FIELDS, editChoices)}
                note="Записывайте так, как стоит в свидетельстве. Если карточки родителей появятся в книге позже, связь установится по номеру — переписывать не придётся."
              />
            </section>
          </>
        )}

        {/* ---------------------------- Документы ---------------------------- */}
        {tab === 'documents' && maySee('documents') && (
          <>
            {readiness && (
              <CertificateSection
                animalId={animal.id}
                zootechnical={readiness.zootechnical}
                pedigree={readiness.pedigree}
              />
            )}
            <DocumentsTab animalId={animal.id} />
          </>
        )}

        {/* ---------------------------- Фото/Видео --------------------------- */}
        {tab === 'media' && (
          <section className="mt-8">
            <div className="card">
              <h2 className="panel-heading">Фото и видео</h2>
              {typeof animal.photo === 'object' && animal.photo?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={animal.photo.url}
                  alt={animal.photo.alt ?? animal.identNumber}
                  className="max-w-md rounded-xl"
                />
              ) : (
                <p className="text-sm text-ink-500">
                  Материалы не загружены. Добавить их можно в{' '}
                  <Link href="/admin" className="underline underline-offset-2">
                    административной панели
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>
        )}

        {/* Форма запроса живёт внизу страницы, а не на каждой закрытой
            вкладке: плашки на неё только ссылаются якорем. Иначе одна и та же
            форма рисовалась бы четырежды и вела бы четыре разных состояния */}
        {partial && user && (
          <div id="request" className="mt-10 scroll-mt-8">
            <AccessRequestForm animalId={animal.id as number} ownerName={owner} />
          </div>
        )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

async function DocumentsTab({ animalId }: { animalId: number | string }) {
  const payload = await getClient()
  const docs = await payload.find({
    collection: 'documents',
    where: { animal: { equals: animalId } },
    limit: 50,
    sort: '-issuedAt',
    overrideAccess: true,
  })

  return (
    <section className="mt-8">
      <div className="card overflow-x-auto">
        <h2 className="panel-heading">Документы</h2>
        <table className="metric-table min-w-[640px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Номер</th>
              <th>Название</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {docs.docs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-500">
                  Документов пока нет
                </td>
              </tr>
            )}
            {docs.docs.map((d) => (
              <tr key={d.id}>
                <td>{dateRu(d.issuedAt)}</td>
                <td>{labelOf(DOCUMENT_TYPES, d.type)}</td>
                <td>{d.number || '—'}</td>
                <td>{d.title}</td>
                <td>
                  {/*
                    Отзыв показывается хозяйству, а не только Ассоциации.
                    Отозванное свидетельство внешне ничем не отличалось
                    от действующего — а сослаться на недействующую бумагу
                    в сделке хуже, чем не иметь её вовсе.
                  */}
                  {d.revoked?.at ? (
                    <span
                      className="rounded-md bg-[#fdecea] px-2 py-0.5 text-[13px]"
                      title={d.revoked.reason ?? undefined}
                    >
                      отозван {dateRu(d.revoked.at)}
                    </span>
                  ) : (
                    <span className="text-ink-500">действует</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
