/** Допоміжне для графіків (профіль, гістограма) — без DOM. */

/**
 * «Круглі» поділки осі в межах [min, max]: крок 1, 2 або 5 × 10ⁿ, не більше `maxCount` поділок.
 * Для порожнього чи виродженого діапазону — одна поділка.
 */
export function niceTicks(min: number, max: number, maxCount = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (max <= min) return [min]
  const raw = (max - min) / Math.max(1, maxCount)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw * (1 - 1e-9))!
  const ticks: number[] = []
  // Округлення прибирає хвости на кшталт 0,30000000000000004
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(digits)))
  }
  return ticks
}

/** Кількість знаків після коми, достатня для поділок `ticks`. */
export function tickDigits(ticks: readonly number[]): number {
  if (ticks.length < 2) return 1
  const step = Math.abs(ticks[1]! - ticks[0]!)
  return Math.min(3, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)))
}
