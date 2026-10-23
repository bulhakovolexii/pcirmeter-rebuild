import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ThermogramError } from '../../src/core/parser'
import { openThermogram } from '../../src/core/thermogram'
import { outOfUtiRange, parseUti, UTI_FILE_SIZE } from '../../src/core/uti'
import { utiFile } from '../support/uti'

const root = join(import.meta.dirname, '..', '..')
const samples = join(root, 'samples', 'uti89pro', 'Images')
const legacy = join(root, 'samples', 'legacy-2013', '130604_0002T.jpg')

function code(f: () => unknown): string | undefined {
  try {
    f()
  } catch (e) {
    return e instanceof ThermogramError ? e.code : 'other'
  }
  return undefined
}

describe('parseUti', () => {
  it('знімок екрана: RGB555 → RGBA, рядки згори вниз', () => {
    const uti = parseUti(utiFile())
    expect([uti.width, uti.height]).toEqual([240, 320])
    const px = (x: number, y: number) =>
      Array.from(uti.screen.subarray(4 * (y * 240 + x), 4 * (y * 240 + x) + 4))
    // r = x mod 32, g = y mod 32, b = 31 (див. tests/support/uti.ts)
    expect(px(0, 0)).toEqual([0, 0, 255, 255])
    expect(px(31, 31)).toEqual([255, 255, 255, 255])
    expect(px(0, 32)).toEqual([0, 0, 255, 255])
    expect(px(10, 5)).toEqual([(10 << 3) | (10 >> 2), (5 << 3) | (5 >> 2), 255, 255])
  })

  it('три значення ×10 → °C; координати — у системі екрана, обмежені межами кадру', () => {
    const uti = parseUti(utiFile())
    expect(uti.max).toEqual({ x: 159, y: 263, celsius: 46.9 })
    // y = 320 у файлі — на одиницю за межею кадру
    expect(uti.min).toEqual({ x: 95, y: 0, celsius: -17.7 })
    expect(uti.center).toEqual({ x: 119, y: 159, celsius: 21 })
  })

  it('межі діапазону камери −10…400 °C', () => {
    expect(outOfUtiRange(-17.7)).toBe(true)
    expect(outOfUtiRange(-10)).toBe(false)
    expect(outOfUtiRange(400)).toBe(false)
    expect(outOfUtiRange(400.1)).toBe(true)
  })

  it('інший BMP — помилка bmp-not-uti', () => {
    const file = utiFile()
    expect(code(() => parseUti(file.slice(0, UTI_FILE_SIZE - 1)))).toBe('bmp-not-uti')
    const bpp24 = file.slice()
    new DataView(bpp24.buffer).setUint16(28, 24, true)
    expect(code(() => parseUti(bpp24))).toBe('bmp-not-uti')
    const landscape = file.slice()
    new DataView(landscape.buffer).setInt32(18, 320, true)
    new DataView(landscape.buffer).setInt32(22, 240, true)
    expect(code(() => parseUti(landscape))).toBe('bmp-not-uti')
    expect(code(() => parseUti(new Uint8Array([0x42, 0x4d, 0, 0])))).toBe('bmp-not-uti')
  })
})

describe('openThermogram', () => {
  it('розпізнає формат за вмістом', () => {
    expect(openThermogram(utiFile()).kind).toBe('uti')
    expect(openThermogram(new Uint8Array(readFileSync(legacy))).kind).toBe('pcirmeter')
    expect(code(() => openThermogram(new Uint8Array(10)))).toBe('too-short')
  })
})

describe.skipIf(!existsSync(samples))('зразки UTi89 PRO (локально)', () => {
  const expected = JSON.parse(
    readFileSync(join(root, 'tests', 'fixtures', 'uti', 'samples.json'), 'utf8'),
  ) as Record<string, unknown>

  it.each(Object.keys(expected))('%s збігається з tools/dump_uti.py', (name) => {
    const uti = parseUti(new Uint8Array(readFileSync(join(samples, name))))
    expect({ max: uti.max, min: uti.min, center: uti.center }).toEqual(expected[name])
  })
})
