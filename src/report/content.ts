/**
 * Зміст звіту, спільний для PDF і ODT (docs/spec/report.md): титул, тексти й таблиці розділу термограми.
 * Без DOM і без бібліотек формату — генератори лише розкладають це на сторінці.
 */

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
  type TemperatureModel,
} from '../core/temperature'
import { fromCelsius } from '../core/units'
import type { Locale } from '../i18n'
import type { MessageKey } from '../i18n/uk'
import { decodeUserText } from '../ui/attachments'
import {
  formatNumber,
  formatShare,
  formatSavedAt,
  formatTemperature,
  LENGTH_SYMBOL,
  TEMPERATURE_SYMBOL,
} from '../ui/format'
import { toIsotherm, type IsothermState } from '../ui/isotherms'
import { displayValue, paramDigits, PARAM_FIELDS, type Units } from '../ui/params'
import {
  areaDistribution,
  lineProfile,
  measureObjects,
  rowNote,
  type ProfilePoint,
  type ResultRow,
} from '../ui/results'
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

export interface ReportOptions {
  locale: Locale
  units: Units
  t: (key: MessageKey) => string
}

export type ReportFormat = 'pdf' | 'odt'

// A4, пункти (1 pt = 1/72″); поля ≈ 15 мм — спільні для PDF і ODT
export const PAGE_W = 595.28
export const PAGE_H = 841.89
export const MARGIN = 42
export const CONTENT_W = PAGE_W - 2 * MARGIN

/** Ширини колонок таблиць, pt. */
export const TITLE_COLUMNS = [140, CONTENT_W - 140]
export const PARAM_COLUMNS = [88, CONTENT_W / 2 - 88, 132, CONTENT_W / 2 - 132]
export const RESULT_COLUMNS = [38, 46, 42, 42, 30, 44, 44, 34, 34, 42, CONTENT_W - 396]

export interface Cell {
  text: string
  bold?: boolean
  /** Значення поза діапазоном / калібруванням — виділяється кольором. */
  flag?: boolean
  align?: 'left' | 'right'
}

/** Ім'я файлу звіту: `<об'єкт або «звіт»>_<дата>.<формат>`, без символів, заборонених у файлових системах. */
export function reportFileName(
  meta: ReportMeta,
  t: (key: MessageKey) => string,
  format: ReportFormat = 'pdf',
): string {
  const base = (meta.subject.trim() || t('report.fileName')).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60)
  return `${base}_${meta.date || 'report'}.${format}`
}

/** Назва документа (метадані): «Звіт…: <об'єкт>». */
export function documentTitle(meta: ReportMeta, t: (key: MessageKey) => string): string {
  const title = t('report.title')
  return meta.subject.trim() ? `${title}: ${meta.subject.trim()}` : title
}

/** Лівий колонтитул: «<застосунок> · <об'єкт>». */
export function footerText(meta: ReportMeta, t: (key: MessageKey) => string): string {
  return [t('app.title'), meta.subject.trim()].filter(Boolean).join(' · ')
}

/** Заповнені титульні поля «назва — значення» (дата — довгим форматом мови звіту). */
export function titleRows(meta: ReportMeta, { locale, t }: ReportOptions): [string, string][] {
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(meta.date)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(`${meta.date}T00:00:00Z`),
      )
    : meta.date
  const rows: [string, string][] = [
    [t('report.subject'), meta.subject],
    [t('report.author'), meta.author],
    [t('report.group'), meta.group],
    [t('report.teacher'), meta.teacher],
    [t('report.date'), reportDate],
  ]
  return rows.filter(([, v]) => v.trim())
}

/** Чи потрібен блок «Висновок + підписи» наприкінці звіту. */
export function hasClosing(meta: ReportMeta): boolean {
  return Boolean(meta.conclusion.trim() || meta.author.trim() || meta.teacher.trim())
}

export interface SectionContext extends ReportOptions {
  fmtT: (celsius: number) => string
  tUnit: string
}

export function sectionContext(options: ReportOptions): SectionContext {
  return {
    ...options,
    fmtT: (c) => formatTemperature(c, options.locale, options.units.temperature),
    tUnit: TEMPERATURE_SYMBOL[options.units.temperature],
  }
}

export interface IsothermLine {
  color: string
  text: string
}

/** Усе, що звіт показує про одну термограму. */
export interface FileSection {
  file: ReportFile
  heading: string
  model: TemperatureModel
  results: ResultRow[]
  /** Кадр RGBA як у переглядачі: палітра, шкала, ізотерми. */
  frame: Uint8ClampedArray
  imageCaption: string
  /** Чотири колонки: назва — значення — назва — значення. */
  params: Cell[][]
  changedParams: string
  isotherms: IsothermLine[]
  /** `null` — об'єктів немає (тоді `noObjects`). */
  resultsTable: { header: Cell[]; rows: Cell[][] } | null
  resultNotes: string
  profiles: { title: string; points: ProfilePoint[] }[]
  distributions: { title: string; bins: TemperatureBin[] }[]
  comment: string
  cameraNote: string
}

