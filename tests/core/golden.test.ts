import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseThermogram, type IrImage } from '../../src/core/parser'
import { objectPixels, pixelStats, rectFromCorners } from '../../src/core/objects'
import { autoScale, frameTemperatures, temperatureModel, type ObjectParams } from '../../src/core/temperature'

// Еталони оригінальної програми (docs/golden-guide.md, частина А): tools/export_golden.py → reference.json.
const root = join(import.meta.dirname, '..', '..')
const golden = JSON.parse(readFileSync(join(root, 'tests', 'golden', 'reference.json'), 'utf8')) as {
  steps: {
    id: string
    file: string
    params: Partial<ObjectParams>
    expected: Record<'scaleMax' | 'scaleMin' | 'frameMax' | 'frameMin', number>
  }[]
}

/** Оригінал показує один знак після коми: розбіжність до 0,05 °C — округлення відображення. */
const DISPLAY_TOL = 0.05 + 1e-6

const irCache = new Map<string, IrImage>()
function loadIr(path: string): IrImage {
  let ir = irCache.get(path)
  if (!ir) {
    ir = parseThermogram(new Uint8Array(readFileSync(path))).ir
    irCache.set(path, ir)
  }
  return ir
}

describe('ядро проти оригінальної програми (частина А)', () => {
  it('усі 116 показів експортовано', () => {
    const n = golden.steps.reduce((s, step) => s + Object.keys(step.expected).length, 0)
    expect(n).toBe(116)
  })

  for (const step of golden.steps) {
    // samples/latest-2021 поза git — у CI ці тести пропускаються
    const path = join(root, 'samples', step.file)
    it.skipIf(!existsSync(path))(`${step.id} ${step.file}`, () => {
      const ir = loadIr(path)
      const model = temperatureModel(ir, step.params)
      const scale = autoScale(ir, model)
      const frame = frameTemperatures(ir, model)
      let max = -Infinity
      let min = Infinity
      for (const t of frame) {
        if (t > max) max = t
        if (t < min) min = t
      }
      const got = {
        scaleMax: scale.max,
        scaleMin: scale.min,
        // Оригінал шукає Max кадру від 0 °C, Min — від 1000 °C (docs/spec/temperature.md),
        // тому для від'ємного кадру показує Max = 0,0. Наш застосунок показує справжній max.
        frameMax: Math.max(max, 0),
        frameMin: Math.min(min, 1000),
      }
      for (const [key, value] of Object.entries(step.expected)) {
        const diff = Math.abs(got[key as keyof typeof got] - value)
        expect(diff, `${key}: ядро ${got[key as keyof typeof got]}, оригінал ${value}`).toBeLessThanOrEqual(
          DISPLAY_TOL,
        )
      }
    })
  }
})

// Частина Б: положення об'єктів відновлено зі скриншотів (tools/fit_objects.py → objects.json).
type Stats = Record<'max' | 'min' | 'avg', number>
const objects = JSON.parse(readFileSync(join(root, 'tests', 'golden', 'objects.json'), 'utf8')) as {
  files: {
    id: string
    file: string
    control: [number, number]
    points: { name: string; x: number; y: number; expected: number }[]
    rect: { irRect: [number, number, number, number]; expected: Stats }
    line: { control: [number, number, number, number]; expected: Stats }
  }[]
}

describe('ядро проти оригінальної програми (частина Б, точки)', () => {
  for (const f of objects.files) {
    const path = join(root, 'samples', f.file)
    it.skipIf(!existsSync(path))(`${f.id} ${f.file}`, () => {
      const ir = loadIr(path)
      const model = temperatureModel(ir)
      for (const p of f.points) {
        const t = model.toCelsius(ir.ad[p.y * ir.width + p.x]!)
        expect(Math.abs(t - p.expected), `${p.name}: ядро ${t}, оригінал ${p.expected}`).toBeLessThanOrEqual(
          DISPLAY_TOL,
        )
      }
    })
  }
})

/**
 * Оригінал рахує по екранних пікселях, ми — по пікселях кадру (docs/spec/temperature.md, «Об'єкти аналізу»).
 * Прямокутник і середнє лінії: різняться лише ваги крайніх пікселів — округлення показу + 0,1 °C.
 * Max/min лінії: екранна дискретизація оригіналу захоплює сусідні з ідеальною лінією пікселі кадру
 * (F5: 80 точок проти 72), на різкому краї це до 0,5 °C.
 */
const SEMANTICS_TOL = 0.15 + 1e-6
const LINE_EXTREMES_TOL = 0.55

describe('ядро проти оригінальної програми (частина Б, прямокутник і лінія)', () => {
  for (const f of objects.files) {
    const path = join(root, 'samples', f.file)
    it.skipIf(!existsSync(path))(`${f.id} ${f.file}`, () => {
      const ir = loadIr(path)
      const temps = frameTemperatures(ir, temperatureModel(ir))
      const [x0, y0, x1, y1] = f.rect.irRect
      const rect = pixelStats(temps, objectPixels(rectFromCorners(x0, y0, x1, y1), ir.width, ir.height))
      // Кінці лінії: екранна точка → піксель кадру, як в оригіналі (int(x / zoom))
      const zx = f.control[0] / ir.width
      const zy = f.control[1] / ir.height
      const [lx0, ly0, lx1, ly1] = f.line.control
      const shape = {
        kind: 'line' as const,
        x0: Math.trunc(lx0 / zx),
        y0: Math.trunc(ly0 / zy),
        x1: Math.trunc(lx1 / zx),
        y1: Math.trunc(ly1 / zy),
      }
      const line = pixelStats(temps, objectPixels(shape, ir.width, ir.height))
      for (const [name, got, expected] of [
        ['R1', rect, f.rect.expected],
        ['L1', line, f.line.expected],
      ] as const) {
        for (const key of ['max', 'min', 'avg'] as const) {
          const diff = Math.abs(got[key] - expected[key])
          const tol = name === 'L1' && key !== 'avg' ? LINE_EXTREMES_TOL : SEMANTICS_TOL
          expect(diff, `${name} ${key}: ядро ${got[key]}, оригінал ${expected[key]}`).toBeLessThanOrEqual(tol)
        }
      }
    })
  }
})
