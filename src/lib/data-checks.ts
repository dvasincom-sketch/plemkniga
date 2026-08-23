import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'
import { AFC_PLAUSIBLE, afcMonths, afcVerdict, monthsLabel } from '@/lib/afc'
import { analyzeAncestry } from '@/lib/ancestry'
import {
  defaultCheckSettings,
  resolveCheckSettings,
  type CheckSettingsMap,
} from '@/lib/check-settings'
import { pedigreeIssues } from '@/lib/checks-pedigree'
import { sequenceIssues } from '@/lib/checks-sequence'
import {
  BLOOD_TOLERANCE,
  GESTATION_MIN_DAYS,
  INBREEDING_CHECK_LIMIT,
  INBREEDING_TOLERANCE,
  PLAUSIBLE,
  type AnimalCheckCode,
  type CheckLimits,
  type CheckSeverity,
  type Issue,
} from '@/lib/checks-registry'

/**
 * Автоматический поиск несостыковок в данных.
 *
 * Зачем это здесь. Эксперт смотрит пакет из пятисот строк. Глазами он найдёт
 * то, что бросается в глаза, и не найдёт того, что не бросается: мать,
 * родившуюся позже дочери на два месяца; быка, записанного матерью; удой
 * в четырнадцать тысяч, который выглядит правдоподобно, пока не посмотришь
 * на число доек. Всё это находится запросом — и должно находиться запросом,
 * а не вниманием человека, которого хватит на первые сто строк.
 *
 * Что это не заменяет. Проверки не выносят решения и ничего не меняют.
 * Они говорят «посмотрите сюда». Решение остаётся за экспертом, и он вправе
 * сказать, что находка несущественна: правило написано программистом, а не
 * зоотехником, и жизнь богаче правила. Поэтому каждую находку он либо
 * записывает в замечания хозяйству одним нажатием, либо пропускает.
 *
 * Почему пороги такие. Границы правдоподобия ниже — не нормативы, а рамки,
 * за которыми начинается «этого не бывает»: удой 25 000 кг за лактацию
 * встречается у мировых рекордисток, 40 000 не встречается ни у кого.
 * Ошибку в единицах измерения (граммы вместо килограммов, дни вместо
 * месяцев) такие рамки ловят, а хорошее животное — нет.
 */

/*
 * Тип находки переехал в реестр: модули проверок (`checks-pedigree`,
 * `checks-sequence`) импортируют его оттуда, и круга зависимостей
 * не возникает — оркестратор зовёт их, они его нет.
 */
export type { CheckSeverity, Issue }

const year = (d?: string | null): number | null => {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.getFullYear()
}

/** Дата в том виде, в каком её читает человек в тексте замечания. */
const asDate = (d?: string | null): string => {
  if (!d) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime())
    ? String(d)
    : t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const time = (d?: string | null): number | null => {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? null : t
}

const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number }).id
  return null
}

const rel = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null

/**
 * Сравнение номеров животных из разных источников.
 *
 * Номер, переписанный со свидетельства руками, и номер в базе — одно
 * и то же число, записанное по-разному: с ведущими нулями и без, через
 * пробел, строчными буквами. Сравнивать их как строки значило бы находить
 * расхождение там, где его нет, а таких находок эксперт быстро перестаёт
 * читать. Поэтому сравнивается только существенное: буквы и цифры,
 * приведённые к одному регистру.
 */
const sameIdent = (a?: string | null, b?: string | null): boolean => {
  const norm = (v?: string | null) => (v ?? '').replace(/[^0-9a-zа-я]/gi, '').toUpperCase()
  const x = norm(a)
  const y = norm(b)
  return Boolean(x) && Boolean(y) && x === y
}

/**
 * Проверки, которым хватает самой записи.
 *
 * Отделены от тех, что ходят в базу: этих много, они дешёвые, и гонять
 * ради них запросы незачем.
 */