export function fileSection(file: ReportFile, index: number, ctx: SectionContext): FileSection {
  const { locale, units, t, fmtT } = ctx
  const { thermogram } = file
  const ir = thermogram.ir
  const info = thermogram.info
  const model = temperatureModel(ir, file.overrides)
  const params = objectParams(ir.params, file.overrides)
  const temps = frameTemperatures(ir, model)

  const frame = renderFrame(ir.ad, palette(file.paletteId), file.scale)
  const isotherms = file.isotherms
    .map((s, k) => ({ state: s, number: k + 1, iso: toIsotherm(s) }))
    .filter((i) => i.state.enabled && isValidIsotherm(i.iso))
  const counts = paintIsotherms(
    temps,
    frame,
    isotherms.map((i) => i.iso),
  )
  const results = measureObjects(ir, file.objects, file.overrides)

  const scaleNote = file.manualScale ? t('report.scale.manual') : t('report.scale.auto')
  const imageCaption = `${t('report.irImage')}: ${t('palette.title').toLocaleLowerCase(locale)} «${t(`palette.${file.paletteId}`)}», ${scaleNote}`

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
  const unitOf = (key: (typeof PARAM_FIELDS)[number], sep: string) =>
    key === 'emissivity'
      ? ''
      : key === 'humidity'
        ? `${sep}%`
        : key === 'distance'
          ? `${sep}${lengthUnit}`
          : `${sep}${ctx.tUnit}`
  const param = (key: (typeof PARAM_FIELDS)[number]) => {
    const value = formatNumber(displayValue(key, params[key], units), locale, paramDigits(key))
    return `${value}${unitOf(key, ' ')}${key in file.overrides ? ` (${t('params.fromFile')}: ${formatNumber(displayValue(key, objectParams(ir.params)[key], units), locale, paramDigits(key))})` : ''}`
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
  const paramRows: Cell[][] = []
  for (let i = 0; i < pairs.length; i += 2) {
    const [a, b] = [pairs[i]!, pairs[i + 1]!]
    paramRows.push([{ text: a[0], bold: true }, { text: a[1] }, { text: b[0], bold: true }, { text: b[1] }])
  }

  const isothermLines = isotherms.map((i, k): IsothermLine => {
    const { lo, hi } = isothermBounds(i.iso)
    const bounds =
      i.iso.mode === 'above' ? fmtT(lo) : i.iso.mode === 'below' ? fmtT(hi) : `${fmtT(lo)} … ${fmtT(hi)}`
    const share = formatShare((counts[k] ?? 0) / ir.ad.length, locale)
    return {
      color: i.state.color,
      text: `${t('isotherm.title')} ${i.number}: ${t(`isotherm.${i.iso.mode}`).toLocaleLowerCase(locale)} ${bounds} — ${t('isotherm.share').toLocaleLowerCase(locale)} ${share}`,
    }
  })

  let table: FileSection['resultsTable'] = null
  let resultNotes = ''
  if (results.length > 0) {
    const header: Cell[] = [
      { text: t('results.object'), bold: true },
      { text: `${t('results.value')}, ${ctx.tUnit}`, bold: true },
      { text: `${t('results.max')}, ${ctx.tUnit}`, bold: true },
      { text: `${t('results.min')}, ${ctx.tUnit}`, bold: true },
      ...PARAM_FIELDS.map((k) => ({ text: `${t(`results.${k}`)}${unitOf(k, ', ')}`, bold: true })),
      { text: t('results.pixels'), bold: true },
      { text: t('results.note'), bold: true },
    ]
    const num = (c: number) =>
      Number.isNaN(c) ? '—' : formatNumber(fromCelsius(c, units.temperature), locale, 1)
    const rows = results.map((r): Cell[] => {
      const point = r.object.shape.kind === 'point'
      const flag = r.status !== 'ok'
      return [
        { text: r.object.name, bold: true },
        { text: num(r.value), align: 'right', flag, bold: flag },
        { text: point ? '' : num(r.stats.max), align: 'right', flag },
        { text: point ? '' : num(r.stats.min), align: 'right', flag },
        ...PARAM_FIELDS.map((k): Cell => ({
          text: formatNumber(displayValue(k, r.params[k], units), locale, paramDigits(k)),
          align: 'right',
          bold: k in r.object.overrides,
        })),
        { text: String(r.stats.count), align: 'right' },
        { text: rowNote(r, t), flag },
      ]
    })
    table = { header, rows }
    resultNotes = [
      results.some((r) => r.ownParams) ? t('report.ownParams') : '',
      results.some((r) => r.status !== 'ok') ? t('report.flagged') : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return {
    file,
    heading: `${t('report.thermogram')} ${index + 1}. ${file.name}`,
    model,
    results,
    frame,
    imageCaption,
    params: paramRows,
    changedParams: Object.keys(file.overrides).length > 0 ? t('report.changedParams') : '',
    isotherms: isothermLines,
    resultsTable: table,
    resultNotes,
    profiles: results
      .filter((r) => r.object.shape.kind === 'line')
      .map((r) => ({
        title: `${t('report.profile')} ${r.object.name}`,
        points: lineProfile(ir, r.object, file.overrides),
      })),
    distributions: results
      .filter((r) => r.object.shape.kind === 'rect')
      .map((r) => ({
        title: `${t('distribution.title')} ${r.object.name}`,
        bins: areaDistribution(ir, r.object, file.overrides),
      })),
    comment: file.comment.trim(),
    cameraNote: thermogram.userText ? decodeUserText(thermogram.userText).trim() : '',
  }
}
