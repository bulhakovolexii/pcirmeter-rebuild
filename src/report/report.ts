/**
 * PDF-звіт (docs/spec/features.md §2.7, docs/spec/report.md) — без DOM, тестується в Node.
 * Завантажується динамічним `import()` лише при створенні звіту: pdf-lib + fontkit — окремий chunk.
 */

import fontkit from '@pdf-lib/fontkit'
import {
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  concatTransformationMatrix,
  PDFDocument,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import { isothermBounds, isValidIsotherm, paintIsotherms } from '../core/isotherms'
import type { TemperatureBin } from '../core/objects'
import { palette, type PaletteId } from '../core/palettes'
import type { Thermogram } from '../core/parser'
import { frameExtremes, renderFrame, type DisplayScale } from '../core/render'
import {
  frameTemperatures,
  measurementRange,
  objectParams,
  temperatureModel,
  type ObjectParams,
} from '../core/temperature'
import { fromCelsius } from '../core/units'
import type { Locale } from '../i18n'
import type { MessageKey } from '../i18n/uk'
import { decodeUserText } from '../ui/attachments'
import { niceTicks, tickDigits } from '../ui/chart'
import {
  formatNumber,
  formatSavedAt,
  formatTemperature,
  LENGTH_SYMBOL,
  TEMPERATURE_SYMBOL,
} from '../ui/format'
import { toIsotherm, type IsothermState } from '../ui/isotherms'
import { displayValue, paramDigits, PARAM_FIELDS, type Units } from '../ui/params'
import { areaDistribution, lineProfile, measureObjects, rowNote, type ResultRow } from '../ui/results'
import type { MeasureObject } from '../ui/tools'

/** Титульні дані звіту (поля діалогу). */
export interface ReportMeta {
  subject: string
  author: string
  group: string
  teacher: string
  /** Дата звіту `YYYY-MM-DD` (значення `<input type="date">`). */
  date: string
  description: string
  conclusion: string
}

/** Знімок стану переглядача одного файлу — те, що бачить користувач. */
export interface ReportFile {
  name: string
  thermogram: Thermogram
  /** Змінені користувачем параметри кадру. */
  overrides: Partial<ObjectParams>
  paletteId: PaletteId
  scale: DisplayScale
  /** Межі шкали, °C (підписи кольорової шкали). */
  scaleLabels: { min: number; max: number }
  manualScale: boolean
  isotherms: readonly IsothermState[]
  objects: readonly MeasureObject[]
  showExtremes: boolean
  /** Коментар до термограми з діалогу звіту. */
  comment: string
}

export interface ReportFonts {
  regular: Uint8Array
  bold: Uint8Array
}

export interface ReportOptions {
  locale: Locale
  units: Units
  t: (key: MessageKey) => string
}

// A4, пункти (1 pt = 1/72″); поля 15 мм
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const CONTENT_W = PAGE_W - 2 * MARGIN
/** Нижня межа вмісту — над колонтитулом. */
const BOTTOM = MARGIN + 18

const BODY = 9
const SMALL = 7.5
const LINE = 1.3

const INK = rgb(0.165, 0.165, 0.165)
const MUTED = rgb(0.42, 0.42, 0.42)
const ACCENT = rgb(0.627, 0, 0.106)
const RULE = rgb(0.82, 0.82, 0.82)
const HEAD_BG = rgb(0.95, 0.95, 0.95)
const WHITE = rgb(1, 1, 1)
const BLACK = rgb(0, 0, 0)
/** Кольори накладень — як у переглядачі (`Viewer.svelte`). */
const SHAPE = rgb(0.651, 1, 0.302)
const MAX_MARK = WHITE
const MIN_MARK = rgb(0, 1, 1)

function hexColor(hex: string): Color {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255) : BLACK
}

/** Розбиває текст на рядки не ширші за `width` (переноси — по пробілах, задовге слово — посимвольно). */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      let rest = word
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--
        lines.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

interface Cell {
  text: string
  bold?: boolean
  color?: Color
  align?: 'left' | 'right'
}

