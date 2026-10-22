/**
 * Перетворення сирих відліків АЦП (AD) у температуру, °C.
 * Алгоритм — docs/spec/temperature.md; еталонна реалізація для звірки — tools/irtemp.py.
 */

import { TAU_DISTANCE, TAU_GRID, TAU_H2O, VAPOR_DENSITY } from './atmosphere'
import type { IrImage, IrParams } from './parser'

const K = 273.15
/** Фіксована «температура приладу» в поправці калібрування, K. */
const T_CAL_AMBIENT = 298.15
/** Межі, поза якими оригінал вважає результат помилкою. */
const T_VALID_MIN = -60
const T_VALID_MAX = 4000

/** Параметри об'єкта й середовища, які користувач може змінювати. Температури — °C, частки — 0…1. */
export interface ObjectParams {
  emissivity: number
  /** Відстань до об'єкта, м. */
  distance: number
  airTemp: number
  humidity: number
  reflectedTemp: number
  /** Поправка, що додається до результату, °C. */
  offset: number
}

/** Параметри об'єкта із заголовка файлу з можливими змінами користувача. */
export function objectParams(params: IrParams, overrides: Partial<ObjectParams> = {}): ObjectParams {
  return {
    emissivity: params.emissivity,
    distance: params.distance,
    airTemp: params.airTemp,
    humidity: params.humidity,
    reflectedTemp: params.reflectedTemp,
    offset: params.offset,
    ...overrides,
  }
}

/** Пропускання атмосфери τ (0…1) для температури повітря, відносної вологості (0…1) і відстані (м). */
export function transmittance(airTemp: number, humidity: number, distance: number): number {
  const vapor = VAPOR_DENSITY[Math.min(Math.max(Math.trunc(airTemp + 49), 0), 98)]!
  const waterMm = (vapor * humidity * distance) / 1000
  return interpGrid(waterMm, TAU_H2O) * interpGrid(distance / 1000, TAU_DISTANCE)
}

/** Перетворювач AD → °C для конкретного кадру й набору параметрів. */
export interface TemperatureModel {
  readonly params: ObjectParams
  /** Пропускання атмосфери для `params`. */
  readonly tau: number
  /** Температура, °C; `NaN`, якщо AD поза калібруванням або результат фізично неможливий. */
  toCelsius(ad: number): number
}

export function temperatureModel(ir: IrImage, overrides: Partial<ObjectParams> = {}): TemperatureModel {
  const params = objectParams(ir.params, overrides)
  const { emissivity: e, reflectedTemp, airTemp, offset } = params
  const tau = transmittance(airTemp, params.humidity, params.distance)
  const { ad: nodesAd, temp: nodesT } = ir.calibration
  const deltaAd = ir.params.deltaAd
  const last = nodesAd.length - 1
  const adMin = nodesAd[0]!
  const adMax = nodesAd[last]!

  // Сталі доданки радіометричного рівняння
  const reflected = ((1 - e) * (reflectedTemp + K) ** 4) / e
  const atmosphere = ((1 - tau) * (airTemp + K) ** 4) / (e * tau)
  const ambient = 0.05 * T_CAL_AMBIENT ** 4

  const toCelsius = (ad: number): number => {
    const a = ad + deltaAd
    if (!(a >= adMin && a <= adMax)) return NaN

    // Перший сегмент [AD_i, AD_i+1], що містить a (як в оригіналі)
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (nodesAd[mid]! < a) lo = mid
      else hi = mid
    }
    const a0 = nodesAd[lo]!
    const t0 = nodesT[lo]!
    const tLut = t0 + ((nodesT[hi]! - t0) * (a - a0)) / (nodesAd[hi]! - a0)

    // Поправка калібрування: суміш 95 % / 5 % з фіксованою температурою приладу
    const blackbody4 = 0.95 * (tLut + K) ** 4 + ambient
    const w = blackbody4 / (e * tau) - reflected - atmosphere
    if (!(w >= 0)) return NaN
    const t = w ** 0.25 - K + offset
    return t >= T_VALID_MIN && t <= T_VALID_MAX ? t : NaN
  }

  return { params, tau, toCelsius }
}

/**
 * Температури всіх пікселів кадру, °C (`NaN` — поза калібруванням).
 * Кожне значення AD у кадрі обчислюється один раз: таблиця на діапазон [min AD, max AD] кадру.
 */
export function frameTemperatures(
  ir: IrImage,
  model: TemperatureModel,
  out = new Float32Array(ir.ad.length),
): Float32Array {
  const ad = ir.ad
  let min = 0xffff
  let max = 0
  for (let i = 0; i < ad.length; i++) {
    const v = ad[i]!
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min > max) return out

  const table = new Float32Array(max - min + 1)
  for (let v = min; v <= max; v++) table[v - min] = model.toCelsius(v)
  for (let i = 0; i < ad.length; i++) out[i] = table[ad[i]! - min]!
  return out
}

/** Межі шкали в автоматичному режимі, як в оригіналі: T(FPGA_Level) … T(FPGA_Level + FPGA_Span). */
export function autoScale(ir: IrImage, model: TemperatureModel): { min: number; max: number } {
  const { fpgaLevel, fpgaSpan } = ir.params
  return { min: model.toCelsius(fpgaLevel), max: model.toCelsius(fpgaLevel + fpgaSpan) }
}

/**
 * Діапазон вимірювань камери за полем Temp_Range. Оригінал обмежує показ точки зверху
 * значенням `max` (`AnalyzeHead_ListVer.ADToTemp`); знизу не обмежує.
 */
export function measurementRange(tempRange: number): { min: number; max: number } {
  return tempRange === 1 ? { min: 0, max: 400 } : { min: -20, max: 150 }
}

/** Лінійна інтерполяція за сіткою `TAU_GRID`; поза сіткою — крайні значення. */
function interpGrid(x: number, ys: readonly number[]): number {
  const grid = TAU_GRID
  const n = grid.length
  if (x <= 0) return ys[0]!
  if (x >= grid[n - 1]!) return ys[n - 1]!
  let i = 0
  while (x > grid[i + 1]!) i++
  const x0 = grid[i]!
  const y0 = ys[i]!
  return y0 + ((ys[i + 1]! - y0) * (x - x0)) / (grid[i + 1]! - x0)
}
