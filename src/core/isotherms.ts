/**
 * Ізотерми — фарбування пікселів у заданих межах температури поверх палітри (docs/spec/features.md §2.5).
 * Оригінал порівнює AD із порогами `TempToAD`; порівняння по °C пікселя рівносильне з точністю до 1 AD.
 */

/** «Вище» порогу `from`, «між» `from` і `to`, «нижче» порогу `to` (межі входять). */
export type IsothermMode = 'above' | 'between' | 'below'

export interface Isotherm {
  mode: IsothermMode
  /** Нижня межа, °C (для «нижче» не використовується). */
  from: number
  /** Верхня межа, °C (для «вище» не використовується). */
  to: number
  /** Колір заливки, RGB 0…255. */
  color: readonly [number, number, number]
}

/**
 * Межі ізотерми в °C. «Вище» — без верхньої межі (оригінал обрізає її межею шкали; тут свідомо ні:
 * гарячі пікселі поза шкалою теж позначаються), «нижче» — без нижньої.
 */
export function isothermBounds(iso: Isotherm): { lo: number; hi: number } {
  switch (iso.mode) {
    case 'above':
      return { lo: iso.from, hi: Infinity }
    case 'below':
      return { lo: -Infinity, hi: iso.to }
    case 'between':
      return { lo: iso.from, hi: iso.to }
  }
}

/** Чи задано межі коректно: потрібні межі скінченні, для «між» — `from < to`. */
export function isValidIsotherm(iso: Isotherm): boolean {
  switch (iso.mode) {
    case 'above':
      return Number.isFinite(iso.from)
    case 'below':
      return Number.isFinite(iso.to)
    case 'between':
      return Number.isFinite(iso.from) && Number.isFinite(iso.to) && iso.from < iso.to
  }
}

/**
 * Пофарбувати пікселі ізотерм у RGBA-кадрі (`renderFrame`). Перша ізотерма списку — поверх наступних
 * (як ізотерма 1 оригіналу). Пікселі поза калібруванням (`NaN`) не фарбуються.
 * Повертає кількість пікселів кадру в межах кожної ізотерми (незалежно від перекриття).
 */
export function paintIsotherms(
  temps: ArrayLike<number>,
  rgba: Uint8ClampedArray,
  isotherms: readonly Isotherm[],
): number[] {
  const bounds = isotherms.map(isothermBounds)
  const counts = isotherms.map(() => 0)
  for (let i = 0, o = 0; i < temps.length; i++, o += 4) {
    const t = temps[i]!
    let hit = -1
    for (let k = bounds.length - 1; k >= 0; k--) {
      const b = bounds[k]!
      if (t >= b.lo && t <= b.hi) {
        counts[k]!++
        hit = k
      }
    }
    if (hit < 0) continue
    const c = isotherms[hit]!.color
    rgba[o] = c[0]
    rgba[o + 1] = c[1]
    rgba[o + 2] = c[2]
  }
  return counts
}
