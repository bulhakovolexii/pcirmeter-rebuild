import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE } from '../../src/core/palettes'
import { parseThermogram } from '../../src/core/parser'
import { autoDisplayScale } from '../../src/core/render'
import { autoScale, temperatureModel } from '../../src/core/temperature'
import { en } from '../../src/i18n/en'
import { uk } from '../../src/i18n/uk'
import { crc32, encodePng, upscale, zip } from '../../src/report/binary'
import type { ReportFile, ReportMeta } from '../../src/report/content'
import type { Svg } from '../../src/report/figures'
import { buildOdt, ODT_MIME } from '../../src/report/odt'
import { defaultIsotherms } from '../../src/ui/isotherms'
import type { MeasureObject } from '../../src/ui/tools'

const root = join(import.meta.dirname, '..', '..')
const legacy = join(root, 'samples', 'legacy-2013')
const t = (key: keyof typeof uk) => uk[key]
const units = { temperature: 'C', length: 'm' } as const

/** Записи ZIP без стиснення: ім'я, метод, дані (за центральним каталогом). */
function unzip(bytes: Uint8Array): { name: string; method: number; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let o = view.getUint32(end + 16, true)
  const out = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(o, true)).toBe(0x02014b50)
    const method = view.getUint16(o + 10, true)
    const crc = view.getUint32(o + 16, true)
    const size = view.getUint32(o + 20, true)
    const nameLen = view.getUint16(o + 28, true)
    const local = view.getUint32(o + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(o + 46, o + 46 + nameLen))
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    out.push({ name, method, data })
    o += 46 + nameLen + view.getUint16(o + 30, true) + view.getUint16(o + 32, true)
  }
  return out
}

function snapshot(path: string, objects: MeasureObject[] = [], comment = ''): ReportFile {
  const thermogram = parseThermogram(new Uint8Array(readFileSync(path)))
  const auto = autoScale(thermogram.ir, temperatureModel(thermogram.ir))
  const isotherms = defaultIsotherms(auto)
  isotherms[0]!.enabled = true
  return {
    name: path.split('/').pop()!,
    thermogram,
    overrides: { emissivity: 0.9 },
    paletteId: DEFAULT_PALETTE,
    scale: autoDisplayScale(thermogram.ir),
    scaleLabels: auto,
    manualScale: false,
    isotherms,
    objects,
    showExtremes: true,
    comment,
  }
}

const meta: ReportMeta = {
  subject: 'Корпус У2 & <ауд. 301>',
  author: 'Іваненко Іван',
  group: 'ЕМ-121',
  teacher: 'Булгаков О.',
  date: '2026-10-23',
  description: 'Обстеження зовнішньої стіни взимку.\n\nДругий абзац.',
  conclusion: 'Виявлено містки холоду.',
}

const objects: MeasureObject[] = [
  { id: 1, name: 'P1', shape: { kind: 'point', x: 48, y: 97 }, overrides: {} },
  {
    id: 2,
    name: 'R1',
    shape: { kind: 'rect', x0: 2, y0: 0, x1: 87, y1: 63 },
    overrides: { emissivity: 0.8 },
  },
  { id: 3, name: 'L1', shape: { kind: 'line', x0: 10, y0: 100, x1: 150, y1: 20 }, overrides: {} },
]

const svgs: Svg[] = []
async function rasterize(svg: Svg, scale: number) {
  svgs.push(svg)
  expect(scale).toBeGreaterThan(1)
  return encodePng(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1)
}

