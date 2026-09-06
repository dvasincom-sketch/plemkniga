import { JOURNALLED, type JournalField } from '@/lib/animal-journal'

/**
 * Подготовка блока карточки к правке.
 *
 * Карточка — серверный компонент, форма правки — клиентский. Между ними
 * нужно передать по каждому полю две вещи: как его показать человеку
 * («Голштинская», «12.03.2023») и что положить в поле формы («7»,
 * «2023-03-12»). Считать это в браузере нельзя — там нет ни справочников
 * с названиями пород, ни раскрытых связей.
 *
 * Список полей и их вид берутся оттуда же, откуда их берёт журнал правок
 * (`JOURNALLED`). Это не экономия, а способ не разойтись: поле, которое
 * можно править, но нельзя записать в журнал, — дыра в истории, и появиться
 * она может только если списка два.
 */

export type Choice = { value: string; label: string }

/** Поля, которые разрешено править формами карточки, — те же, что журналятся */
const EDITABLE = new Set(JOURNALLED.map((f) => f.path))

/**
 * Разобранное значение одного поля: либо величина, либо отказ.
 *
 * Отдельный тип нужен ровно для того, чтобы отличить пустое поле от
 * неразобранного. Оба дают `null` в модели, а означают противоположное:
 * первое — «человек стёр значение», второе — «человек написал что-то,
 * чего мы не поняли».
 */
type Parsed = { ok: true; value: unknown } | { ok: false; reason: string }

/** Значение одного поля формы в том виде, в каком его ждёт модель */
const valueOf = (form: FormData, path: string): Parsed => {
  const raw = form.get(path)
  if (raw === null) return { ok: true, value: undefined }

  const s = String(raw).trim()
  if (s === '') return { ok: true, value: null }

  const field = JOURNALLED.find((f) => f.path === path)
  const named = field?.label ?? path

  /*
   * Неразобранное значение — отказ, а не `null`.
   *
   * Прежде каждая из трёх веток возвращала `null`, когда разбор не удался,
   * и форма отвечала «Сохранено»: человек исправлял живую массу на «450 кг»,
   * а в карточке она пропадала совсем. Хуже случая с опечаткой то, что
   * поле, которого не поняли, стирается вместе с прежним верным значением,
   * — то есть правка не проходит мимо, а уничтожает данные.
   *
   * Браузер такие значения обычно не пропускает: `type="number"` и
   * `type="date"` проверяют ввод сами. Но форму отправляют и в обход
   * браузера, и с выключенным JavaScript, и через `curl`, а серверное
   * действие обязано отвечать за то, что записывает, само.
   */
  if (field?.kind === 'number') {
    const n = Number(s.replace(',', '.'))
    if (!Number.isFinite(n)) return { ok: false, reason: `«${named}»: не число — ${s}` }
    return { ok: true, value: n }
  }
  if (field?.kind === 'relation') {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: `«${named}»: неизвестная связь` }
    return { ok: true, value: n }
  }
  if (field?.kind === 'date') {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return { ok: false, reason: `«${named}»: не дата — ${s}` }
    return { ok: true, value: d.toISOString() }
  }
  return { ok: true, value: s }
}

/** Собирает вложенный объект из путей вида `altIds.earTag` */
const nest = (flat: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.')
    let node = out
    for (const key of parts.slice(0, -1)) {
      if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
      node = node[key] as Record<string, unknown>
    }
    node[parts[parts.length - 1]!] = value
  }
  return out
}

/**
 * Что пришло из формы — с оглядкой на флажки.
 *
 * Невыключенный флажок браузер не присылает вовсе, поэтому отличить
 * «сняли галочку» от «этого поля в форме не было» по одному только FormData
 * нельзя. Форма перечисляет свои поля в скрытом `fields`, и по этому списку
 * снятый флажок превращается в `false`, а поля чужих блоков не трогаются.
 *
 * Функция чистая намеренно: это единственное место, где форма превращается
 * в данные, и проверять его надо отдельно от базы и от сессии.
 *
 * Непонятые значения возвращаются отдельным списком, а не выбрасываются
 * исключением: полей в блоке несколько, и человеку правильнее показать все
 * ошибки разом, чем по одной за отправку.
 */
