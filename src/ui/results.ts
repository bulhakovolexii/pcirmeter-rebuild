/** Результати вимірювань об'єктів і їхній експорт у CSV — без DOM. */

import {
  objectPixels,
  pixelStats,
  temperatureBins,
  type PixelStats,
  type Shape,
  type TemperatureBin,
} from '../core/objects'
import type { IrImage } from '../core/parser'
import {
  frameTemperatures,
  measurementRange,
  objectParams,
  temperatureModel,
  type ObjectParams,
} from '../core/temperature'
import { fromCelsius, type TemperatureUnit } from '../core/units'
import type { Locale } from '../i18n'
import type { MessageKey } from '../i18n/uk'
import { LENGTH_SYMBOL, TEMPERATURE_SYMBOL, type TemperatureStatus } from './format'
import { displayValue, paramDigits, PARAM_FIELDS, type Units } from './params'
import type { MeasureObject } from './tools'

export interface ResultRow {
  object: MeasureObject
  /** Параметри, з якими виміряно: файл ← зміни кадру ← зміни об'єкта. */
  params: ObjectParams
  /** Чи має об'єкт власні параметри. */
  ownParams: boolean
  stats: PixelStats
  /** T точки або середнє прямокутника/лінії, °C. */
  value: number
  /** `no-calibration` — хоча б один піксель поза калібруванням; `out-of-range` — max/min поза діапазоном камери. */
  status: TemperatureStatus
}

/**
 * Виміряти всі об'єкти. Кадр температур обчислюється один раз на кожен набір параметрів
 * (зазвичай один — параметри кадру).
 */
export function measureObjects(
  ir: IrImage,
  objects: readonly MeasureObject[],
  frameOverrides: Partial<ObjectParams> = {},
): ResultRow[] {
  const range = measurementRange(ir.params.tempRange)
  const frames = new Map<string, Float32Array>()
  return objects.map((object) => {
    const overrides = { ...frameOverrides, ...object.overrides }
    const params = objectParams(ir.params, overrides)
    const key = JSON.stringify(params)
    let temps = frames.get(key)
    if (!temps) {
      temps = frameTemperatures(ir, temperatureModel(ir, overrides))
      frames.set(key, temps)
    }
    const stats = pixelStats(temps, objectPixels(object.shape, ir.width, ir.height))
    const status: TemperatureStatus =
      stats.invalid > 0
        ? 'no-calibration'
        : stats.max > range.max || stats.min < range.min
          ? 'out-of-range'
          : 'ok'
    return {
      object,
      params,
      ownParams: Object.keys(object.overrides).length > 0,
      stats,
      value: object.shape.kind === 'point' ? stats.max : stats.avg,
      status,
    }
  })
}

/** Точка профілю лінії: піксель кадру і його температура, °C (`NaN` — поза калібруванням). */
export interface ProfilePoint {
  x: number
  y: number
  t: number
}

/**
 * Профіль лінії від початку до кінця (точки — `objectPixels`, як у таблиці результатів),
 * з параметрами об'єкта поверх параметрів кадру.
 */
export function lineProfile(
  ir: IrImage,
  object: MeasureObject,
  frameOverrides: Partial<ObjectParams> = {},
): ProfilePoint[] {
  const model = temperatureModel(ir, { ...frameOverrides, ...object.overrides })
  return Array.from(objectPixels(object.shape, ir.width, ir.height), (i) => ({
    x: i % ir.width,
    y: Math.floor(i / ir.width),
    t: model.toCelsius(ir.ad[i]!),
  }))
}

/** Кількість діапазонів розподілу температур прямокутника — як в оригіналі. */
export const DISTRIBUTION_BINS = 5

/**
 * Розподіл температур прямокутника (кількість пікселів у рівних діапазонах між його min і max),
 * з параметрами об'єкта поверх параметрів кадру — ті самі min/max, що в таблиці результатів.
 */
export function areaDistribution(
  ir: IrImage,
  object: MeasureObject,
  frameOverrides: Partial<ObjectParams> = {},
  bins = DISTRIBUTION_BINS,
): TemperatureBin[] {
  const temps = frameTemperatures(ir, temperatureModel(ir, { ...frameOverrides, ...object.overrides }))
  return temperatureBins(temps, objectPixels(object.shape, ir.width, ir.height), bins)
}

/** Координати фігури в пікселях кадру: `x, y` або `x0, y0 – x1, y1`. */
export function shapeCoords(shape: Shape): string {
  return shape.kind === 'point'
    ? `${shape.x}, ${shape.y}`
    : `${shape.x0}, ${shape.y0} – ${shape.x1}, ${shape.y1}`
}

