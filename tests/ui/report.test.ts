import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { get } from 'svelte/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PALETTE } from '../../src/core/palettes'
import { parseThermogram } from '../../src/core/parser'
import { autoDisplayScale } from '../../src/core/render'
import App from '../../src/ui/App.svelte'
import type { OpenedFile } from '../../src/ui/files'
import {
  registerReportSource,
  reportMeta,
  savePerson,
  today,
  viewerSnapshot,
  type ViewerSnapshot,
} from '../../src/ui/report'
import ReportDialog from '../../src/ui/ReportDialog.svelte'

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')
const bytes = new Uint8Array(readFileSync(sample))
const thermogram = parseThermogram(bytes)
const file: OpenedFile = { id: 901, name: '130604_0002T.jpg', bytes, thermogram }

const snapshot = (): ViewerSnapshot => ({
  name: file.name,
  thermogram,
  overrides: {},
  paletteId: DEFAULT_PALETTE,
  scale: autoDisplayScale(thermogram.ir),
  scaleLabels: { min: 25, max: 35 },
  manualScale: false,
  isotherms: [],
  objects: [],
  showExtremes: true,
})

afterEach(() => vi.unstubAllGlobals())

describe('реєстр знімків переглядачів', () => {
  it('повертає поточний стан і забуває його після скасування реєстрації', () => {
    const off = registerReportSource(file.id, snapshot)
    expect(viewerSnapshot(file.id)?.name).toBe(file.name)
    off()
    expect(viewerSnapshot(file.id)).toBeUndefined()
  })

  it('стара реєстрація не видаляє нову для того самого файлу', () => {
    const offOld = registerReportSource(file.id, snapshot)
    const offNew = registerReportSource(file.id, () => ({ ...snapshot(), paletteId: 'grey' }))
    offOld()
    expect(viewerSnapshot(file.id)?.paletteId).toBe('grey')
    offNew()
  })
})

describe('титульні поля', () => {
  it('дата за замовчуванням — сьогодні', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(get(reportMeta).date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('виконавець, група й викладач зберігаються; недоступне сховище не ламає', () => {
    const saved = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => saved.set(k, v) })
    savePerson({ author: 'Іваненко', group: 'ЕМ-121', teacher: 'Булгаков' })
    expect(JSON.parse(saved.get('pcirmeter.reportPerson')!)).toEqual({
      author: 'Іваненко',
      group: 'ЕМ-121',
      teacher: 'Булгаков',
    })
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => savePerson({ author: '', group: '', teacher: '' })).not.toThrow()
  })
})

describe('ReportDialog (смоук)', () => {
  it('поля титулу, файли з прапорцями й коментарем, висновок', () => {
    // Вміст діалогу (shadcn-svelte Dialog) рендериться лише відкритим
    expect(
      render(ReportDialog, { props: { open: false, files: [file], onclose: () => {} } }).body,
    ).not.toContain('role="dialog"')
    const { body } = render(ReportDialog, { props: { open: true, files: [file], onclose: () => {} } })
    expect(body).toContain('role="dialog"')
    for (const text of ["Об'єкт обстеження", 'Виконавець', 'Група', 'Викладач', 'Дата звіту', 'Висновок']) {
      expect(body).toContain(text)
    }
    expect(body).toContain('130604_0002T.jpg')
    expect(body).toMatch(/role="checkbox"[^>]*aria-checked="true"/)
    expect(body).toContain('Коментар до термограми: 130604_0002T.jpg')
    // Замість кнопки «Створити PDF» — меню формату (PDF / ODT); місце під мініатюру — біля коментаря
    expect(body).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*>(<!---->)?\s*Створити звіт/)
    expect(body).toContain('class="thumb')
  })

  it('кнопка «Звіт» у шапці неактивна без файлів', () => {
    const empty = render(App).body
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>(<!---->)?Звіт(<!---->)?<\/button>/)
    expect(empty).not.toContain('role="dialog"')
    const withFile = render(App, { props: { initialFiles: [file] } }).body
    expect(withFile).toMatch(/<button(?![^>]*disabled="")[^>]*>(<!---->)?Звіт(<!---->)?<\/button>/)
  })
})