/** Розкладка сторінок: курсор `y` іде згори вниз (у координатах «від верху сторінки»). */
class Layout {
  page!: PDFPage
  y = 0

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage()
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = MARGIN
  }

  /** Перейти на нову сторінку, якщо до низу менше `height`. */
  ensure(height: number) {
    if (this.y + height > PAGE_H - BOTTOM) this.newPage()
  }

  /** Y у системі PDF (знизу) для відстані `top` від верху сторінки. */
  pdfY(top: number) {
    return PAGE_H - top
  }

  text(text: string, x: number, top: number, size = BODY, opts: { bold?: boolean; color?: Color } = {}) {
    // Базова лінія — на 0,8 кегля нижче верху рядка
    this.page.drawText(text, {
      x,
      y: this.pdfY(top + size * 0.8),
      size,
      font: opts.bold ? this.bold : this.regular,
      color: opts.color ?? INK,
    })
  }

  /** Абзац з переносами на всю ширину вмісту (сторінки ламаються між рядками). */
  paragraph(text: string, size = BODY, opts: { bold?: boolean; color?: Color; indent?: number } = {}) {
    const font = opts.bold ? this.bold : this.regular
    const indent = opts.indent ?? 0
    for (const line of wrapText(text, font, size, CONTENT_W - indent)) {
      this.ensure(size * LINE)
      this.text(line, MARGIN + indent, this.y, size, opts)
      this.y += size * LINE
    }
  }

  heading(text: string, size = 11) {
    this.ensure(size * LINE + 40)
    this.text(text, MARGIN, this.y, size, { bold: true, color: ACCENT })
    this.y += size * LINE + 3
  }

  rule(color = RULE, width = 0.75) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.pdfY(this.y) },
      end: { x: PAGE_W - MARGIN, y: this.pdfY(this.y) },
      thickness: width,
      color,
    })
  }

  /** Таблиця з переносами в клітинках; заголовок повторюється на новій сторінці. */
  table(
    widths: readonly number[],
    header: readonly Cell[] | null,
    rows: readonly (readonly Cell[])[],
    size = 8,
  ) {
    const pad = 3
    const lineH = size * LINE
    const measure = (row: readonly Cell[]) =>
      row.map((c, i) => wrapText(c.text, c.bold ? this.bold : this.regular, size, widths[i]! - 2 * pad))
    const rowHeight = (lines: string[][]) => Math.max(1, ...lines.map((l) => l.length)) * lineH + 2 * pad
    const draw = (row: readonly Cell[], lines: string[][], h: number, fill?: Color) => {
      let x = MARGIN
      row.forEach((c, i) => {
        const w = widths[i]!
        this.page.drawRectangle({
          x,
          y: this.pdfY(this.y + h),
          width: w,
          height: h,
          color: fill,
          borderColor: RULE,
          borderWidth: 0.5,
        })
        const font = c.bold ? this.bold : this.regular
        lines[i]!.forEach((line, k) => {
          const tx = c.align === 'right' ? x + w - pad - font.widthOfTextAtSize(line, size) : x + pad
          this.text(line, tx, this.y + pad + k * lineH, size, { bold: c.bold, color: c.color })
        })
        x += w
      })
      this.y += h
    }
    const headerLines = header ? measure(header) : null
    const headerH = headerLines ? rowHeight(headerLines) : 0
    const drawHeader = () => {
      if (header && headerLines) draw(header, headerLines, headerH, HEAD_BG)
    }
    const first = rows[0] ? rowHeight(measure(rows[0])) : 0
    this.ensure(headerH + first)
    drawHeader()
    for (const row of rows) {
      const lines = measure(row)
      const h = rowHeight(lines)
      if (this.y + h > PAGE_H - BOTTOM) {
        this.newPage()
        drawHeader()
      }
      draw(row, lines, h)
    }
  }
}

/** Вбудувати піксельне RGB-зображення (без інтерполяції — пікселі кадру видно як є). */
function embedRgb(doc: PDFDocument, rgbBytes: Uint8Array, width: number, height: number) {
  const stream = doc.context.flateStream(rgbBytes, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Interpolate: false,
  })
  return doc.context.register(stream)
}

function drawRgb(
  page: PDFPage,
  ref: ReturnType<typeof embedRgb>,
  x: number,
  bottom: number,
  width: number,
  height: number,
) {
  const name = page.node.newXObject('Image', ref)
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(width, 0, 0, height, x, bottom),
    drawObject(name),
    popGraphicsState(),
  )
}

function rgbaToRgb(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3)
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    out[o] = rgba[i]!
    out[o + 1] = rgba[i + 1]!
    out[o + 2] = rgba[i + 2]!
  }
  return out
}

/** Текст з чорним обведенням (як підписи на зображенні в переглядачі). */
function outlinedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: Color,
) {
  for (const [dx, dy] of [
    [-0.6, 0],
    [0.6, 0],
    [0, -0.6],
    [0, 0.6],
    [-0.45, -0.45],
    [0.45, 0.45],
    [-0.45, 0.45],
    [0.45, -0.45],
  ] as const) {
    page.drawText(text, { x: x + dx, y: y + dy, size, font, color: BLACK })
  }
  page.drawText(text, { x, y, size, font, color })
}

