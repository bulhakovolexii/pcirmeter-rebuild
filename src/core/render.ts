/**
 * Відображення кадру AD у кольори палітри (docs/spec/features.md §2.2).
 * Шкала задається в AD: індекс палітри = (AD − level)·255 / span, цілочисельно, з обрізкою до 0…255.
 */

import type { IrImage } from './parser'
import type { TemperatureModel } from './temperature'

/** Шкала відображення в AD: `level` — нижня межа, `span` — ширина (> 0). */
export interface DisplayScale {
  level: number
  span: number
}

/** Піксель кадру з його AD. */
export interface FramePixel {
  x: number
  y: number
  ad: number
}

/** Автоматична шкала оригіналу — `FPGA_Level` / `FPGA_Span` із заголовка. */
export function autoDisplayScale(ir: IrImage): DisplayScale {
  return { level: ir.params.fpgaLevel, span: Math.max(1, ir.params.fpgaSpan) }
}

/** Індекс палітри (0…255) для AD. */
export function paletteIndex(ad: number, scale: DisplayScale): number {
  const i = Math.trunc(((ad - scale.level) * 255) / scale.span)
  return i < 0 ? 0 : i > 255 ? 255 : i
}

/**
 * Кадр у RGBA (`width × height × 4`), рядок за рядком — готово для `ImageData`.
 * `rgb` — палітра з `palette()` (768 байтів).
 */
export function renderFrame(
  ad: Uint16Array,
  rgb: Uint8Array,
  scale: DisplayScale,
  out: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(ad.length * 4),
): Uint8ClampedArray<ArrayBuffer> {
  // Таблиця AD → індекс на весь діапазон шкали: поза ним індекс 0 або 255
  const lo = scale.level
  const hi = scale.level + scale.span
  const index = new Uint8Array(scale.span + 1)
  for (let v = 0; v <= scale.span; v++) index[v] = paletteIndex(lo + v, scale)
  for (let i = 0, o = 0; i < ad.length; i++, o += 4) {
    const v = ad[i]!
    const c = 3 * (v <= lo ? index[0]! : v >= hi ? index[scale.span]! : index[v - lo]!)
    out[o] = rgb[c]!
    out[o + 1] = rgb[c + 1]!
    out[o + 2] = rgb[c + 2]!
    out[o + 3] = 255
  }
  return out
}

/**
 * Гістограма кадру за індексом палітри (256 стовпців), як в оригіналі (`IrAdjust`): пікселі поза шкалою
 * потрапляють у крайні стовпці 0 і 255.
 */
export function paletteHistogram(ad: Uint16Array, scale: DisplayScale): Uint32Array {
  const bins = new Uint32Array(256)
  for (let i = 0; i < ad.length; i++) bins[paletteIndex(ad[i]!, scale)]!++
  return bins
}

/**
 * Найменший AD, для якого T(AD) ≥ `celsius` (обернене до `toCelsius`); поза калібруванням — крайній AD таблиці.
 * Аналог нативного `getAD` оригіналу (його округлення не відновлено — [г], різниця ≤ 1 AD).
 */
export function celsiusToAd(ir: IrImage, model: TemperatureModel, celsius: number): number {
  const nodes = ir.calibration.ad
  let lo = Math.max(0, nodes[0]! - ir.params.deltaAd)
  let hi = Math.min(0xffff, nodes[nodes.length - 1]! - ir.params.deltaAd)
  // Краї таблиці можуть давати NaN (W < 0 або T поза −60…4000) — звузити до визначеної частини
  while (lo < hi && Number.isNaN(model.toCelsius(lo))) lo++
  while (hi > lo && Number.isNaN(model.toCelsius(hi))) hi--
  if (!(model.toCelsius(lo) < celsius)) return lo
  if (model.toCelsius(hi) < celsius) return hi
  // Інваріант: T(lo) < celsius ≤ T(hi)
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (model.toCelsius(mid) < celsius) lo = mid
    else hi = mid
  }
  return hi
}

/** Ручна шкала з меж у °C, як в оригіналі: level = AD(min), span = AD(max) − AD(min). */
export function manualDisplayScale(
  ir: IrImage,
  model: TemperatureModel,
  min: number,
  max: number,
): DisplayScale {
  const level = celsiusToAd(ir, model, min)
  return { level, span: Math.max(1, celsiusToAd(ir, model, max) - level) }
}

/** Пікселі з найбільшим і найменшим AD (перші за порядком рядків). */
export function frameExtremes(ir: IrImage): { max: FramePixel; min: FramePixel } {
  const ad = ir.ad
  let iMax = 0
  let iMin = 0
  for (let i = 1; i < ad.length; i++) {
    const v = ad[i]!
    if (v > ad[iMax]!) iMax = i
    if (v < ad[iMin]!) iMin = i
  }
  const pixel = (i: number): FramePixel => ({ x: i % ir.width, y: Math.floor(i / ir.width), ad: ad[i]! })
  return { max: pixel(iMax), min: pixel(iMin) }
}