function localIssues(a: Animal): Issue[] {
  const out: Issue[] = []
  const push = (code: AnimalCheckCode, text: string, field?: string, severity: CheckSeverity = 'fix') =>
    out.push({ code, animalId: a.id as number, ident: a.identNumber, field, severity, text })

  const born = time(a.birthDate)

  if (!a.birthDate) {
    push('no-birth-date', 'Не указана дата рождения — без неё нельзя ни рассчитать возраст, ни выпустить свидетельство', 'birthDate')
  } else if (born !== null && born > Date.now()) {
    push('birth-in-future', 'Дата рождения в будущем', 'birthDate')
  } else if (born !== null) {
    const age = (Date.now() - born) / (365.25 * 86_400_000)
    if (age > PLAUSIBLE.ageYears && a.state === 'alive') {
      push(
        'too-old-alive',
        `Возраст ${Math.floor(age)} лет, при этом животное числится в стаде — вероятно, не отмечено выбытие`,
        'state',
      )
    }
  }

  if (!a.breed) {
    push('no-breed', 'Не указана порода', 'breed', 'note')
  }

  const bp = a.bloodPercent
  if (typeof bp === 'number' && (bp < PLAUSIBLE.bloodPercent.min || bp > PLAUSIBLE.bloodPercent.max)) {
    push('blood-out-of-range', `Кровность по голштину ${bp}% вне диапазона 0…100`, 'bloodPercent')
  }

  const s = a.summary ?? {}

  const milk = s.milkYield
  if (typeof milk === 'number' && (milk < PLAUSIBLE.milkYield.min || milk > PLAUSIBLE.milkYield.max)) {
    push(
      'milk-implausible',
      `Удой ${milk.toLocaleString('ru-RU')} ${PLAUSIBLE.milkYield.unit} вне правдоподобных границ — проверьте единицы измерения`,
      'summary.milkYield',
    )
  }

  const fat = s.fatPercent
  if (typeof fat === 'number' && (fat < PLAUSIBLE.fatPercent.min || fat > PLAUSIBLE.fatPercent.max)) {
    push('fat-implausible', `Жир ${fat}% вне правдоподобных границ`, 'summary.fatPercent')
  }

  const protein = s.proteinPercent
  if (
    typeof protein === 'number' &&
    (protein < PLAUSIBLE.proteinPercent.min || protein > PLAUSIBLE.proteinPercent.max)
  ) {
    push('protein-implausible', `Белок ${protein}% вне правдоподобных границ`, 'summary.proteinPercent')
  }

  /*
   * Жир и белок в килограммах должны соответствовать удою и процентам.
   * Расхождение больше десятой доли — не округление, а разные источники
   * данных, и какой из них верен, знает только хозяйство.
   */
  if (typeof milk === 'number' && typeof fat === 'number' && typeof s.fatKg === 'number') {
    const expected = (milk * fat) / 100
    if (expected > 0 && Math.abs(expected - s.fatKg) / expected > 0.1) {
      push(
        'fat-kg-mismatch',
        `Жир ${s.fatKg} кг не сходится с удоем и процентом жира (ожидалось около ${Math.round(expected)} кг)`,
        'summary.fatKg',
        'note',
      )
    }
  }

  // Выбытие отмечено причиной, но состояние осталось «в стаде» — или наоборот
  if (a.disposalReason && a.state === 'alive') {
    push('disposal-vs-state', 'Указана причина выбытия, но животное числится в стаде', 'state')
  }
  /*
   * `a.state &&` здесь появилось после первой же ревизии на настоящих
   * данных: проверка срабатывала на половине книги.
   *
   * Причина — пустое состояние. Условие `state !== 'alive'` истинно и когда
   * животное продано, и когда о его состоянии вообще ничего не записано,
   * а текст находки утверждал «животное выбыло» — то есть сообщал факт,
   * которого в записи нет. Незаполненное поле и заполненное иначе — разные
   * вещи, и путать их особенно дорого именно здесь: находка про выбытие
   * заставляет искать причину выбытия, которого не было.
   *
   * Пустое состояние — тоже пробел, но другой, и ловить его должна
   * отдельная проверка с отдельным текстом, а не эта.
   */
  if (a.state && a.state !== 'alive' && !a.disposalReason) {
    push('state-vs-disposal', 'Животное выбыло, но причина выбытия не указана', 'disposalReason', 'note')
  }

  // Инбридинг выше 25% — запись сохраняется, но требует ручного подтверждения
  if (typeof a.inbreeding === 'number' && a.inbreeding > 25) {
    push(
      'high-inbreeding',
      `Коэффициент инбридинга ${a.inbreeding}% — требуется подтверждение происхождения`,
      'inbreeding',
    )
  }

  /*
   * ДНК-тест исключил происхождение, а родители в карточке остались.
   *
   * Единственный случай, когда система знает про родословную наверняка:
   * не «сомнительно», а лаборатория написала, что этот бык отцом быть
   * не может. Поэтому проверка не смотрит ни на кровность, ни на даты —
   * они здесь ничего не добавляют.
   *
   * Смотрим на наличие связей, а не на их содержимое: вывод теста
   * относится к паре «животное — заявленные родители», и какой именно
   * родитель не подтвердился, протокол в системе не хранит. Указать
   * на одного из двоих значило бы назвать виноватым наугад.
   *
   * Позднее «подтверждено» вывод не отменяет — это разные пробы, и
   * какая из них верна, решает эксперт, а не порядок записей. Поэтому
   * находка остаётся, пока в карточке есть «исключено».
   */
  const excluded = (a.dnaTests ?? []).some((t) => t.verdict === 'excluded')
  if (excluded && (a.father || a.mother)) {
    push(
      'dna-parentage-excluded',
      'ДНК-тест исключил происхождение, но родители в карточке остались. Свидетельство по такой записи не выпустится: либо связь с родителями неверна, либо вывод теста проставлен ошибочно',
      'father',
    )
  }

  return out
}

