import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BlockType, parseThermogram, ThermogramError, type ThermogramErrorCode } from '../../src/core/parser'

// Фікстури — tools/export_fixtures.py (незалежне читання формату на Python).
const root = join(import.meta.dirname, '..', '..')
const fixtureDir = join(root, 'tests', 'fixtures', 'parser')
const fixtures = readdirSync(fixtureDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(fixtureDir, f), 'utf8')))

const samplePath = (rel: string) => join(root, 'samples', rel)
const legacy = samplePath('legacy-2013/130604_0001T.jpg')

function expectError(data: Uint8Array, code: ThermogramErrorCode) {
  try {
    parseThermogram(data)
  } catch (e) {
    expect(e).toBeInstanceOf(ThermogramError)
    expect((e as ThermogramError).code).toBe(code)
    return
  }
  expect.unreachable(`очікувалась помилка ${code}`)
}

describe('parseThermogram — зразки', () => {
  it('є фікстури для всіх зразків', () => {
    expect(fixtures.length).toBe(26)
  })

  for (const fx of fixtures) {
    // samples/latest-2021 поза git — у CI ці тести пропускаються
    const path = samplePath(fx.file)
    const variants = [path, path.replace(/\.jpg$/i, '.hir')].filter((p, i) => i === 0 || existsSync(p))

    for (const file of variants) {
      it.skipIf(!existsSync(file))(file.slice(root.length + 1), () => {
        const buf = readFileSync(file)
        const t = parseThermogram(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

        expect(t.info).toEqual(fx.info)
        expect(t.blocks).toEqual(fx.blocks)
        expect(t.jpeg.length).toBe(fx.jpegLength)
        expect([t.jpeg[0], t.jpeg[1]]).toEqual([0xff, 0xd8])

        const ir = t.ir
        expect([ir.width, ir.height]).toEqual([fx.ir.width, fx.ir.height])
        expect(ir.params).toEqual(fx.ir.params)
        expect(Array.from(ir.calibration.ad)).toEqual(fx.ir.calibration.ad)
        expect(Array.from(ir.calibration.temp)).toEqual(fx.ir.calibration.temp)
        expect(ir.ad.length).toBe(ir.width * ir.height)
        let min = Infinity
        let max = -Infinity
        let sum = 0
        for (const v of ir.ad) {
          if (v < min) min = v
          if (v > max) max = v
          sum += v
        }
        expect({ min, max, sum }).toEqual(fx.ir.adStats)
        for (const [x, y, v] of fx.ir.adProbes) expect(ir.ad[y * ir.width + x]).toBe(v)
        expect(ir.header.length).toBe(0x700)
        expect(ir.extra.length).toBe(fx.ir.extraLength)

        const visible = fx.blocks.find((b: { type: number }) => b.type === BlockType.visibleJpeg)
        expect(t.visibleJpeg?.length).toBe(visible?.length)
        if (t.visibleJpeg) expect([t.visibleJpeg[0], t.visibleJpeg[1]]).toEqual([0xff, 0xd8])
      })
    }
  }

  it('приймає Uint8Array із зсувом у чужому буфері', () => {
    const file = readFileSync(legacy)
    const padded = new Uint8Array(file.length + 3)
    padded.set(file, 3)
    const t = parseThermogram(padded.subarray(3))
    expect(t.ir.width).toBe(160)
    expect(t.ir.ad.length).toBe(160 * 120)
  })
})

describe('parseThermogram — не термограми', () => {
  const file = new Uint8Array(readFileSync(legacy))
  const t0 = new DataView(file.buffer, file.byteOffset).getUint32(file.length - 4, true)

  it('звичайний JPEG → no-trailer з зрозумілим повідомленням', () => {
    // Головний JPEG зразка без радіометричного хвоста — звичайне фото
    const plain = file.slice(0, t0)
    expectError(plain, 'no-trailer')
    expect(() => parseThermogram(plain)).toThrow(/звичайне зображення/)
  })

  it('порожній і короткий файли → too-short', () => {
    expectError(new Uint8Array(0), 'too-short')
    expectError(new Uint8Array(100), 'too-short')
  })

  it('довільні байти → no-trailer', () => {
    const junk = new Uint8Array(4096).map((_, i) => (i * 131 + 7) & 0xff)
    expectError(junk, 'no-trailer')
  })

  it('обрізаний ІЧ-блок → bad-block', () => {
    // Хвіст на місці, але файл обрізано посередині блоків
    const cut = new Uint8Array(t0 + 0x1a0 + 1000 + 4)
    cut.set(file.subarray(0, t0 + 0x1a0 + 1000))
    new DataView(cut.buffer).setUint32(cut.length - 4, t0, true)
    expectError(cut, 'bad-block')
  })

  it('без ІЧ-блоку → no-ir-block', () => {
    const copy = file.slice()
    const view = new DataView(copy.buffer)
    for (let k = 0; k < 16; k++) {
      const o = t0 + 0xa0 + 16 * k
      if (view.getInt32(o, true) === BlockType.ir) view.setInt32(o + 8, 0, true)
    }
    expectError(copy, 'no-ir-block')
  })
})
