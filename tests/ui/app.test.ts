import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App.svelte'
import { openFiles, type FileSource } from '../../src/ui/files'
import { formatTemperature, formatSavedAt, temperatureStatus } from '../../src/ui/format'
import { clampSidebarWidth, SIDEBAR, sidebarWidth, units } from '../../src/ui/settings'

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')

const source = (name: string, bytes: Uint8Array): FileSource => ({
  name,
  arrayBuffer: async () => bytes.slice().buffer,
})

describe('openFiles', () => {
  it('відкриває термограму й повертає помилки для інших файлів, не перериваючись', async () => {
    const bytes = new Uint8Array(readFileSync(sample))
    // Головний JPEG без хвоста — звичайне фото
    const jpegOnly = bytes.slice(0, new DataView(bytes.buffer).getUint32(bytes.length - 4, true))
    const { opened, errors } = await openFiles([
      source('photo.jpg', jpegOnly),
      source('130604_0002T.hir', bytes),
      source('tiny.jpg', new Uint8Array(10)),
      { name: 'broken.jpg', arrayBuffer: () => Promise.reject(new Error('io')) },
    ])
    expect(opened.map((f) => f.name)).toEqual(['130604_0002T.hir'])
    expect(opened[0]!.thermogram.ir.width).toBe(160)
    expect(errors).toEqual([
      { name: 'photo.jpg', reason: 'not-thermogram' },
      { name: 'tiny.jpg', reason: 'not-thermogram' },
      { name: 'broken.jpg', reason: 'read' },
    ])
  })

  it('видає унікальні id', async () => {
    const bytes = new Uint8Array(readFileSync(sample))
    const { opened } = await openFiles([source('a.jpg', bytes), source('a.jpg', bytes)])
    expect(new Set(opened.map((f) => f.id)).size).toBe(2)
  })
})

describe('форматування', () => {
  it('температура з комою для uk і крапкою для en', () => {
    expect(formatTemperature(25.04, 'uk')).toBe('25,0 °C')
    expect(formatTemperature(-3.25, 'en')).toMatch(/^-3\.[23] °C$/)
    expect(formatTemperature(NaN, 'uk')).toBe('—')
  })

  it('дата зйомки', () => {
    expect(formatSavedAt('20130604173840')).toBe('2013-06-04 17:38:40')
  })

  it('позначка поза діапазоном', () => {
    const range = { min: -20, max: 150 }
    expect(temperatureStatus(30, range)).toBe('ok')
    expect(temperatureStatus(151, range)).toBe('out-of-range')
    expect(temperatureStatus(-25, range)).toBe('out-of-range')
    expect(temperatureStatus(NaN, range)).toBe('no-calibration')
  })
})

describe('App', () => {
  it('рендериться з українським інтерфейсом за замовчуванням', () => {
    const { body } = render(App)
    expect(body).toContain('Аналіз термограм')
    expect(body).toContain('English')
    expect(body).toContain('Відкрити файли')
  })

  it('показує переглядач відкритого файлу', async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    const { body } = render(App, { props: { initialFiles: opened } })
    expect(body).toContain('130604_0002T.jpg')
    expect(body).toContain('160 × 120')
    expect(body).toContain('2013-06-04 17:38:40')
    // Автошкала камери: 25,8…34,5 °C (скриншот оригіналу F5)
    expect(body).toContain('34,5 °C')
    expect(body).toContain('25,8 °C')
    expect(body).toContain('Залізо')
  })

  it("показує параметри об'єкта з файлу і τ", async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    const { body } = render(App, { props: { initialFiles: opened } })
    expect(body).toContain('Параметри кадру')
    // Значення з файлу: ε 0,95, T_відб 25 °C, RH 60 %, d 5 м
    expect(body).toContain('value="0.95"')
    expect(body).toContain('value="60"')
    expect(body).toContain('Коефіцієнт випромінювання ε')
    expect(body).toContain('Відстань, м')
    expect(body).toContain('Пропускання атмосфери τ')
    expect(body).toContain('Скинути до значень із файлу')
  })

  it('показує інструменти аналізу й порожню таблицю результатів', async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    const { body } = render(App, { props: { initialFiles: opened } })
    for (const label of ['Вибір', 'Точка', 'Прямокутник', 'Лінія', 'Видалити вибране', 'Видалити все']) {
      expect(body).toContain(label)
    }
    expect(body).toContain('Результати')
    expect(body).toContain('Зберегти CSV')
    expect(body).toContain('Додайте точку')
  })

  it('бічна панель: маркери, курсор і файл — нагорі; межа з шириною зі store', async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    sidebarWidth.set(320)
    try {
      const { body } = render(App, { props: { initialFiles: opened } })
      const at = (text: string) => body.indexOf(text)
      expect(at('Маркери Max/Min кадру')).toBeGreaterThan(at('<aside'))
      expect(at('Маркери Max/Min кадру')).toBeLessThan(at('Палітра'))
      expect(at('160 × 120')).toBeLessThan(at('Палітра'))
      expect(body).toContain('--sidebar-width: 320px')
      expect(body).toContain('role="separator"')
      expect(body).toContain('aria-valuenow="320"')
    } finally {
      sidebarWidth.set(SIDEBAR.default)
    }
  })

  it('показує гістограму й ізотерми (вимкнені за замовчуванням)', async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    const { body } = render(App, { props: { initialFiles: opened } })
    expect(body).toContain('Гістограма кадру')
    expect(body).toContain('Ізотерми')
    expect(body).toContain('Ізотерма 1')
    expect(body).toContain('Ізотерма 2')
    expect(body).not.toContain('Частка кадру')
    // Профіль — лише коли є лінія
    expect(body).not.toContain('Профіль')
  })

  it('показує температури у вибраних одиницях', async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    units.set({ temperature: 'F', length: 'ft' })
    try {
      const { body } = render(App, { props: { initialFiles: opened } })
      // 34,5 / 25,8 °C (автошкала) → °F
      expect(body).toMatch(/94,\d °F/)
      expect(body).toMatch(/78,\d °F/)
      expect(body).toContain('Відстань, фут')
      expect(body).toContain('value="16.4"')
      expect(body).toContain('value="77"')
      expect(body).not.toContain(' °C<')
    } finally {
      units.set({ temperature: 'C', length: 'm' })
    }
  })
})

describe('clampSidebarWidth', () => {
  it('тримає ширину в межах і не більше половини переглядача', () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR.min)
    expect(clampSidebarWidth(1000)).toBe(SIDEBAR.max)
    expect(clampSidebarWidth(333.6)).toBe(334)
    expect(clampSidebarWidth(500, 800)).toBe(400)
    // Вузьке вікно: мінімум важливіший за «половину»
    expect(clampSidebarWidth(300, 300)).toBe(SIDEBAR.min)
    expect(clampSidebarWidth(NaN)).toBe(SIDEBAR.default)
  })
})
