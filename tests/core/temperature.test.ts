import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TAU_DISTANCE, TAU_GRID, TAU_H2O, VAPOR_DENSITY } from '../../src/core/atmosphere'
import { parseThermogram, type IrImage } from '../../src/core/parser'
import {
  autoScale,
  frameTemperatures,
  measurementRange,
  temperatureModel,
  transmittance,
  type ObjectParams,
} from '../../src/core/temperature'

// Фікстури — tools/export_temperature_fixtures.py (еталонна реалізація tools/irtemp.py).
const root = join(import.meta.dirname, '..', '..')
const fixtureDir = join(root, 'tests', 'fixtures', 'temperature')
const fixtures = readdirSync(fixtureDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(fixtureDir, f), 'utf8')))

/** Збіг з irtemp.py (float64 в обох; запас — на округлення фікстур до 1e-6). */
const TOL = 0.01
/** Межі автошкали проти Max_Temp/Min_Temp, які записала камера (крок 0,1 °C; найгірше — 0,111). */
const CAMERA_TOL = 0.115

type Pixel = [x: number, y: number, ad: number, t: number | null]

const samplePath = (rel: string) => join(root, 'samples', rel)

function loadIr(path: string): IrImage {
  return parseThermogram(new Uint8Array(readFileSync(path))).ir
}

function expectPixels(ir: IrImage, overrides: Partial<ObjectParams>, pixels: Pixel[]) {
  const model = temperatureModel(ir, overrides)
  for (const [x, y, ad, t] of pixels) {
    expect(ir.ad[y * ir.width + x]).toBe(ad)
    if (t === null) expect(model.toCelsius(ad)).toBeNaN()
    else expect(Math.abs(model.toCelsius(ad) - t)).toBeLessThanOrEqual(TOL)
  }
  return model
}

describe('атмосферні таблиці', () => {
  it('збігаються з tools/atmosphere_tables.json', () => {
    const json = JSON.parse(readFileSync(join(root, 'tools', 'atmosphere_tables.json'), 'utf8'))
    expect(VAPOR_DENSITY).toEqual(json.vapor_g_m3)
    expect(TAU_GRID).toEqual(json.x_grid)
    expect(TAU_H2O).toEqual(json.tau_h2o)
    expect(TAU_DISTANCE).toEqual(json.tau_dist)
  })

  it('τ = 1 на нульовій відстані, спадає з відстанню й вологістю', () => {
    expect(transmittance(20, 0.5, 0)).toBe(1)
    expect(transmittance(20, 0.5, 100)).toBeLessThan(transmittance(20, 0.5, 10))
    expect(transmittance(20, 0.9, 100)).toBeLessThan(transmittance(20, 0.5, 100))
    // Поза таблицею пари (±49 °C) і сіткою τ — крайні значення, без NaN
    expect(transmittance(-80, 1, 1e7)).toBeCloseTo(TAU_H2O.at(-1)! * TAU_DISTANCE.at(-1)!, 12)
    expect(transmittance(80, 1, 10)).toBeGreaterThan(0)
  })
})

describe('AD → °C — зразки', () => {
  it('є фікстури для всіх зразків', () => {
    expect(fixtures.length).toBe(26)
  })

  for (const fx of fixtures) {
    // samples/latest-2021 поза git — у CI ці тести пропускаються
    const path = samplePath(fx.file)
    it.skipIf(!existsSync(path))(fx.file, () => {
      const ir = loadIr(path)

      const model = expectPixels(ir, {}, fx.pixels)
      expect(model.tau).toBeCloseTo(fx.tau, 6)

      const frame = frameTemperatures(ir, model)
      let min = Infinity
      let max = -Infinity
      for (const t of frame) {
        if (t < min) min = t
        if (t > max) max = t
      }
      expect(Math.abs(min - fx.frame.min)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(max - fx.frame.max)).toBeLessThanOrEqual(TOL)
      for (const [x, y, , t] of fx.pixels as Pixel[]) {
        expect(Math.abs(frame[y * ir.width + x]! - t!)).toBeLessThanOrEqual(TOL)
      }

      const scale = autoScale(ir, model)
      expect(Math.abs(scale.min - fx.autoScale.min)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(scale.max - fx.autoScale.max)).toBeLessThanOrEqual(TOL)
      // Незалежна перевірка: межі, які записала прошивка камери
      expect(Math.abs(scale.min - ir.params.minTemp)).toBeLessThanOrEqual(CAMERA_TOL)
      expect(Math.abs(scale.max - ir.params.maxTemp)).toBeLessThanOrEqual(CAMERA_TOL)

      for (const ov of fx.overrides) {
        const m = expectPixels(ir, ov.params, ov.pixels)
        expect(m.tau).toBeCloseTo(ov.tau, 6)
      }
    })
  }
})

describe('AD → °C — граничні випадки', () => {
  const ir = loadIr(samplePath('legacy-2013/130604_0001T.jpg'))
  const { ad: nodes } = ir.calibration
  const first = nodes[0]! - ir.params.deltaAd
  const last = nodes[nodes.length - 1]! - ir.params.deltaAd

  it('параметри за замовчуванням — із заголовка файлу', () => {
    const m = temperatureModel(ir, { emissivity: 0.5 })
    expect(m.params).toEqual({
      emissivity: 0.5,
      distance: ir.params.distance,
      airTemp: ir.params.airTemp,
      humidity: ir.params.humidity,
      reflectedTemp: ir.params.reflectedTemp,
      offset: ir.params.offset,
    })
  })

  it('AD поза калібрувальною таблицею → NaN, на вузлах — число', () => {
    const m = temperatureModel(ir)
    expect(m.toCelsius(first - 1)).toBeNaN()
    expect(m.toCelsius(last + 1)).toBeNaN()
    expect(m.toCelsius(first)).not.toBeNaN()
    expect(m.toCelsius(last)).not.toBeNaN()
  })

  it('неможливий результат (W < 0) → NaN', () => {
    // Холодний об'єкт, мала ε і гаряче відбите випромінювання
    const m = temperatureModel(ir, { emissivity: 0.1, reflectedTemp: 500 })
    expect(m.toCelsius(first)).toBeNaN()
  })

  it('поправка offset додається до результату', () => {
    const ad = ir.ad[0]!
    const base = temperatureModel(ir, { offset: 0 }).toCelsius(ad)
    expect(temperatureModel(ir, { offset: 2.5 }).toCelsius(ad)).toBeCloseTo(base + 2.5, 9)
  })

  it('діапазон камери за Temp_Range', () => {
    expect(measurementRange(0)).toEqual({ min: -20, max: 150 })
    expect(measurementRange(1)).toEqual({ min: 0, max: 400 })
  })
})

describe('AD → °C — швидкодія', () => {
  const path = samplePath('legacy-2013/130924_0002T.jpg')

  it('перерахунок кадру 384×288 < 50 мс', () => {
    const ir = loadIr(path)
    expect([ir.width, ir.height]).toEqual([384, 288])
    const out = new Float32Array(ir.ad.length)
    frameTemperatures(ir, temperatureModel(ir), out) // прогрів JIT
    let best = Infinity
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      frameTemperatures(ir, temperatureModel(ir, { emissivity: 0.9 - i * 0.05 }), out)
      best = Math.min(best, performance.now() - start)
    }
    expect(best).toBeLessThan(50)
  })
})