export function collectFromForm(form: FormData): {
  data: Record<string, unknown>
  errors: string[]
} {
  const declared = String(form.get('fields') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => EDITABLE.has(s))

  const flat: Record<string, unknown> = {}
  const errors: string[] = []
  for (const path of declared) {
    const field = JOURNALLED.find((f) => f.path === path)
    if (field?.kind === 'checkbox') {
      flat[path] = form.get(path) !== null
      continue
    }
    const parsed = valueOf(form, path)
    if (!parsed.ok) {
      errors.push(parsed.reason)
      continue
    }
    if (parsed.value !== undefined) flat[path] = parsed.value
  }
  return { data: nest(flat), errors }
}

export type BlockValue = {
  path: string
  label: string
  kind: JournalField['kind']
  /** Значение для поля формы */
  raw: string
  /** Значение для показа */
  text: string
  /** Варианты для select — из справочника или из переданных связей */
  choices?: Choice[]
}

const at = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)

const relOf = (v: unknown): { id: string; title: string } | null => {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const id = o.id
    if (id === undefined || id === null) return null
    const title = ['identNumber', 'name', 'fullName', 'title', 'email']
      .map((k) => o[k])
      .find((x): x is string => typeof x === 'string' && x.trim() !== '')
    return { id: String(id), title: title ?? `#${id}` }
  }
  return { id: String(v), title: `#${v}` }
}

/** `2023-03-12` — то, что понимает `<input type="date">` */
const dateInput = (v: unknown): string => {
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const dateText = (v: unknown): string => {
  const d = new Date(String(v))
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Значения блока по списку путей.
 *
 * `relations` — готовые списки для связей: породы, стада, справочники.
 * Их грузит страница, и только для владельца: постороннему они ни к чему,
 * а запросов это стоит.
 */
export function blockValues(
  animal: unknown,
  paths: readonly string[],
  relations: Record<string, Choice[]> = {},
): BlockValue[] {
  const out: BlockValue[] = []

  for (const path of paths) {
    const field = JOURNALLED.find((f) => f.path === path)
    if (!field) continue

    const value = at(animal, path)

    if (field.kind === 'relation') {
      const rel = relOf(value)
      const choices = relations[path] ?? []
      /*
       * Текущее значение подставляется в список, даже если его там нет.
       * Иначе открытая форма молча меняет породу на первую попавшуюся —
       * человек ничего не выбирал, а правка записалась.
       */
      const known = rel && choices.some((c) => c.value === rel.id)
      out.push({
        path,
        label: field.label,
        kind: field.kind,
        raw: rel?.id ?? '',
        text: rel?.title ?? '',
        choices: rel && !known ? [{ value: rel.id, label: rel.title }, ...choices] : choices,
      })
      continue
    }

    if (field.kind === 'select') {
      const raw = value === null || value === undefined ? '' : String(value)
      out.push({
        path,
        label: field.label,
        kind: field.kind,
        raw,
        text: field.options?.find((o) => o.value === raw)?.label ?? '',
        choices: field.options ? [...field.options] : [],
      })
      continue
    }

    if (field.kind === 'date') {
      out.push({
        path,
        label: field.label,
        kind: field.kind,
        raw: value ? dateInput(value) : '',
        text: value ? dateText(value) : '',
      })
      continue
    }

    if (field.kind === 'checkbox') {
      out.push({
        path,
        label: field.label,
        kind: field.kind,
        raw: value ? 'on' : '',
        text: value ? 'да' : 'нет',
      })
      continue
    }

    const raw = value === null || value === undefined ? '' : String(value)
    out.push({ path, label: field.label, kind: field.kind, raw, text: raw })
  }

  return out
}
