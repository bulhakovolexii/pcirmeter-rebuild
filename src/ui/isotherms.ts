/** Стан ізотерм у переглядачі — без DOM (ядро — src/core/isotherms.ts). */

import { isothermBounds, type Isotherm, type IsothermMode } from '../core/isotherms'

/** Ізотерма в інтерфейсі: межі — °C, колір — `#rrggbb` (значення `<input type="color">`). */
export interface IsothermState {
  enabled: boolean
  mode: IsothermMode
  from: number
  to: number
  color: string
}

export const ISOTHERM_MODES: readonly IsothermMode[] = ['above', 'between', 'below']

/** Кольори за замовчуванням, як в оригіналі: ізотерма 1 — Green, 2 — Blue. */
const DEFAULT_COLORS = ['#008000', '#0000ff'] as const

/**
 * Дві вимкнені ізотерми з межами від шкали: 1 — «вище» верхньої чверті, 2 — «нижче» нижньої
 * (оригінал ставить вузькі смуги 0,1 °C біля меж шкали — для навчання це незручно).
 */
export function defaultIsotherms(scale: { min: number; max: number }): IsothermState[] {
  const at = (q: number) => Math.round((scale.min + (scale.max - scale.min) * q) * 10) / 10
  return [
    { enabled: false, mode: 'above', from: at(0.75), to: at(1), color: DEFAULT_COLORS[0] },
    { enabled: false, mode: 'below', from: at(0), to: at(0.25), color: DEFAULT_COLORS[1] },
  ]
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [0, 0, 0]
}

export function toIsotherm(s: IsothermState): Isotherm {
  return { mode: s.mode, from: s.from, to: s.to, color: hexToRgb(s.color) }
}

/** Смуга ізотерми на шкалі [min, max] (°C) у частках 0…1; `null`, якщо не перетинається зі шкалою. */
export function isothermBand(
  s: IsothermState,
  scale: { min: number; max: number },
): { lo: number; hi: number } | null {
  const { lo, hi } = isothermBounds(toIsotherm(s))
  const span = scale.max - scale.min
  if (!(span > 0) || hi < scale.min || lo > scale.max) return null
  const clamp = (v: number) => Math.min(1, Math.max(0, (v - scale.min) / span))
  return { lo: clamp(lo), hi: clamp(hi) }
}
