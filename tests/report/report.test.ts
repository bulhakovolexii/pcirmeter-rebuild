import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE } from '../../src/core/palettes'
import { parseThermogram } from '../../src/core/parser'
import { autoDisplayScale } from '../../src/core/render'
import { autoScale, temperatureModel } from '../../src/core/temperature'
import { en } from '../../src/i18n/en'
import { uk } from '../../src/i18n/uk'
import {
  buildReport,
  reportFileName,
  wrapText,
  type ReportFile,
  type ReportMeta,
} from '../../src/report/report'
import { defaultIsotherms } from '../../src/ui/isotherms'
import type { MeasureObject } from '../../src/ui/tools'

const root = join(import.meta.dirname, '..', '..')
const fonts = {
  regular: new Uint8Array(readFileSync(join(root, 'src/report/fonts/FiraSans-Regular.ttf'))),
  bold: new Uint8Array(readFileSync(join(root, 'src/report/fonts/FiraSans-SemiBold.ttf'))),
}
const t = (key: keyof typeof uk) => uk[key]
const units = { temperature: 'C', length: 'm' } as const

function snapshot(path: string, objects: MeasureObject[] = [], comment = ''): ReportFile {
  const thermogram = parseThermogram(new Uint8Array(readFileSync(path)))
  const auto = autoScale(thermogram.ir, temperatureModel(thermogram.ir))
  const isotherms = defaultIsotherms(auto)
  isotherms[0]!.enabled = true
  return {
    name: path.split('/').pop()!,
    thermogram,
    overrides: {},
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
  subject: 'Корпус У2, ауд. 301',
  author: 'Іваненко Іван',
  group: 'ЕМ-121',
  teacher: 'Булгаков О.',
  date: '2026-10-23',
  description: 'Обстеження зовнішньої стіни взимку.',
  conclusion: 'Виявлено містки холоду біля віконних укосів.',
}

const legacy = join(root, 'samples', 'legacy-2013')
const objects: MeasureObject[] = [
  { id: 1, name: 'P1', shape: { kind: 'point', x: 48, y: 97 }, overrides: {} },
  {
    id: 2,
    name: 'R1',
    shape: { kind: 'rect', x0: 2, y0: 0, x1: 87, y1: 63 },
    overrides: { emissivity: 0.9 },
    note: 'Містки холоду біля укосу',
  },
  { id: 3, name: 'L1', shape: { kind: 'line', x0: 10, y0: 100, x1: 150, y1: 20 }, overrides: {} },
]

describe('buildReport', () => {
  it('кілька термограм: PDF розбирається, текст — вбудованим шрифтом з кирилицею', async () => {
    const files = [
      snapshot(join(legacy, '130604_0002T.jpg'), objects, 'Тепловтрати через укоси.'),
      snapshot(join(legacy, '130604_0002T.jpg')),
    ]
    const bytes = await buildReport(meta, files, fonts, { locale: 'uk', units, t })
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT, bytes)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getTitle()).toBe('Звіт про термографічне обстеження: Корпус У2, ауд. 301')
    expect(doc.getAuthor()).toBe('Іваненко Іван')
    // Шрифт вбудовано підмножиною (Type0 + FontFile2), а не стандартний Helvetica без кирилиці
    const embedded = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => obj)
      .filter(
        (obj): obj is PDFDict => obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font'),
      )
      .map((font) => `${font.get(PDFName.of('Subtype'))} ${font.get(PDFName.of('BaseFont'))}`)
    expect(embedded.filter((f) => f.startsWith('/Type0')).sort()).toEqual([
      expect.stringMatching(/^\/Type0 \/FiraSans-Regular-\d+$/),
      expect.stringMatching(/^\/Type0 \/FiraSans-SemiBold-\d+$/),
    ])
    expect(embedded.some((f) => f.includes('Helvetica'))).toBe(false)
  })

  it('без об’єктів, англійською, у °F і футах', async () => {
    const bytes = await buildReport(
      { ...meta, description: '', conclusion: '' },
      [snapshot(join(legacy, '130604_0002T.jpg'))],
      fonts,
      { locale: 'en', units: { temperature: 'F', length: 'ft' }, t: (k) => en[k] },
    )
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  const latest = join(root, 'samples', 'latest-2021', '20210212_0135.JPG')
  it.skipIf(!existsSync(latest))('файл 2021 р. з видимим фото (локально)', async () => {
    const bytes = await buildReport(
      meta,
      [
        snapshot(latest, [
          { id: 1, name: 'P1', shape: { kind: 'point', x: 40, y: 40 }, overrides: {} },
          { id: 2, name: 'R1', shape: { kind: 'rect', x0: 5, y0: 5, x1: 30, y1: 30 }, overrides: {} },
        ]),
      ],
      fonts,
      {
        locale: 'uk',
        units,
        t,
      },
    )
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT.replace(/\.pdf$/, '-2021.pdf'), bytes)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1)
  })
})

describe('wrapText', () => {
  it('переносить по словах, задовге слово — посимвольно, зберігає порожні рядки', async () => {
    const doc = await PDFDocument.create()
    doc.registerFontkit((await import('@pdf-lib/fontkit')).default)
    const font = await doc.embedFont(fonts.regular)
    const width = font.widthOfTextAtSize('Тепловтрати через', 10)
    expect(wrapText('Тепловтрати через укоси вікон', font, 10, width)).toEqual([
      'Тепловтрати через',
      'укоси вікон',
    ])
    const long = wrapText('Ааааааааааааааааааааааааааааааа', font, 10, 40)
    expect(long.length).toBeGreaterThan(1)
    expect(long.every((l) => font.widthOfTextAtSize(l, 10) <= 40)).toBe(true)
    expect(long.join('')).toBe('Ааааааааааааааааааааааааааааааа')
    expect(wrapText('а\n\nб', font, 10, 100)).toEqual(['а', '', 'б'])
  })
})

describe('reportFileName', () => {
  it('об’єкт і дата, без заборонених символів', () => {
    expect(reportFileName(meta, t)).toBe('Корпус_У2,_ауд._301_2026-10-23.pdf')
    expect(reportFileName({ ...meta, subject: ' a/b:c ' }, t)).toBe('a_b_c_2026-10-23.pdf')
    expect(reportFileName({ ...meta, subject: '' }, t)).toBe('звіт_2026-10-23.pdf')
  })
})