/** Ім'я файлу звіту: `<об'єкт або «звіт»>_<дата>.pdf`, без символів, заборонених у файлових системах. */
export function reportFileName(meta: ReportMeta, t: (key: MessageKey) => string): string {
  const base = (meta.subject.trim() || t('report.fileName')).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60)
  return `${base}_${meta.date || 'report'}.pdf`
}

/** Створює PDF-звіт за знімками переглядачів `files` (порядок — як у списку). */
export async function buildReport(
  meta: ReportMeta,
  files: readonly ReportFile[],
  fonts: ReportFonts,
  { locale, units, t }: ReportOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regular = await doc.embedFont(fonts.regular, { subset: true })
  const bold = await doc.embedFont(fonts.bold, { subset: true })
  const title = t('report.title')
  doc.setTitle(meta.subject.trim() ? `${title}: ${meta.subject.trim()}` : title)
  if (meta.author.trim()) doc.setAuthor(meta.author.trim())
  doc.setCreator(t('app.title'))
  doc.setProducer('pdf-lib')
  doc.setLanguage(locale === 'uk' ? 'uk-UA' : 'en')

  const L = new Layout(doc, regular, bold)
  const fmtT = (c: number) => formatTemperature(c, locale, units.temperature)
  const tUnit = TEMPERATURE_SYMBOL[units.temperature]

  // Титул
  L.text(title, MARGIN, L.y, 16, { bold: true, color: ACCENT })
  L.y += 16 * LINE + 4
  L.rule(ACCENT, 1.5)
  L.y += 8
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(meta.date)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(`${meta.date}T00:00:00Z`),
      )
    : meta.date
  const titleRows: [string, string][] = [
    [t('report.subject'), meta.subject],
    [t('report.author'), meta.author],
    [t('report.group'), meta.group],
    [t('report.teacher'), meta.teacher],
    [t('report.date'), reportDate],
  ]
  L.table(
    [140, CONTENT_W - 140],
    null,
    titleRows.filter(([, v]) => v.trim()).map(([k, v]) => [{ text: k, bold: true }, { text: v }]),
    BODY,
  )
  if (meta.description.trim()) {
    L.y += 10
    L.heading(t('report.description'))
    L.paragraph(meta.description)
  }

  for (const [index, file] of files.entries()) {
    // Кожна термограма — з нової сторінки, крім першої, якщо після титулу лишилось місце
    if (index > 0 || L.y > PAGE_H * 0.4) L.newPage()
    else L.y += 14
    await drawFileSection(L, file, index, { locale, units, t, fmtT, tUnit })
  }

  if (meta.conclusion.trim() || meta.author.trim() || meta.teacher.trim()) {
    L.y += 14
    if (meta.conclusion.trim()) {
      L.heading(t('report.conclusion'))
      L.paragraph(meta.conclusion)
      L.y += 10
    }
    L.ensure(60)
    L.y += 24
    const sign = (label: string, name: string, x: number) => {
      L.text(`${label}:`, x, L.y, BODY, { bold: true })
      const lx = x + bold.widthOfTextAtSize(`${label}:`, BODY) + 6
      L.page.drawLine({
        start: { x: lx, y: L.pdfY(L.y + BODY) },
        end: { x: x + 230, y: L.pdfY(L.y + BODY) },
        thickness: 0.5,
        color: INK,
      })
      if (name.trim()) L.text(name.trim(), lx, L.y + BODY + 3, SMALL, { color: MUTED })
    }
    sign(t('report.author'), meta.author, MARGIN)
    sign(t('report.teacher'), meta.teacher, MARGIN + CONTENT_W / 2 + 10)
    L.y += 30
  }

  // Колонтитули — коли відома кількість сторінок
  const pages = doc.getPages()
  pages.forEach((page, i) => {
    const y = MARGIN - 6
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: PAGE_W - MARGIN, y: y + 12 },
      thickness: 0.5,
      color: RULE,
    })
    const left = [t('app.title'), meta.subject.trim()].filter(Boolean).join(' · ')
    page.drawText(left, { x: MARGIN, y, size: SMALL, font: regular, color: MUTED })
    const right = t('report.page')
      .replace('{n}', String(i + 1))
      .replace('{m}', String(pages.length))
    page.drawText(right, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(right, SMALL),
      y,
      size: SMALL,
      font: regular,
      color: MUTED,
    })
  })

  return doc.save()
}

interface SectionContext extends ReportOptions {
  fmtT: (celsius: number) => string
  tUnit: string
}

