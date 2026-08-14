/**
 * Валидация идентификаторов животных.
 *
 * ТЗ, UC-01 п. 6.1.2 «Методы проверки ошибок»:
 *  - международный ID (Interbull/WHFF): код породы + код страны + цифровая часть,
 *    пример `HOLUS123456789`;
 *  - Германия: `DEHOL1234567` — 7 цифр;
 *  - РФ: национальный номер до 15 цифр;
 *  - контрольная сумма по алгоритму Luhn (ТЗ, п. 7.1.3 — для CSV-импорта).
 */

export type IdFormat = 'rf' | 'icar' | 'usa' | 'can' | 'deu' | 'internal'

type Rule = {
  pattern: RegExp
  hint: string
  /** Проверять контрольную сумму Luhn по цифровой части. */
  luhn?: boolean
}

export const ID_RULES: Record<IdFormat, Rule> = {
  // Национальный номер РФ: до 15 цифр, допускается суффикс вида «.00»
  rf: {
    pattern: /^\d{6,15}(\.\d{1,2})?$/,
    hint: 'Национальный номер РФ: от 6 до 15 цифр, допускается суффикс вида «.00»',
  },
  // Interbull / ISO-11784: код породы (3 буквы) + код страны (2–3 буквы) + 8–12 цифр
  icar: {
    pattern: /^[A-Z]{3}[A-Z]{2,3}\d{8,12}$/,
    hint: 'Формат Interbull: три буквы породы, две-три буквы страны, 8–12 цифр (HOLUS123456789)',
  },
  usa: {
    pattern: /^HO(USA|CAN|NLD|DNK)\d{7,12}$/,
    hint: 'Формат США: HOUSA + 7–12 цифр (HOUSA0012356)',
  },
  can: {
    pattern: /^HOCAN\d{7,12}$/,
    hint: 'Формат Канады: HOCAN + 7–12 цифр (HOCAN0007392)',
  },
  deu: {
    pattern: /^DEHOL\d{7}$/,
    hint: 'Формат Германии: DEHOL + ровно 7 цифр (DEHOL1234567)',
  },
  internal: {
    pattern: /^[A-Za-zА-Яа-я0-9._-]{1,32}$/,
    hint: 'Внутрихозяйственный номер: 1–32 символа без пробелов',
  },
}

/** Контрольная сумма Luhn по цифровой части идентификатора. */
export const luhnValid = (value: string): boolean => {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 2) return false

  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

export type IdCheck = { ok: true } | { ok: false; message: string }

export function validateIdentNumber(value: string, format: IdFormat = 'rf'): IdCheck {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { ok: false, message: 'Индивидуальный номер не может быть пустым' }

  const rule = ID_RULES[format] ?? ID_RULES.internal
  if (!rule.pattern.test(trimmed)) {
    return { ok: false, message: `Некорректный индивидуальный номер. ${rule.hint}` }
  }
  if (rule.luhn && !luhnValid(trimmed)) {
    return { ok: false, message: 'Не сходится контрольная сумма идентификатора (алгоритм Luhn)' }
  }
  return { ok: true }
}

/**
 * Транслитерация клички по ГОСТ 7.79-2000 (ISO-9) — для международного обмена.
 * ТЗ, UC-01 п. 6.1.2: «Найда» → «Najda».
 */
const ISO9: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'cz', ч: 'ch', ш: 'sh', щ: 'shh', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

export function transliterate(value: string): string {
  return value
    .split('')
    .map((ch) => {
      const lower = ch.toLowerCase()
      const mapped = ISO9[lower]
      if (mapped === undefined) return ch
      return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1)
    })
    .join('')
}

/** Пороги коэффициента инбридинга (ТЗ, п. 1.5 и п. 1.1.4). */
export const INBREEDING_WARNING = 6.25
export const INBREEDING_MANUAL_APPROVAL = 25

/** Минимальный возраст матери на дату первого отёла, месяцев (ТЗ, п. 1.5, шаг 5). */
export const MIN_DAM_AGE_MONTHS = 18