describe('buildOdt', () => {
  it('ODF-пакет: mimetype першим без стиснення, маніфест, зміст з кирилицею, рисунки', async () => {
    svgs.length = 0
    const files = [
      snapshot(join(legacy, '130604_0002T.jpg'), objects, 'Тепловтрати через укоси.'),
      snapshot(join(legacy, '130604_0002T.jpg')),
    ]
    const bytes = await buildOdt(meta, files, { rasterize }, { locale: 'uk', units, t })
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT.replace(/\.pdf$/, '.odt'), bytes)
    const entries = unzip(bytes)
    expect(entries[0]).toMatchObject({ name: 'mimetype', method: 0 })
    expect(new TextDecoder().decode(entries[0]!.data)).toBe(ODT_MIME)
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype')
    const text = (name: string) => new TextDecoder().decode(entries.find((e) => e.name === name)!.data)
    const content = text('content.xml')
    expect(content).toContain('Звіт про термографічне обстеження')
    expect(content).toContain('Корпус У2 &#38; &#60;ауд. 301&#62;')
    expect(content).toContain('Термограма 2. 130604_0002T.jpg')
    expect(content).toContain('Профіль лінії L1')
    expect(content).toContain('Розподіл температур R1')
    expect(content).toContain('Тепловтрати через укоси.')
    // Друга термограма — з нової сторінки
    expect(content).toMatch(/text:style-name="Heading_1_Break"[^>]*>Термограма 2\./)
    expect(content).toContain('<table:table-header-rows>')
    expect(text('styles.xml')).toContain('<text:page-count>')
    expect(text('meta.xml')).toContain('<dc:creator>Іваненко Іван</dc:creator>')

    // Рисунки: 2 ІЧ-кадри + 2 фото + профіль + розподіл; усі — у маніфесті й посилаються зі змісту
    const pictures = entries.filter((e) => e.name.startsWith('Pictures/'))
    expect(pictures).toHaveLength(6)
    const manifest = text('META-INF/manifest.xml')
    for (const pic of pictures) {
      expect(manifest).toContain(`manifest:full-path="${pic.name}"`)
      expect(content).toContain(`xlink:href="${pic.name}"`)
    }
    expect(svgs).toHaveLength(4)
    expect(svgs[0]!.svg).toContain('data:image/png;base64,')
    expect(svgs[0]!.svg).toContain('>R1</text>')
  })

  it('англійською, без об’єктів і без титульних полів', async () => {
    const empty = {
      ...meta,
      subject: '',
      author: '',
      group: '',
      teacher: '',
      date: '',
      description: '',
      conclusion: '',
    }
    const bytes = await buildOdt(
      empty,
      [snapshot(join(legacy, '130604_0002T.jpg'))],
      { rasterize },
      {
        locale: 'en',
        units: { temperature: 'F', length: 'ft' },
        t: (k) => en[k],
      },
    )
    const content = new TextDecoder().decode(unzip(bytes).find((e) => e.name === 'content.xml')!.data)
    expect(content).toContain('No measurement objects.')
    expect(content).not.toContain('Signatures')
  })

  const latest = join(root, 'samples', 'latest-2021', '20210212_0135.JPG')
  it.skipIf(!existsSync(latest))('файл 2021 р.: видиме фото — JPEG як є (локально)', async () => {
    const file = snapshot(latest)
    const bytes = await buildOdt(meta, [file], { rasterize }, { locale: 'uk', units, t })
    const jpeg = unzip(bytes).find((e) => e.name.endsWith('.jpg'))
    expect(jpeg?.data).toEqual(file.thermogram.visibleJpeg)
  })
})

describe('PNG і ZIP', () => {
  it('CRC-32 — стандартний', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('PNG має підпис і IHDR з розміром', async () => {
    const png = await encodePng(new Uint8ClampedArray(2 * 3 * 4), 2, 3)
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([2, 3])
  })

  it('upscale повторює пікселі без інтерполяції', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8])
    const big = upscale(rgba, 2, 1, 2)
    expect([big.width, big.height]).toEqual([4, 2])
    expect([...big.rgba.subarray(0, 16)]).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8])
  })

  it('zip зберігає порядок і вміст', () => {
    const data = new TextEncoder().encode('привіт')
    const entries = unzip(
      zip([
        { name: 'a.txt', data },
        { name: 'b/c.txt', data: new Uint8Array() },
      ]),
    )
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'b/c.txt'])
    expect(entries[0]!.data).toEqual(data)
  })
})