async function drawFileSection(L: Layout, file: ReportFile, index: number, ctx: SectionContext) {
  const { locale, units, t, fmtT } = ctx
  const { thermogram } = file
  const ir = thermogram.ir
  const info = thermogram.info
  const model = temperatureModel(ir, file.overrides)
  const params = objectParams(ir.params, file.overrides)
  const temps = frameTemperatures(ir, model)

  L.heading(`${t('report.thermogram')} ${index + 1}. ${file.name}`, 12)
  L.rule()
  L.y += 8

  // Кадр як у переглядачі: палітра, шкала, ізотерми
  const rgba = renderFrame(ir.ad, palette(file.paletteId), file.scale)
  const isotherms = file.isotherms
    .map((s, k) => ({ state: s, number: k + 1, iso: toIsotherm(s) }))
    .filter((i) => i.state.enabled && isValidIsotherm(i.iso))
  const counts = paintIsotherms(
    temps,
    rgba,
    isotherms.map((i) => i.iso),
  )
  const results = measureObjects(ir, file.objects, file.overrides)

  // Розміщення: ІЧ (+ шкала праворуч) і фото поруч; без фото — ІЧ ширше
  const photo = file.thermogram.visibleJpeg
  const barW = 9
  const barGap = 4
  const labelW = 48
  const gap = 14
  const irBoxW = photo ? (CONTENT_W - gap) / 2 : CONTENT_W * 0.72
  const maxH = photo ? 210 : 300
  let irW = irBoxW - barGap - barW - labelW
  let irH = (irW * ir.height) / ir.width
  if (irH > maxH) {
    irH = maxH
    irW = (irH * ir.width) / ir.height
  }
  // Фото — JPEG із файлу як є; якщо pdf-lib його не розбирає, звіт без фото
  let photoImage: Awaited<ReturnType<PDFDocument['embedJpg']>> | null = null
  if (photo) {
    try {
      photoImage = await L.doc.embedJpg(photo)
    } catch {
      photoImage = null
    }
  }
  let photoW = 0
  let photoH = 0
  if (photoImage) {
    photoW = irBoxW
    photoH = (photoW * photoImage.height) / photoImage.width
    if (photoH > maxH) {
      photoH = maxH
      photoW = (photoH * photoImage.width) / photoImage.height
    }
  }
  const rowH = Math.max(irH, photoH)
  L.ensure(rowH + 30)
  const top = L.y
  const irX = MARGIN
  const page = L.page

  drawRgb(page, embedRgb(L.doc, rgbaToRgb(rgba), ir.width, ir.height), irX, L.pdfY(top + irH), irW, irH)
  drawOverlay(L, file, results, model, irX, top, irW / ir.width, ctx)
  drawColorBar(L, file, irX + irW + barGap, top, barW, irH, ctx)

  if (photoImage) {
    const px = MARGIN + irBoxW + gap + (irBoxW - photoW) / 2
    page.drawImage(photoImage, { x: px, y: L.pdfY(top + photoH), width: photoW, height: photoH })
  }
  L.y = top + rowH + 3
  const scaleNote = file.manualScale ? t('report.scale.manual') : t('report.scale.auto')
  L.text(
    `${t('report.irImage')}: ${t('palette.title').toLocaleLowerCase(locale)} «${t(`palette.${file.paletteId}`)}», ${scaleNote}`,
    irX,
    L.y,
    SMALL,
    { color: MUTED },
  )
  if (photoImage) L.text(t('report.photo'), MARGIN + irBoxW + gap, L.y, SMALL, { color: MUTED })
  L.y += SMALL * LINE + 10

  // Параметри зйомки й розрахунку — дві пари «назва — значення» в рядку, як в оригіналі
  let sum = 0
  let n = 0
  for (const v of temps) {
    if (!Number.isNaN(v)) {
      sum += v
      n++
    }
  }
  const extremes = frameExtremes(ir)
  const range = measurementRange(ir.params.tempRange)
  const lengthUnit = LENGTH_SYMBOL[units.length][locale]
  const param = (key: (typeof PARAM_FIELDS)[number]) => {
    const value = formatNumber(displayValue(key, params[key], units), locale, paramDigits(key))
    const unit =
      key === 'emissivity'
        ? ''
        : key === 'humidity'
          ? ' %'
          : key === 'distance'
            ? ` ${lengthUnit}`
            : ` ${ctx.tUnit}`
    return `${value}${unit}${key in file.overrides ? ` (${t('params.fromFile')}: ${formatNumber(displayValue(key, objectParams(ir.params)[key], units), locale, paramDigits(key))})` : ''}`
  }
  const camera = [info.producer, info.model].filter(Boolean).join(' ')
  const pairs: [string, string][] = [
    [t('info.date'), formatSavedAt(info.savedAt)],
    [t('params.emissivity'), param('emissivity')],
    [t('info.camera'), [camera, info.serial ? `№ ${info.serial}` : ''].filter(Boolean).join(', ') || '—'],
    [t('params.reflectedTemp'), param('reflectedTemp')],
    [t('info.frame'), `${ir.width} × ${ir.height}`],
    [t('params.airTemp'), param('airTemp')],
    [
      t('info.range'),
      `${formatNumber(fromCelsius(range.min, units.temperature), locale, 0)} … ${formatNumber(fromCelsius(range.max, units.temperature), locale, 0)} ${ctx.tUnit}`,
    ],
    [t('params.humidity'), param('humidity')],
    [t('info.frameMax'), fmtT(model.toCelsius(extremes.max.ad))],
    [t('params.distance'), param('distance')],
    [t('info.frameMin'), fmtT(model.toCelsius(extremes.min.ad))],
    [t('params.tau'), formatNumber(model.tau, locale, 3)],
    [t('report.frameAvg'), n > 0 ? fmtT(sum / n) : '—'],
    ['', ''],
  ]
  L.heading(t('report.parameters'), 10)
  const rows: Cell[][] = []
  for (let i = 0; i < pairs.length; i += 2) {
    const [a, b] = [pairs[i]!, pairs[i + 1]!]
    rows.push([{ text: a[0], bold: true }, { text: a[1] }, { text: b[0], bold: true }, { text: b[1] }])
  }
  const half = CONTENT_W / 2
  L.table([88, half - 88, 132, half - 132], null, rows)
  if (Object.keys(file.overrides).length > 0) {
    L.y += 2
    L.paragraph(t('report.changedParams'), SMALL, { color: MUTED })
  }

  // Ізотерми
  if (isotherms.length > 0) {
    L.y += 8
    L.heading(t('isotherm.section'), 10)
    isotherms.forEach((i, k) => {
      const { lo, hi } = isothermBounds(i.iso)
      const bounds =
        i.iso.mode === 'above' ? fmtT(lo) : i.iso.mode === 'below' ? fmtT(hi) : `${fmtT(lo)} … ${fmtT(hi)}`
      const share = formatNumber(((counts[k] ?? 0) / ir.ad.length) * 100, locale, 1)
      L.ensure(BODY * LINE)
      L.page.drawRectangle({
        x: MARGIN,
        y: L.pdfY(L.y + BODY),
        width: 9,
        height: 9,
        color: hexColor(i.state.color),
        borderColor: INK,
        borderWidth: 0.4,
      })
      L.text(
        `${t('isotherm.title')} ${i.number}: ${t(`isotherm.${i.iso.mode}`).toLocaleLowerCase(locale)} ${bounds} — ${t('isotherm.share').toLocaleLowerCase(locale)} ${share} %`,
        MARGIN + 14,
        L.y,
      )
      L.y += BODY * LINE + 2
    })
  }

  // Результати вимірювань
  L.y += 8
  L.heading(t('report.results'), 10)
  if (results.length === 0) {
    L.paragraph(t('report.noObjects'), BODY, { color: MUTED })
  } else {
    const unitOf = (key: (typeof PARAM_FIELDS)[number]) =>
      key === 'emissivity'
        ? ''
        : key === 'humidity'
          ? ', %'
          : key === 'distance'
            ? `, ${lengthUnit}`
            : `, ${ctx.tUnit}`
    const header: Cell[] = [
      { text: t('results.object'), bold: true },
      { text: `${t('results.value')}, ${ctx.tUnit}`, bold: true },
      { text: `${t('results.max')}, ${ctx.tUnit}`, bold: true },
      { text: `${t('results.min')}, ${ctx.tUnit}`, bold: true },
      ...PARAM_FIELDS.map((k) => ({ text: `${t(`results.${k}`)}${unitOf(k)}`, bold: true })),
      { text: t('results.pixels'), bold: true },
      { text: t('results.note'), bold: true },
    ]
    const num = (c: number) =>
      Number.isNaN(c) ? '—' : formatNumber(fromCelsius(c, units.temperature), locale, 1)
    const body = results.map((r): Cell[] => {
      const point = r.object.shape.kind === 'point'
      const flag = r.status !== 'ok' ? ACCENT : undefined
      return [
        { text: r.object.name, bold: true },
        { text: num(r.value), align: 'right', color: flag, bold: flag !== undefined },
        { text: point ? '' : num(r.stats.max), align: 'right', color: flag },
        { text: point ? '' : num(r.stats.min), align: 'right', color: flag },
        ...PARAM_FIELDS.map((k): Cell => ({
          text: formatNumber(displayValue(k, r.params[k], units), locale, paramDigits(k)),
          align: 'right',
          bold: k in r.object.overrides,
        })),
        { text: String(r.stats.count), align: 'right' },
        { text: rowNote(r, t), color: flag },
      ]
    })
    L.table([38, 46, 42, 42, 30, 44, 44, 34, 34, 42, CONTENT_W - 396], header, body)
    const notes = [
      results.some((r) => r.ownParams) ? t('report.ownParams') : '',
      results.some((r) => r.status !== 'ok') ? t('report.flagged') : '',
    ].filter(Boolean)
    if (notes.length > 0) {
      L.y += 2
      L.paragraph(notes.join(' '), SMALL, { color: MUTED })
    }
  }

  // Профілі ліній
  for (const r of results) {
    if (r.object.shape.kind !== 'line') continue
    L.y += 8
    L.ensure(150)
    L.heading(`${t('report.profile')} ${r.object.name}`, 10)
    drawProfile(L, lineProfile(ir, r.object, file.overrides), ctx)
  }

  // Розподіл температур прямокутників (5 діапазонів, як у застосунку)
  for (const r of results) {
    if (r.object.shape.kind !== 'rect') continue
    L.y += 8
    L.ensure(140)
    L.heading(`${t('distribution.title')} ${r.object.name}`, 10)
    drawDistribution(L, areaDistribution(ir, r.object, file.overrides), file.paletteId, ctx)
  }

  // Коментар і примітка з камери
  if (file.comment.trim()) {
    L.y += 8
    L.heading(t('report.comment'), 10)
    L.paragraph(file.comment)
  }
  const note = thermogram.userText ? decodeUserText(thermogram.userText).trim() : ''
  if (note) {
    L.y += 8
    L.heading(t('info.note'), 10)
    L.paragraph(note)
  }
}