/**
 * Проверки, которым нужны соседние записи: родители, однофамильцы по бирке.
 *
 * Родители догружаются одним запросом на весь набор, а не по одному
 * на животное: пакет из пятисот строк дал бы тысячу запросов, и разбор
 * пакета стал бы заметно медленнее самого импорта.
 */
async function relationalIssues(
  payload: Payload,
  animals: Animal[],
  settings: CheckSettingsMap,
): Promise<{ issues: Issue[]; limits: string[]; coverage: CheckCoverage[] }> {
  const out: Issue[] = []
  const coverage: CheckCoverage[] = []
  /*
   * Оговорки о полноте разбора.
   *
   * Две проверки ниже имеют потолок: отёлы выбираются пачкой, инбридинг
   * считается не для всех. Потолок сам по себе нормален, молчание о нём —
   * нет: «замечаний не найдено» и «замечаний не искали» выглядят на экране
   * одинаково, а значат противоположное.
   */
  const limits: string[] = []
  if (!animals.length) return { issues: out, limits, coverage }

  const parentIds = new Set<number>()
  for (const a of animals) {
    const f = idOf(a.father)
    const m = idOf(a.mother)
    if (f) parentIds.add(f)
    if (m) parentIds.add(m)
  }

  const parents = new Map<number, Animal>()
  if (parentIds.size) {
    const { docs } = await payload.find({
      collection: 'animals',
      where: { id: { in: [...parentIds] } },
      limit: parentIds.size,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs) parents.set(d.id as number, d as Animal)
  }

  for (const a of animals) {
    const push = (code: AnimalCheckCode, text: string, field?: string, severity: CheckSeverity = 'fix') =>
      out.push({ code, animalId: a.id as number, ident: a.identNumber, field, severity, text })

    const born = time(a.birthDate)

    for (const [side, label, expectedSex, textKey] of [
      ['father', 'Отец', 'male', 'fatherId'],
      ['mother', 'Мать', 'female', 'motherId'],
    ] as const) {
      const pid = idOf(a[side])

      /*
       * Родословная по бумаге против связи.
       *
       * Происхождение хранится дважды: ссылкой на карточку и номером,
       * переписанным со свидетельства. Пока они совпадают, второе —
       * подстраховка на случай, когда карточки предка ещё нет. Как только
       * разошлись, одна из двух записей неверна, и книга об этом молчала:
       * связь по номеру устанавливается один раз при заведении, а потом
       * номер в тексте могли поправить, а связь — нет.
       *
       * Проверка стоит до `continue` по отсутствию связи намеренно: она
       * осмысленна и тогда, когда связь есть, и тогда, когда её нет.
       */
      const textIdent = a.pedigreeText?.[textKey]
      if (pid && textIdent) {
        const linked = parents.get(pid) ?? (rel(a[side]) as Animal | null)
        if (linked?.identNumber && !sameIdent(linked.identNumber, textIdent)) {
          push(
            'pedigree-text-mismatch',
            `${label} по документам — № ${textIdent}, а связь установлена с № ${linked.identNumber}`,
            side,
          )
        }
      }

      if (!pid) continue

      // Раскрытая связь бывает уже загружена страницей — тогда берём её
      const parent = parents.get(pid) ?? (rel(a[side]) as Animal | null)
      if (!parent || typeof parent.identNumber !== 'string') continue

      if (parent.sex && parent.sex !== expectedSex) {
        push(
          'parent-wrong-sex',
          `${label} — животное № ${parent.identNumber} — записан(а) с полом «${parent.sex === 'male' ? 'мужской' : 'женский'}»`,
          side,
        )
      }

      const parentBorn = time(parent.birthDate)
      if (born !== null && parentBorn !== null && parentBorn >= born) {
        push(
          'parent-younger',
          `${label} № ${parent.identNumber} родился(ась) ${parentBorn === born ? 'в тот же день' : 'позже потомка'} — ${year(parent.birthDate)} против ${year(a.birthDate)}`,
          side,
        )
      }

      if (pid === a.id) {
        push('self-parent', `${label} — само это животное`, side)
      }
    }

    if (!a.father && !a.mother && !a.pedigreeText?.fatherId && !a.pedigreeText?.motherId) {
      push(
        'no-parents',
        'Не указан ни один из родителей — ни ссылкой, ни по документам',
        'father',
        'note',
      )
    }

    /*
     * Кровность против родительской.
     *
     * Доля крови потомка — среднее долей родителей: она делится пополам
     * каждое поколение. Проверка требует обоих родителей с заполненной
     * кровностью, и это не придирка к полноте данных, а условие
     * осмысленности: по одному родителю ожидаемого значения нет.
     *
     * Что здесь на самом деле ловится. Ошибка в кровности самого потомка —
     * половина случаев и меньшая беда: испорчена одна запись. Вторая
     * половина — связь установлена не с тем родителем, и вот это дорого:
     * тот же неверный родитель стоит у всех его прочих потомков, и вся
     * их оценка по происхождению смещена одинаково. Расхождение
     * по кровности — единственный дешёвый признак, по которому такое
     * видно без сверки документов.
     */
    const fatherDoc = parents.get(idOf(a.father) ?? -1)
    const motherDoc = parents.get(idOf(a.mother) ?? -1)
    const own = a.bloodPercent
    const fb = fatherDoc?.bloodPercent
    const mb = motherDoc?.bloodPercent

    if (typeof own === 'number' && typeof fb === 'number' && typeof mb === 'number') {
      const expected = (fb + mb) / 2
      const gap = Math.abs(expected - own)

      if (gap > BLOOD_TOLERANCE.note) {
        push(
          'blood-vs-parents',
          `Кровность ${own} % при родительских ${fb} % и ${mb} % — ожидалось около ${Math.round(expected * 10) / 10} %` +
            (gap > BLOOD_TOLERANCE.fix
              ? '. Расхождение слишком велико для округления: проверьте, тот ли родитель связан'
              : ''),
          'bloodPercent',
          gap > BLOOD_TOLERANCE.fix ? 'fix' : 'note',
        )
      }
    }
  }

  /*
   * Отёлы — не по одному, а рядом во времени.
   *
   * Это первая группа проверок, которая смотрит на **последовательность**,
   * а не на запись. Разница существенная: каждое значение по отдельности
   * правдоподобно, невозможен только их порядок. Отёл третий раньше
   * второго, промежуток в двести дней, пропущенный номер — глазами такое
   * не видно вовсе, потому что человек читает таблицу построчно, а здесь
   * ошибка живёт между строками.
   *
   * Всё считается по одной выборке отёлов на весь набор. Поштучный обход
   * дал бы у пакета в пятьсот голов пятьсот запросов ради величин, которые
   * нужны не всегда.
   *
   * Быки пропущены: у них отёлов нет по определению.
   */
  const females = animals.filter((a) => a.sex !== 'male')

  if (females.length) {
    const byId = new Map(females.map((a) => [a.id as number, a]))

    /*
     * Потолок выборки. Больше десяти отёлов за жизнь — редкость даже
     * у долгожительниц, двенадцать на голову берётся с запасом. Если
     * потолок всё же уперся, разбор скажет об этом вслух: молча
     * недосчитать отёлы значило бы объявить данные чистыми там, где их
     * просто не досмотрели.
     */
    const calvingLimit = females.length * 12

    const calvings = await payload.find({
      collection: 'calvings',
      where: { animal: { in: [...byId.keys()] } },
      limit: calvingLimit,
      sort: 'number',
      depth: 0,
      overrideAccess: true,
    })

    if (calvings.totalDocs > calvingLimit) {
      limits.push(
        `Отёлы просмотрены не все: ${calvingLimit} записей из ${calvings.totalDocs}. ` +
          'Разбейте заявку на части, чтобы проверить порядок отёлов целиком.',
      )
    }

    type Row = { number: number | null; date: string }
    const byAnimal = new Map<number, Row[]>()

    for (const c of calvings.docs) {
      const id = idOf(c.animal)
      if (!id || !c.date) continue
      byAnimal.set(id, [
        ...(byAnimal.get(id) ?? []),
        { number: typeof c.number === 'number' ? c.number : null, date: c.date },
      ])
    }

    for (const [animalId, rowsRaw] of byAnimal) {
      const a = byId.get(animalId)
      if (!a) continue

      const push = (
        code: AnimalCheckCode,
        text: string,
        field?: string,
        severity: CheckSeverity = 'fix',
      ) => out.push({ code, animalId, ident: a.identNumber, field, severity, text })

      /* ------------------------- Первый отёл ------------------------- */

      const firsts = rowsRaw.filter((r) => r.number === 1)

      if (firsts.length > 1) {
        push(
          'duplicate-first-calving',
          `Первым отёлом помечено несколько записей (${firsts.length}) — номер отёла сквозной, первый бывает один`,
          'calvings',
        )
      } else if (firsts.length === 1 && a.birthDate) {
        /*
         * Возраст первого отёла ловит две разные ошибки, и путать их нельзя.
         *
         * Слишком рано — ошибка в дате, и другой она быть не может:
         * стельность длится около 279 дней, значит отёл раньше
         * девятнадцатого месяца потребовал бы оплодотворения до полового
         * созревания.
         *
         * Слишком поздно — чаще всего вообще не про возраст. Отёл в четыре
         * года возможен, просто дорог; а вот «первый» отёл, перед которым
         * было ещё два незаписанных, встречается на порядок чаще — так
         * выглядит хозяйство, начавшее вести учёт с середины жизни коровы.
         * Поэтому находка идёт как «на усмотрение», а текст называет обе
         * причины: эксперт по одной записи их не различит, а по стаду
         * различит сразу.
         */
        const first = firsts[0]
        const months = first ? afcMonths(a.birthDate, first.date) : null

        if (months !== null) {
          const verdict = afcVerdict(months)

          if (verdict === 'tooYoung') {
            push(
              'afc-too-young',
              months < 0
                ? 'Первый отёл записан раньше даты рождения'
                : `Возраст первого отёла ${monthsLabel(months)} — раньше ${AFC_PLAUSIBLE.min} месяцев отёл физически невозможен, ошибка в дате рождения или в дате отёла`,
              'birthDate',
            )
          } else if (verdict === 'tooOld') {
            push(
              'afc-too-old',
              `Возраст первого отёла ${monthsLabel(months)} — либо не записаны более ранние отёлы, либо ошибка в дате рождения`,
              'calvings',
              'note',
            )
          }
        }
      }

      /* ------------------------ Порядок и ряд ------------------------ */

      const numbered = rowsRaw
        .filter((r): r is { number: number; date: string } => typeof r.number === 'number')
        .sort((x, y) => x.number - y.number)

      for (let i = 1; i < numbered.length; i++) {
        const prev = numbered[i - 1]
        const cur = numbered[i]
        if (!prev || !cur) continue

        const dPrev = time(prev.date)
        const dCur = time(cur.date)
        if (dPrev === null || dCur === null) continue

        if (dCur < dPrev) {
          push(
            'calving-order',
            `Отёл № ${cur.number} (${asDate(cur.date)}) записан раньше отёла № ${prev.number} (${asDate(prev.date)})`,
            'calvings',
          )
          continue
        }

        /*
         * Промежуток короче стельности. Проверяется только на соседних
         * по номеру отёлах: между первым и третьим короткий промежуток
         * означает пропущенный второй, а это уже другая находка, и она
         * ниже.
         */
        if (cur.number === prev.number + 1) {
          const days = Math.round((dCur - dPrev) / 86_400_000)
          if (days < GESTATION_MIN_DAYS) {
            push(
              'calving-interval-short',
              `Между отёлами № ${prev.number} и № ${cur.number} — ${days} дней. Стельность длится около 279: либо ошибка в дате, либо вторая запись на самом деле аборт`,
              'calvings',
            )
          }
        }
      }

      /*
       * Пропуск в нумерации. Считается от первого известного номера,
       * а не от единицы: если учёт начали с четвёртого отёла, это
       * не пропуск, а начало наблюдения, и обвинять в нём хозяйство
       * не за что. Пропуск — дыра **внутри** имеющегося ряда.
       */
      if (numbered.length > 1) {
        const nums = numbered.map((r) => r.number)
        const firstNum = nums[0] as number
        const lastNum = nums[nums.length - 1] as number
        const missing: number[] = []

        for (let n = firstNum; n <= lastNum; n++) {
          if (!nums.includes(n)) missing.push(n)
        }

        if (missing.length) {
          push(
            'calving-number-gap',
            `В ряду отёлов не хватает ${missing.length === 1 ? 'номера' : 'номеров'} ${missing.join(', ')} — либо отёл не записан, и тогда неполны все пожизненные величины, либо неверна нумерация`,
            'calvings',
            'note',
          )
        }
      }
    }
  }

  /*
   * Инбридинг: введённое число против посчитанного по родословной.
   *
   * Самая дорогая проверка из всех: расчёт обходит девять колен
   * родословной запросами в базу, и прогнать его по всему пакету значило
   * бы заставить эксперта ждать минуты ради величины, которая заполнена
   * у меньшинства записей.
   *
   * Отсюда два ограничения. Первое: проверяются только записи, где
   * коэффициент введён руками, — там, где поле пустое, расхождению
   * взяться неоткуда. Второе: не больше `INBREEDING_CHECK_LIMIT` записей
   * за разбор, и остаток называется вслух.
   *
   * Существенность — «на усмотрение», и это не мягкость. Наш коэффициент
   * считается по той родословной, которая есть **в книге**; хозяйство
   * могло взять своё число из более полной. Расхождение поэтому не
   * обвинение, а вопрос: по какой родословной считали.
   */
  /*
   * Отключённая проверка не просто отбрасывается в конце — она не
   * запускается вовсе. Для остальных разница только в потраченных
   * микросекундах, а здесь это девять колен родословной на каждую запись:
   * посчитать и выбросить значило бы заставить эксперта ждать ради
   * результата, который никому не покажут.
   */
  const withInbreeding = settings.get('inbreeding-mismatch')?.enabled
    ? animals.filter((a) => typeof a.inbreeding === 'number' && (a.father || a.mother))
    : []

  if (withInbreeding.length) {
    coverage.push({
      code: 'inbreeding-mismatch',
      looked: Math.min(withInbreeding.length, INBREEDING_CHECK_LIMIT),
      eligible: withInbreeding.length,
    })
  }

  if (withInbreeding.length > INBREEDING_CHECK_LIMIT) {
    limits.push(
      `Инбридинг сверен у ${INBREEDING_CHECK_LIMIT} записей из ${withInbreeding.length}: ` +
        'расчёт по родословной идёт на девять колен, и полный прогон занял бы минуты.',
    )
  }

  for (const a of withInbreeding.slice(0, INBREEDING_CHECK_LIMIT)) {
    const stated = a.inbreeding as number

    const report = await analyzeAncestry(payload, a).catch(() => null)
    if (!report) continue

    const gap = Math.abs(report.coi - stated)
    if (gap <= INBREEDING_TOLERANCE) continue

    out.push({
      code: 'inbreeding-mismatch',
      animalId: a.id as number,
      ident: a.identNumber,
      field: 'inbreeding',
      severity: 'note',
      text:
        `В карточке инбридинг ${stated} %, по родословной в книге — ${Math.round(report.coi * 100) / 100} %. ` +
        'Расхождение не обязательно ошибка: наш расчёт идёт по известным нам предкам. Но стоит выяснить, по какой родословной считали.',
    })
  }

  /*
   * Дубли по номеру бирки внутри одного набора.
   *
   * Индивидуальный номер уникален на уровне базы, а ушная бирка — нет
   * и не должна быть: её меняют, теряют, перевешивают. Но два живых
   * животных с одной биркой в одном хозяйстве — почти наверняка опечатка.
   */
  const byTag = new Map<string, Animal[]>()
  for (const a of animals) {
    const tag = a.altIds?.earTag?.trim()
    if (!tag) continue
    const list = byTag.get(tag) ?? []
    list.push(a)
    byTag.set(tag, list)
  }
  for (const [tag, list] of byTag) {
    if (list.length < 2) continue
    for (const a of list) {
      out.push({
        code: 'duplicate-ear-tag',
        animalId: a.id as number,
        ident: a.identNumber,
        field: 'altIds.earTag',
        severity: 'note',
        text: `Ушная бирка ${tag} встречается у ${list.length} животных пакета`,
      })
    }
  }

  return { issues: out, limits, coverage }
}

/**
 * Результат разбора.
 *
 * Кроме находок возвращаются оговорки о полноте: какие проверки уперлись
 * в потолок и сколько записей остались непросмотренными. Без этого разбор
 * с потолком читается как разбор целиком, и «чисто» означает то ли
 * «ошибок нет», то ли «не смотрели».
 */
/**
 * Сколько записей проверка успела посмотреть, если смотрела не все.
 *
 * Появилось после ревизии на настоящих данных. `inbreeding-mismatch` дала
 * 39 находок на 300 разобранных записей — тринадцать процентов, число
 * спокойное. На самом деле она успела сверить пятьдесят записей из ста
 * шестидесяти девяти, и настоящая доля расхождений — не тринадцать
 * процентов, а семьдесят восемь. Разница между этими числами — разница
 * между «бывает» и «расчёт надо разбирать сегодня».
 *
 * Оговорка словами про потолок была и раньше. Её оказалось мало: человек
 * читает таблицу с долями, а прозу под ней — уже нет. Знаменатель обязан
 * быть числом там же, где числитель.
 */
export type CheckCoverage = {
  code: AnimalCheckCode
  /** Сколько записей проверка посмотрела. */
  looked: number
  /** Сколько записей она должна была посмотреть, будь потолок снят. */
  eligible: number
}

export type CheckResult = {
  issues: Issue[]
  limits: string[]
  /** Только для проверок с потолком; для остальных знаменатель — весь набор. */
  coverage: CheckCoverage[]
}

/**
 * Все проверки по набору записей.
 *
 * Настройки Ассоциации применяются в двух местах и по разным причинам.
 * Дорогие проверки не запускаются, если отключены, — иначе разбор платил бы
 * за результат, который выбросят. Всё остальное фильтруется после: правило
 * написано в одном месте, а решение о его судьбе принято в другом,
 * и смешивать их внутри самих проверок значило бы протащить настройку
 * в каждую ветку.
 *
 * Существенность подменяется здесь же. Настройка меняет не текст находки,
 * а её вес: тот же факт может требовать исправления в одной книге
 * и оставаться замечанием в другой, и это решение Ассоциации, а не автора
 * правила.
 */
export async function checkAnimals(
  payload: Payload,
  animals: Animal[],
  settings?: CheckSettingsMap,
): Promise<CheckResult> {
  const resolved =
    settings ?? (await resolveCheckSettings(payload).catch(() => defaultCheckSettings()))

  const local = animals.flatMap(localIssues)

  /*
   * Три источника, а не один. Дешёвые проверки идут по записи и её
   * родителям; родословная и последовательность событий живут отдельно,
   * потому что стоят на порядок дороже и лезут в базу за тем, чего
   * в разбираемом наборе нет вовсе — за предками на девять колен
   * и за потомством матерей.
   */
  const [rel, ped, seq] = await Promise.all([
    relationalIssues(payload, animals, resolved),
    pedigreeIssues(payload, animals),
    sequenceIssues(payload, animals),
  ])

  const issues = [...rel.issues, ...ped.issues, ...seq.issues]
  const limits: CheckLimits = [...rel.limits, ...ped.limits, ...seq.limits]

  const applied = [...local, ...issues].flatMap((i) => {
    const rule = resolved.get(i.code)
    if (rule && !rule.enabled) return []
    return [rule ? { ...i, severity: rule.severity } : i]
  })

  return { issues: applied, limits, coverage: rel.coverage }
}

/** Сводка для показа: сколько существенных, сколько на усмотрение. */
export const summarize = (issues: Issue[]) => ({
  total: issues.length,
  fix: issues.filter((i) => i.severity === 'fix').length,
  note: issues.filter((i) => i.severity === 'note').length,
  animals: new Set(issues.map((i) => i.animalId)).size,
})
