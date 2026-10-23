/**
 * PDF-звіт в інтерфейсі: знімки стану переглядачів, титульні поля, завантаження генератора.
 * Генератор (`src/report/report.ts`, pdf-lib) і шрифти завантажуються лише при створенні звіту.
 */

import { writable } from 'svelte/store'
import type { ReportEntry, ReportFile, ReportMeta, ReportOptions, UtiReportFile } from '../report/report'

/** Знімок переглядача без коментаря (коментар вводиться в діалозі звіту). */
export type ViewerSnapshot = Omit<ReportFile, 'comment'> | Omit<UtiReportFile, 'comment'>

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

/** Створює PDF; повертає байти й ім'я файлу. Генератор і шрифти — окремі файли збірки (кешуються SW). */
export async function createReport(
  meta: ReportMeta,
  files: readonly ReportEntry[],
  options: ReportOptions,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  // `new URL(…, import.meta.url)` — Vite копіює шрифти в збірку як окремі файли
  const regularUrl = new URL('../report/fonts/FiraSans-Regular.ttf', import.meta.url).href
  const boldUrl = new URL('../report/fonts/FiraSans-SemiBold.ttf', import.meta.url).href
  const { buildReport, reportFileName } = await import('../report/report')
  const font = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer())
  const [regular, bold] = await Promise.all([font(regularUrl), font(boldUrl)])
  const bytes = await buildReport(meta, files, { regular, bold }, options)
  return { bytes, fileName: reportFileName(meta, options.t) }
}
