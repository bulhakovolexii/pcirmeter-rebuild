/**
 * Рисунки звіту як SVG (одиниці — пункти): ІЧ-кадр з накладеннями й шкалою, профіль лінії, розподіл.
 * Повторюють векторні рисунки PDF (`report.ts`); для ODT растеризуються в PNG, ІЧ-рисунок без шкали —
 * мініатюра в діалозі звіту. Без DOM.
 */

import { isothermBounds, isValidIsotherm } from '../core/isotherms'
import type { TemperatureBin } from '../core/objects'
import { palette, type PaletteId } from '../core/palettes'
import { frameExtremes } from '../core/render'
import { fromCelsius } from '../core/units'
import { niceTicks, tickDigits } from '../ui/chart'
import { formatNumber } from '../ui/format'
import { toIsotherm } from '../ui/isotherms'
import type { ProfilePoint } from '../ui/results'
import type { FileSection, SectionContext } from './content'

export interface Svg {
  svg: string
  /** Розмір рисунка, pt. */
  width: number
  height: number
}

const SMALL = 7.5
const LINE = 1.3
const INK = '#2a2a2a'
const MUTED = '#6b6b6b'
const ACCENT = '#a0001b'
const RULE = '#d1d1d1'
/** Кольори накладень — як у переглядачі (`Viewer.svelte`). */
const SHAPE = '#a6ff4d'
const MAX_MARK = '#ffffff'
const MIN_MARK = '#00ffff'
const FONT = "'Fira Sans', Arial, sans-serif"

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

const n = (v: number) => (Math.round(v * 100) / 100).toString()

function svgDocument(width: number, height: number, body: string, fontCss = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${n(width)}pt" height="${n(height)}pt" viewBox="0 0 ${n(width)} ${n(height)}" ` +
    `font-family="${escapeXml(FONT)}">` +
    (fontCss ? `<style>${fontCss}</style>` : '') +
    body +
    '</svg>'
  )
}

function text(
  value: string,
  x: number,
  y: number,
  opts: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; bold?: boolean } = {},
): string {
  return (
    `<text x="${n(x)}" y="${n(y)}" font-size="${opts.size ?? SMALL}" fill="${opts.fill ?? MUTED}"` +
    (opts.anchor && opts.anchor !== 'start' ? ` text-anchor="${opts.anchor}"` : '') +
    (opts.bold ? ' font-weight="600"' : '') +
    `>${escapeXml(value)}</text>`
  )
}

/** Підпис з чорним обведенням (як на зображенні в переглядачі). */
function outlined(value: string, x: number, y: number, anchor: 'start' | 'end' = 'start'): string {
  return (
    `<text x="${n(x)}" y="${n(y)}" font-size="${SMALL}" font-weight="600" fill="#fff" stroke="#000" ` +
    `stroke-width="1.4" stroke-linejoin="round" paint-order="stroke"` +
    (anchor === 'end' ? ' text-anchor="end"' : '') +
    `>${escapeXml(value)}</text>`
  )
}

const line = (ax: number, ay: number, bx: number, by: number, color: string, width = 1) =>
  `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${color}" stroke-width="${width}"/>`

export interface IrFigureOptions {
  /** PNG кадру (`data:` URL), як `section.frame`. */
  frameHref: string
  /** PNG смуги палітри 1×256, гаряче вгорі (`paletteStrip`); без нього — рисунок без шкали. */
  barHref?: string
  /** Ширина області кадру, pt. */
  width: number
  fontCss?: string
}

/** Смуга палітри для шкали: 1×256 RGBA, гаряче — вгорі. */
export function paletteStrip(paletteId: PaletteId): Uint8ClampedArray {
  const rgb = palette(paletteId)
  const out = new Uint8ClampedArray(256 * 4)
  for (let row = 0; row < 256; row++) {
    out.set(rgb.subarray(3 * (255 - row), 3 * (256 - row)), 4 * row)
    out[4 * row + 3] = 255
  }
  return out
}

