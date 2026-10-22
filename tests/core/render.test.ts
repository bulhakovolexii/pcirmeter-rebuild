import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { palette, PALETTE_IDS } from '../../src/core/palettes'
import { parseThermogram, type IrImage } from '../../src/core/parser'
import {
  autoDisplayScale,
  celsiusToAd,
  frameExtremes,
  manualDisplayScale,
  paletteHistogram,
  paletteIndex,
  renderFrame,
} from '../../src/core/render'
import { autoScale, temperatureModel } from '../../src/core/temperature'

const root = join(import.meta.dirname, '..', '..')
// Зразки 2013 р. є в git, тож ці тести виконуються й у CI
const legacyDir = join(root, 'samples', 'legacy-2013')
const legacy = readdirSync(legacyDir)
  .filter((f) => f.toLowerCase().endsWith('.jpg'))
  .map((f) => ({ name: f, ir: parseThermogram(new Uint8Array(readFileSync(join(legacyDir, f)))).ir }))

describe('палітри', () => {
  it('збігаються з tools/palettes.json', () => {
    const json = JSON.parse(readFileSync(join(root, 'tools', 'palettes.json'), 'utf8'))
    expect(json.order).toEqual([...PALETTE_IDS])
    for (const id of PALETTE_IDS) {
      const hex = Array.from(palette(id), (v) => v.toString(16).padStart(2, '0')).join('')
      expect(hex, id).toBe(json.palettes[id])
    }
  })

  it('Grey — від чорного до білого', () => {
    const grey = palette('grey')
    expect([...grey.slice(0, 3)]).toEqual([0, 0, 0])
    expect([...grey.slice(765)]).toEqual([255, 255, 255])
  })
})

describe('індекс палітри', () => {
  const scale = { level: 1000, span: 100 }

  it('(AD − Level)·255/Span з відкиданням дробової частини й обрізкою', () => {
    expect(paletteIndex(1000, scale)).toBe(0)
    expect(paletteIndex(1001, scale)).toBe(2) // 2,55
    expect(paletteIndex(1050, scale)).toBe(127) // 127,5
    expect(paletteIndex(1100, scale)).toBe(255)
    expect(paletteIndex(900, scale)).toBe(0)
    expect(paletteIndex(1200, scale)).toBe(255)
  })

  it('renderFrame збігається з paletteIndex для кожного пікселя', () => {
    const ad = Uint16Array.from({ length: 300 }, (_, i) => 950 + i)
    const rgb = palette('rainbow')
    const out = renderFrame(ad, rgb, scale)
    for (let i = 0; i < ad.length; i++) {
      const c = 3 * paletteIndex(ad[i]!, scale)
      expect([...out.slice(4 * i, 4 * i + 4)]).toEqual([rgb[c], rgb[c + 1], rgb[c + 2], 255])
    }
  })
})

describe.each(legacy)('$name', ({ ir }) => {
  const model = temperatureModel(ir)

  it('гістограма: усі пікселі, стовпець — індекс палітри', () => {
    const scale = autoDisplayScale(ir)
    const bins = paletteHistogram(ir.ad, scale)
    expect(bins.length).toBe(256)
    expect(bins.reduce((a, b) => a + b, 0)).toBe(ir.ad.length)
    const { max } = frameExtremes(ir)
    expect(bins[paletteIndex(max.ad, scale)]).toBeGreaterThan(0)
  })

  it('автошкала — FPGA_Level / FPGA_Span', () => {
    expect(autoDisplayScale(ir)).toEqual({ level: ir.params.fpgaLevel, span: ir.params.fpgaSpan })
  })

  it('celsiusToAd — обернене до toCelsius', () => {
    for (const ad of sampleAds(ir)) {
      const t = model.toCelsius(ad)
      if (Number.isNaN(t)) continue
      const back = celsiusToAd(ir, model, t)
      // Сусідні AD можуть давати ту саму температуру (плоска ділянка таблиці)
      expect(model.toCelsius(back)).toBe(t)
      expect(back).toBeLessThanOrEqual(ad)
      expect(model.toCelsius(back - 1)).toBeLessThan(t)
    }
  })

  it('ручна шкала з меж автошкали ≈ автошкала (±1 AD)', () => {
    const { min, max } = autoScale(ir, model)
    const manual = manualDisplayScale(ir, model, min, max)
    expect(Math.abs(manual.level - ir.params.fpgaLevel)).toBeLessThanOrEqual(1)
    expect(Math.abs(manual.span - ir.params.fpgaSpan)).toBeLessThanOrEqual(1)
  })

  it('межі поза калібруванням дають крайні AD таблиці', () => {
    const nodes = ir.calibration.ad
    expect(celsiusToAd(ir, model, -1000)).toBeGreaterThanOrEqual(nodes[0]! - ir.params.deltaAd)
    expect(celsiusToAd(ir, model, 10000)).toBeLessThanOrEqual(nodes[nodes.length - 1]! - ir.params.deltaAd)
  })

  it('frameExtremes — пікселі з max/min AD', () => {
    const { max, min } = frameExtremes(ir)
    expect(ir.ad[max.y * ir.width + max.x]).toBe(max.ad)
    expect(ir.ad[min.y * ir.width + min.x]).toBe(min.ad)
    expect(max.ad).toBe(Math.max(...ir.ad))
    expect(min.ad).toBe(Math.min(...ir.ad))
  })
})

it('рендер кадру 384×288 — кілька мілісекунд', () => {
  const ir = legacy.find(({ ir }) => ir.width === 384)!.ir
  const rgb = palette('iron')
  const out = new Uint8ClampedArray(ir.ad.length * 4)
  renderFrame(ir.ad, rgb, autoDisplayScale(ir), out)
  const start = performance.now()
  for (let i = 0; i < 10; i++) renderFrame(ir.ad, rgb, autoDisplayScale(ir), out)
  expect((performance.now() - start) / 10).toBeLessThan(10)
})

/** ~40 AD з кадру, включно з екстремумами. */
function sampleAds(ir: IrImage): number[] {
  const { max, min } = frameExtremes(ir)
  const step = Math.floor(ir.ad.length / 40)
  return [max.ad, min.ad, ...Array.from({ length: 40 }, (_, i) => ir.ad[i * step]!)]
}