/** Об'єкти, Max/Min усередині них і маркери Max/Min кадру поверх ІЧ-зображення. */
function drawOverlay(
  L: Layout,
  file: ReportFile,
  results: readonly ResultRow[],
  model: ReturnType<typeof temperatureModel>,
  x0: number,
  top: number,
  k: number,
  ctx: SectionContext,
) {
  const page = L.page
  const ir = file.thermogram.ir
  const X = (x: number) => x0 + x * k
  const Y = (y: number) => L.pdfY(top + y * k)
  /** Центр пікселя кадру. */
  const cx = (x: number) => X(x + 0.5)
  const cy = (y: number) => Y(y + 0.5)
  const line = (ax: number, ay: number, bx: number, by: number, color: Color, thickness = 1) =>
    page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness, color })
  const label = (text: string, x: number, y: number) => outlinedText(page, text, x, y, SMALL, L.bold, WHITE)

  for (const o of file.objects) {
    const sh = o.shape
    if (sh.kind === 'point') {
      const x = cx(sh.x)
      const y = cy(sh.y)
      line(x - 4, y - 4, x + 4, y + 4, SHAPE)
      line(x - 4, y + 4, x + 4, y - 4, SHAPE)
      label(o.name, x + 5, y - 10)
    } else if (sh.kind === 'rect') {
      page.drawRectangle({
        x: X(sh.x0),
        y: Y(sh.y1 + 1),
        width: (sh.x1 - sh.x0 + 1) * k,
        height: (sh.y1 - sh.y0 + 1) * k,
        borderColor: SHAPE,
        borderWidth: 1,
      })
      label(o.name, X(sh.x0) + 3, Y(sh.y0) - 9)
    } else {
      line(cx(sh.x0), cy(sh.y0), cx(sh.x1), cy(sh.y1), SHAPE)
      label(o.name, cx(sh.x0) + 4, cy(sh.y0) + 4)
    }
  }
  const cross = (x: number, y: number, color: Color, size: number) => {
    line(x - size, y, x + size, y, color, 1)
    line(x, y - size, x, y + size, color, 1)
  }
  for (const r of results) {
    if (r.object.shape.kind === 'point' || r.stats.maxAt < 0) continue
    cross(cx(r.stats.maxAt % ir.width), cy(Math.floor(r.stats.maxAt / ir.width)), MAX_MARK, 3.5)
    cross(cx(r.stats.minAt % ir.width), cy(Math.floor(r.stats.minAt / ir.width)), MIN_MARK, 3.5)
  }
  if (file.showExtremes) {
    const extremes = frameExtremes(ir)
    for (const kind of ['max', 'min'] as const) {
      const p = extremes[kind]
      const x = cx(p.x)
      const y = cy(p.y)
      const color = kind === 'max' ? MAX_MARK : MIN_MARK
      page.drawCircle({ x, y, size: 4, borderColor: color, borderWidth: 1 })
      line(x - 7, y, x - 2.5, y, color)
      line(x + 2.5, y, x + 7, y, color)
      line(x, y - 7, x, y - 2.5, color)
      line(x, y + 2.5, x, y + 7, color)
      const text = `${kind === 'max' ? 'Max' : 'Min'} ${ctx.fmtT(model.toCelsius(p.ad))}`
      const w = L.bold.widthOfTextAtSize(text, SMALL)
      // Підпис праворуч від маркера, біля правого краю — ліворуч
      const tx = x + 8 + w > X(ir.width) ? x - 8 - w : x + 8
      const ty = y + 5 > Y(0) - SMALL ? y - 12 : y + 5
      label(text, tx, ty)
    }
  }
}