/** ІЧ-кадр з об'єктами, хрестиками Max/Min і маркерами кадру; праворуч — шкала (якщо є `barHref`). */
export function irFigureSvg(section: FileSection, ctx: SectionContext, opts: IrFigureOptions): Svg {
  const { file, results, model } = section
  const ir = file.thermogram.ir
  const k = opts.width / ir.width
  const irW = opts.width
  const irH = ir.height * k
  const cx = (x: number) => (x + 0.5) * k
  const cy = (y: number) => (y + 0.5) * k
  const parts: string[] = [
    `<image x="0" y="0" width="${n(irW)}" height="${n(irH)}" preserveAspectRatio="none" ` +
      `image-rendering="pixelated" style="image-rendering:pixelated" href="${opts.frameHref}" xlink:href="${opts.frameHref}"/>`,
  ]
  for (const o of file.objects) {
    const sh = o.shape
    if (sh.kind === 'point') {
      const x = cx(sh.x)
      const y = cy(sh.y)
      parts.push(line(x - 4, y - 4, x + 4, y + 4, SHAPE), line(x - 4, y + 4, x + 4, y - 4, SHAPE))
      parts.push(outlined(o.name, x + 5, y + 10))
    } else if (sh.kind === 'rect') {
      parts.push(
        `<rect x="${n(sh.x0 * k)}" y="${n(sh.y0 * k)}" width="${n((sh.x1 - sh.x0 + 1) * k)}" ` +
          `height="${n((sh.y1 - sh.y0 + 1) * k)}" fill="none" stroke="${SHAPE}" stroke-width="1"/>`,
      )
      parts.push(outlined(o.name, sh.x0 * k + 3, sh.y0 * k + 9))
    } else {
      parts.push(line(cx(sh.x0), cy(sh.y0), cx(sh.x1), cy(sh.y1), SHAPE))
      parts.push(outlined(o.name, cx(sh.x0) + 4, cy(sh.y0) - 4))
    }
  }
  const cross = (x: number, y: number, color: string) =>
    line(x - 3.5, y, x + 3.5, y, color) + line(x, y - 3.5, x, y + 3.5, color)
  for (const r of results) {
    if (r.object.shape.kind === 'point' || r.stats.maxAt < 0) continue
    parts.push(cross(cx(r.stats.maxAt % ir.width), cy(Math.floor(r.stats.maxAt / ir.width)), MAX_MARK))
    parts.push(cross(cx(r.stats.minAt % ir.width), cy(Math.floor(r.stats.minAt / ir.width)), MIN_MARK))
  }
  if (file.showExtremes) {
    const extremes = frameExtremes(ir)
    for (const kind of ['max', 'min'] as const) {
      const p = extremes[kind]
      const x = cx(p.x)
      const y = cy(p.y)
      const color = kind === 'max' ? MAX_MARK : MIN_MARK
      parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="4" fill="none" stroke="${color}" stroke-width="1"/>`)
      parts.push(
        line(x - 7, y, x - 2.5, y, color),
        line(x + 2.5, y, x + 7, y, color),
        line(x, y - 7, x, y - 2.5, color),
        line(x, y + 2.5, x, y + 7, color),
      )
      const label = `${kind === 'max' ? 'Max' : 'Min'} ${ctx.fmtT(model.toCelsius(p.ad))}`
      // Підпис праворуч від маркера, біля правого краю — ліворуч; ширина — оцінка
      const w = label.length * SMALL * 0.55
      const right = x + 8 + w > irW
      const ty = y - 5 < SMALL ? y + 12 : y - 5
      parts.push(outlined(label, right ? x - 8 : x + 8, ty, right ? 'end' : 'start'))
    }
  }

  let width = irW
  if (opts.barHref) {
    const bx = irW + 4
    const bw = 9
    parts.push(
      `<image x="${n(bx)}" y="0" width="${bw}" height="${n(irH)}" preserveAspectRatio="none" ` +
        `href="${opts.barHref}" xlink:href="${opts.barHref}"/>`,
    )
    const { min, max } = file.scaleLabels
    const span = max - min
    for (const s of file.isotherms) {
      const iso = toIsotherm(s)
      if (!s.enabled || !isValidIsotherm(iso) || !(span > 0)) continue
      const { lo, hi } = isothermBounds(iso)
      if (hi < min || lo > max) continue
      const clamp = (v: number) => Math.min(1, Math.max(0, (v - min) / span))
      const a = clamp(lo)
      const b = clamp(hi)
      const h = Math.max(1, (b - a) * irH)
      parts.push(
        `<rect x="${n(bx)}" y="${n(irH - a * irH - h)}" width="${bw}" height="${n(h)}" fill="${escapeXml(s.color)}"/>`,
      )
    }
    parts.push(
      `<rect x="${n(bx)}" y="0" width="${bw}" height="${n(irH)}" fill="none" stroke="${INK}" stroke-width="0.4"/>`,
    )
    parts.push(text(ctx.fmtT(max), bx + bw + 3, SMALL * 0.8, { fill: INK }))
    parts.push(text(ctx.fmtT(min), bx + bw + 3, irH - SMALL * 0.2, { fill: INK }))
    width = bx + bw + 48
  }
  return { svg: svgDocument(width, irH, parts.join(''), opts.fontCss), width, height: irH }
}

/** Графік профілю лінії: температура вздовж лінії (від початку до кінця). */
export function profileSvg(
  points: readonly ProfilePoint[],
  ctx: SectionContext,
  width: number,
  fontCss?: string,
): Svg | null {
  const { units, locale } = ctx
  const values = points.map((p) => fromCelsius(p.t, units.temperature))
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return null
  const height = 120
  const left = 40
  const plotW = width - 50
  const top = 10
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
  const X = (i: number) => left + (i / xMax) * plotW
  const Y = (v: number) => top + height - ((v - lo) / (hi - lo)) * height
  const parts: string[] = []
  for (const v of yTicks) {
    parts.push(line(left, Y(v), left + plotW, Y(v), RULE, 0.4))
    parts.push(text(formatNumber(v, locale, digits), left - 4, Y(v) + SMALL * 0.35, { anchor: 'end' }))
  }
  for (const v of xTicks)
    parts.push(text(String(v + 1), X(v), top + height + SMALL + 3, { anchor: 'middle' }))
  parts.push(
    `<rect x="${left}" y="${top}" width="${n(plotW)}" height="${height}" fill="none" stroke="${MUTED}" stroke-width="0.5"/>`,
  )
  // Ламана; пропуски — пікселі поза калібруванням
  let path = ''
  let pen = false
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false
      return
    }
    path += `${pen ? 'L' : 'M'}${n(X(i))} ${n(Y(v))} `
    pen = true
  })
  if (path)
    parts.push(
      `<path d="${path.trim()}" fill="none" stroke="${ACCENT}" stroke-width="1.2" stroke-linejoin="round"/>`,
    )
  parts.push(text(`T, ${ctx.tUnit}`, 0, top - 2))
  const bottom = top + height + SMALL + 6
  parts.push(text(ctx.t('report.profileAxis'), left + plotW, bottom + SMALL, { anchor: 'end' }))
  const total = bottom + SMALL * LINE + 2
  return { svg: svgDocument(width, total, parts.join(''), fontCss), width, height: total }
}

/** Стовпчикова діаграма розподілу: стовпець k залито кольором середини k-ї частини палітри (як у застосунку). */
export function distributionSvg(
  bins: readonly TemperatureBin[],
  paletteId: PaletteId,
  ctx: SectionContext,
  width: number,
  fontCss?: string,
): Svg | null {
  const { units, locale } = ctx
  if (bins.length === 0) return null
  const height = 100
  const left = 40
  const plotW = width - 50
  const top = 20
  const rgb = palette(paletteId)
  const total = bins.reduce((sum, b) => sum + b.count, 0)
  const peak = Math.max(1, ...bins.map((b) => b.count))
  const ticks = niceTicks(0, peak, 4).filter(Number.isInteger)
  const yMax = Math.max(peak, ticks.at(-1) ?? 1)
  const Y = (c: number) => top + height - (c / yMax) * height
  const slot = plotW / bins.length
  const barW = slot * 0.7
  const parts: string[] = []
  for (const c of ticks) {
    parts.push(line(left, Y(c), left + plotW, Y(c), RULE, 0.4))
    parts.push(text(formatNumber(c, locale, 0), left - 4, Y(c) + SMALL * 0.35, { anchor: 'end' }))
  }
  const temp = (c: number) => formatNumber(fromCelsius(c, units.temperature), locale, 1)
  bins.forEach((b, k) => {
    const i = 3 * Math.round(((k + 0.5) / bins.length) * 255)
    const x = left + slot * k + (slot - barW) / 2
    if (b.count > 0) {
      parts.push(
        `<rect x="${n(x)}" y="${n(Y(b.count))}" width="${n(barW)}" height="${n(Y(0) - Y(b.count))}" ` +
          `fill="rgb(${rgb[i]},${rgb[i + 1]},${rgb[i + 2]})" stroke="${INK}" stroke-width="0.3"/>`,
      )
    }
    const share = formatNumber(total ? (b.count / total) * 100 : 0, locale, 1)
    parts.push(text(`${b.count} (${share} %)`, x + barW / 2, Y(b.count) - 3, { anchor: 'middle', fill: INK }))
    parts.push(text(`${temp(b.from)} … ${temp(b.to)}`, x + barW / 2, Y(0) + SMALL + 3, { anchor: 'middle' }))
  })
  parts.push(line(left, Y(0), left + plotW, Y(0), MUTED, 0.6))
  parts.push(text(ctx.t('results.pixels'), 0, top - 10 + SMALL * 0.8))
  const bottom = top + height + SMALL + 6
  parts.push(text(`T, ${ctx.tUnit}`, left + plotW, bottom + SMALL, { anchor: 'end' }))
  const h = bottom + SMALL * LINE + 2
  return { svg: svgDocument(width, h, parts.join(''), fontCss), width, height: h }
}
