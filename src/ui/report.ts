/**
 * Звіт в інтерфейсі: знімки стану переглядачів, титульні поля, мініатюри, завантаження генераторів.
 * Генератори (`src/report/report.ts` — PDF, pdf-lib; `src/report/odt.ts` — ODT) і шрифти
 * завантажуються лише при створенні звіту.
 */

import { writable } from 'svelte/store'
import { base64, encodePng } from '../report/binary'
import {
  fileSection,
  reportFileName,
  sectionContext,
  type ReportFile,
  type ReportFormat,
  type ReportMeta,
  type ReportOptions,
} from '../report/content'
import { irFigureSvg } from '../report/figures'
import type { Rasterize } from '../report/odt'

/** Знімок переглядача без коментаря (коментар вводиться в діалозі звіту). */
export type ViewerSnapshot = Omit<ReportFile, 'comment'>

const sources = new Map<number, () => ViewerSnapshot>()

/** Переглядач файлу `id` віддає свій поточний стан; повертає функцію скасування реєстрації. */
export function registerReportSource(id: number, snapshot: () => ViewerSnapshot): () => void {
  sources.set(id, snapshot)
  return () => {
    if (sources.get(id) === snapshot) sources.delete(id)
  }
}

/** Поточний стан переглядача файлу `id` (`undefined` — переглядач не змонтовано). */
export function viewerSnapshot(id: number): ViewerSnapshot | undefined {
  return sources.get(id)?.()
}

/** Поля, що запам'ятовуються між сеансами: хто виконує і хто перевіряє. */
type Person = Pick<ReportMeta, 'author' | 'group' | 'teacher'>

const PERSON_KEY = 'pcirmeter.reportPerson'

function loadPerson(): Person {
  const empty: Person = { author: '', group: '', teacher: '' }
  try {
    const raw = globalThis.localStorage?.getItem(PERSON_KEY)
    if (!raw) return empty
    const saved = JSON.parse(raw) as Partial<Person>
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    return { author: str(saved.author), group: str(saved.group), teacher: str(saved.teacher) }
  } catch {
    return empty
  }
}

export function savePerson(meta: Person): void {
  try {
    globalThis.localStorage?.setItem(
      PERSON_KEY,
      JSON.stringify({ author: meta.author, group: meta.group, teacher: meta.teacher }),
    )
  } catch {
    // Сховище недоступне — поля діють до перезавантаження
  }
}

/** Сьогоднішня дата `YYYY-MM-DD` за місцевим часом. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Титульні поля звіту — живуть увесь сеанс (діалог можна закривати й відкривати знову). */
export const reportMeta = writable<ReportMeta>({
  subject: '',
  ...loadPerson(),
  date: today(),
  description: '',
  conclusion: '',
})

const FONT_URLS = {
  // `new URL(…, import.meta.url)` — Vite копіює шрифти в збірку як окремі файли
  regular: new URL('../report/fonts/FiraSans-Regular.ttf', import.meta.url).href,
  bold: new URL('../report/fonts/FiraSans-SemiBold.ttf', import.meta.url).href,
}

async function loadFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  const font = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer())
  const [regular, bold] = await Promise.all([font(FONT_URLS.regular), font(FONT_URLS.bold)])
  return { regular, bold }
}

export const REPORT_MIME: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  odt: 'application/vnd.oasis.opendocument.text',
}

/** Створює звіт у форматі `format` (`rasterize` — рисунки ODT, `rasterize.ts`); повертає байти й ім'я файлу. Генератори й шрифти — окремі файли збірки (кешуються SW). */
export async function createReport(
  format: ReportFormat,
  rasterize: Rasterize,
  meta: ReportMeta,
  files: readonly ReportFile[],
  options: ReportOptions,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const fonts = await loadFonts()
  let bytes: Uint8Array
  if (format === 'pdf') {
    const { buildReport } = await import('../report/report')
    bytes = await buildReport(meta, files, fonts, options)
  } else {
    const { buildOdt } = await import('../report/odt')
    // Шрифт підписів рисунків — той самий Fira Sans (SVG-зображення не бачить шрифтів сторінки)
    const fontCss =
      `@font-face{font-family:'Fira Sans';font-weight:400;src:url(data:font/ttf;base64,${base64(fonts.regular)})}` +
      `@font-face{font-family:'Fira Sans';font-weight:600;src:url(data:font/ttf;base64,${base64(fonts.bold)})}`
    bytes = await buildOdt(meta, files, { rasterize, fontCss }, options)
  }
  return { bytes, fileName: reportFileName(meta, options.t, format) }
}

/** Ширина мініатюри, pt рисунка: підписи об'єктів мають той самий розмір відносно кадру, що й у звіті. */
const THUMB_WIDTH = 160

/** Мініатюра термограми для діалогу звіту: кадр як у переглядачі з об'єктами, без шкали (`data:` URL SVG). */
export async function reportThumbnail(file: ReportFile, options: ReportOptions): Promise<string> {
  const ctx = sectionContext(options)
  const section = fileSection(file, 0, ctx)
  const { ir } = file.thermogram
  const frameHref = `data:image/png;base64,${base64(await encodePng(section.frame, ir.width, ir.height))}`
  const { svg } = irFigureSvg(section, ctx, { frameHref, width: THUMB_WIDTH })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