/** Кольорова шкала (гаряче — вгорі) зі смугами ізотерм і підписами меж. */
function drawColorBar(
  L: Layout,
  file: ReportFile,
  x: number,
  top: number,
  width: number,
  height: number,
  ctx: SectionContext,
) {
  const rgbPalette = palette(file.paletteId)
  const strip = new Uint8Array(256 * 3)
  for (let row = 0; row < 256; row++)
    strip.set(rgbPalette.subarray(3 * (255 - row), 3 * (256 - row)), 3 * row)
  drawRgb(L.page, embedRgb(L.doc, strip, 1, 256), x, L.pdfY(top + height), width, height)
  const { min, max } = file.scaleLabels
  const span = max - min
  file.isotherms.forEach((s) => {
    const iso = toIsotherm(s)
    if (!s.enabled || !isValidIsotherm(iso) || !(span > 0)) return
    const { lo, hi } = isothermBounds(iso)
    if (hi < min || lo > max) return
    const clamp = (v: number) => Math.min(1, Math.max(0, (v - min) / span))
    const a = clamp(lo)
    const b = clamp(hi)
    L.page.drawRectangle({
      x,
      y: L.pdfY(top + height) + a * height,
      width,
      height: Math.max(1, (b - a) * height),
      color: hexColor(s.color),
    })
  })
  L.page.drawRectangle({ x, y: L.pdfY(top + height), width, height, borderColor: INK, borderWidth: 0.4 })
  L.text(ctx.fmtT(max), x + width + 3, top, SMALL)
  L.text(ctx.fmtT(min), x + width + 3, top + height - SMALL, SMALL)
}