/** Число для CSV: без розділювача тисяч, десяткова кома для uk (так його розпізнає Excel з укр. налаштуваннями). */
function csvNumber(value: number, locale: Locale, digits: number): string {
  if (Number.isNaN(value)) return ''
  const s = value.toFixed(digits)
  return locale === 'uk' ? s.replace('.', ',') : s
}

function csvCell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Таблиця для Excel: UTF-8 з BOM, роздільник `;`, рядки — CRLF. */
function csvTable(lines: readonly (readonly string[])[]): string {
  return '\uFEFF' + lines.map((cells) => cells.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

const PARAM_HEADER: Record<(typeof PARAM_FIELDS)[number], MessageKey> = {
  emissivity: 'results.emissivity',
  reflectedTemp: 'results.reflectedTemp',
  airTemp: 'results.airTemp',
  humidity: 'results.humidity',
  distance: 'results.distance',
}

/**
 * Таблиця результатів у CSV для Excel: UTF-8 з BOM, роздільник `;`, рядки — CRLF.
 * Температури — в одиницях показу з одним знаком, параметри — з точністю полів форми.
 */
export function resultsCsv(
  rows: readonly ResultRow[],
  locale: Locale,
  units: Units,
  t: (key: MessageKey) => string,
): string {
  const tUnit = TEMPERATURE_SYMBOL[units.temperature]
  const paramUnit = (key: (typeof PARAM_FIELDS)[number]) =>
    key === 'emissivity'
      ? ''
      : key === 'humidity'
        ? ', %'
        : key === 'distance'
          ? `, ${LENGTH_SYMBOL[units.length][locale]}`
          : `, ${tUnit}`
  const header = [
    t('results.object'),
    `${t('results.value')}, ${tUnit}`,
    `${t('results.max')}, ${tUnit}`,
    `${t('results.min')}, ${tUnit}`,
    ...PARAM_FIELDS.map((k) => `${t(PARAM_HEADER[k])}${paramUnit(k)}`),
    t('results.coords'),
    t('results.pixels'),
    t('results.note'),
  ]
  const temp = (c: number) => csvNumber(fromCelsius(c, units.temperature), locale, 1)
  const lines = [header]
  for (const r of rows) {
    const point = r.object.shape.kind === 'point'
    lines.push([
      r.object.name,
      temp(r.value),
      point ? '' : temp(r.stats.max),
      point ? '' : temp(r.stats.min),
      ...PARAM_FIELDS.map((k) => csvNumber(displayValue(k, r.params[k], units), locale, paramDigits(k))),
      shapeCoords(r.object.shape),
      String(r.stats.count),
      r.status === 'out-of-range'
        ? t('cursor.outOfRange')
        : r.status === 'no-calibration'
          ? t('cursor.noCalibration')
          : '',
    ])
  }
  return csvTable(lines)
}

/** Профіль лінії в CSV (формат як у `resultsCsv`): №, x, y, T в одиницях показу. */
export function profileCsv(
  points: readonly ProfilePoint[],
  locale: Locale,
  unit: TemperatureUnit,
  t: (key: MessageKey) => string,
): string {
  const header = [t('profile.index'), 'x', 'y', `T, ${TEMPERATURE_SYMBOL[unit]}`]
  return csvTable([
    header,
    ...points.map((p, k) => [
      String(k + 1),
      String(p.x),
      String(p.y),
      csvNumber(fromCelsius(p.t, unit), locale, 1),
    ]),
  ])
}

/** Розподіл температур у CSV (формат як у `resultsCsv`): від, до (в одиницях показу), пікселів, частка %. */
export function distributionCsv(
  bins: readonly TemperatureBin[],
  locale: Locale,
  unit: TemperatureUnit,
  t: (key: MessageKey) => string,
): string {
  const symbol = TEMPERATURE_SYMBOL[unit]
  const total = bins.reduce((sum, b) => sum + b.count, 0)
  const temp = (c: number) => csvNumber(fromCelsius(c, unit), locale, 1)
  return csvTable([
    [
      `${t('distribution.from')}, ${symbol}`,
      `${t('distribution.to')}, ${symbol}`,
      t('results.pixels'),
      t('distribution.share'),
    ],
    ...bins.map((b) => [
      temp(b.from),
      temp(b.to),
      String(b.count),
      csvNumber(total ? (b.count / total) * 100 : 0, locale, 1),
    ]),
  ])
}