/** Графік профілю лінії: температура вздовж лінії (від початку до кінця). */
function drawProfile(L: Layout, points: ReturnType<typeof lineProfile>, ctx: SectionContext) {
  const { units, locale } = ctx
  const values = points.map((p) => fromCelsius(p.t, units.temperature))
  const finite = values.filter((v) => Number.isFinite(v))
  const height = 120
  const left = MARGIN + 40
  const width = CONTENT_W - 50
  const top = L.y
  if (finite.length === 0) {
    L.paragraph('—')
    return
  }
  let lo = Math.min(...finite)
  let hi = Math.max(...finite)
  if (hi - lo < 0.2) {
    lo -= 0.1
    hi += 0.1
  }
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  const yTicks = niceTicks(lo, hi, 5)
  const digits = tickDigits(yTicks)
  const xMax = Math.max(1, points.length - 1)
  const xTicks = niceTicks(0, xMax, 8).filter((v) => Number.isInteger(v))
  const X = (i: number) => left + (i / xMax) * width
  const Y = (v: number) => L.pdfY(top + height - ((v - lo) / (hi - lo)) * height)
  const page = L.page

  for (const v of yTicks) {
    page.drawLine({
      start: { x: left, y: Y(v) },
      end: { x: left + width, y: Y(v) },
      thickness: 0.4,
      color: RULE,
    })
    const text = formatNumber(v, locale, digits)
    page.drawText(text, {
      x: left - 4 - L.regular.widthOfTextAtSize(text, SMALL),
      y: Y(v) - SMALL * 0.35,
      size: SMALL,
      font: L.regular,
      color: MUTED,
    })
  }
  for (const v of xTicks) {
    const text = String(v + 1)
    page.drawText(text, {
      x: X(v) - L.regular.widthOfTextAtSize(text, SMALL) / 2,
      y: L.pdfY(top + height) - SMALL - 3,
      size: SMALL,
      font: L.regular,
      color: MUTED,
    })
  }
  page.drawRectangle({
    x: left,
    y: L.pdfY(top + height),
    width,
    height,
    borderColor: MUTED,
    borderWidth: 0.5,
  })
  // Ламана (drawSvgPath: початок — лівий верхній кут області, y — вниз); пропуски — пікселі поза калібруванням
  let path = ''
  let pen = false
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false
      return
    }
    path += `${pen ? 'L' : 'M'} ${((i / xMax) * width).toFixed(2)} ${(((hi - v) / (hi - lo)) * height).toFixed(2)} `
    pen = true
  })
  if (path) page.drawSvgPath(path, { x: left, y: L.pdfY(top), borderColor: ACCENT, borderWidth: 1.2 })
  L.text(`T, ${ctx.tUnit}`, MARGIN, top - 2, SMALL, { color: MUTED })
  L.y = top + height + SMALL + 6
  L.text(
    ctx.t('report.profileAxis'),
    left + width - L.regular.widthOfTextAtSize(ctx.t('report.profileAxis'), SMALL),
    L.y,
    SMALL,
    {
      color: MUTED,
    },
  )
  L.y += SMALL * LINE + 4
}

/** Стовпчикова діаграма розподілу: стовпець k залито кольором середини k-ї частини палітри (як у застосунку). */
function drawDistribution(
  L: Layout,
  bins: readonly TemperatureBin[],
  paletteId: PaletteId,
  ctx: SectionContext,
) {
  const { units, locale } = ctx
  if (bins.length === 0) {
    L.paragraph(ctx.t('distribution.noData'), BODY, { color: MUTED })
    return
  }
  const height = 100
  const left = MARGIN + 40
  const width = CONTENT_W - 50
  const top = L.y + 10
  const page = L.page
  const rgbPalette = palette(paletteId)
  const total = bins.reduce((sum, b) => sum + b.count, 0)
  const peak = Math.max(1, ...bins.map((b) => b.count))
  const ticks = niceTicks(0, peak, 4).filter(Number.isInteger)
  const yMax = Math.max(peak, ticks.at(-1) ?? 1)
  const Y = (n: number) => L.pdfY(top + height - (n / yMax) * height)
  const slot = width / bins.length
  const barW = slot * 0.7

  for (const n of ticks) {
    page.drawLine({
      start: { x: left, y: Y(n) },
      end: { x: left + width, y: Y(n) },
      thickness: 0.4,
      color: RULE,
    })
    const text = formatNumber(n, locale, 0)
    page.drawText(text, {
      x: left - 4 - L.regular.widthOfTextAtSize(text, SMALL),
      y: Y(n) - SMALL * 0.35,
      size: SMALL,
      font: L.regular,
      color: MUTED,
    })
  }
  const temp = (c: number) => formatNumber(fromCelsius(c, units.temperature), locale, 1)
  bins.forEach((b, k) => {
    const i = 3 * Math.round(((k + 0.5) / bins.length) * 255)
    const x = left + slot * k + (slot - barW) / 2
    if (b.count > 0) {
      page.drawRectangle({
        x,
        y: Y(0),
        width: barW,
        height: Y(b.count) - Y(0),
        color: rgb(rgbPalette[i]! / 255, rgbPalette[i + 1]! / 255, rgbPalette[i + 2]! / 255),
        borderColor: INK,
        borderWidth: 0.3,
      })
    }
    const share = formatNumber(total ? (b.count / total) * 100 : 0, locale, 1)
    const label = `${b.count} (${share} %)`
    page.drawText(label, {
      x: x + barW / 2 - L.regular.widthOfTextAtSize(label, SMALL) / 2,
      y: Y(b.count) + 3,
      size: SMALL,
      font: L.regular,
      color: INK,
    })
    const range = `${temp(b.from)} … ${temp(b.to)}`
    page.drawText(range, {
      x: x + barW / 2 - L.regular.widthOfTextAtSize(range, SMALL) / 2,
      y: Y(0) - SMALL - 3,
      size: SMALL,
      font: L.regular,
      color: MUTED,
    })
  })
  page.drawLine({
    start: { x: left, y: Y(0) },
    end: { x: left + width, y: Y(0) },
    thickness: 0.6,
    color: MUTED,
  })
  L.text(ctx.t('results.pixels'), MARGIN, top - 10, SMALL, { color: MUTED })
  L.y = top + height + SMALL + 6
  const axis = `T, ${ctx.tUnit}`
  L.text(axis, left + width - L.regular.widthOfTextAtSize(axis, SMALL), L.y, SMALL, { color: MUTED })
  L.y += SMALL * LINE + 4
}
