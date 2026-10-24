import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App.svelte'
import { openFiles, planSync, restoreFiles, type FileSource } from '../../src/ui/files'
import { formatSavedAt, formatShare, formatTemperature, temperatureStatus } from '../../src/ui/format'
import {
  BOTTOM,
  HISTOGRAM,
  clampBottomHeight,
  clampHistogramHeight,
  clampPhotoSplit,
  clampSidebarWidth,
  PHOTO_SPLIT,
  SIDEBAR,
  sidebarWidth,
  units,
} from '../../src/ui/settings'

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

describe('сеанс вкладки', () => {
  it('відновлює файли з їхніми id у порядку id; нові id — більші; зіпсований запис пропускає', async () => {
    const bytes = new Uint8Array(readFileSync(sample))
    const restored = restoreFiles([
      { id: 1002, name: 'b.jpg', bytes },
      { id: 1000, name: 'a.jpg', bytes },
      { id: 1001, name: 'broken.jpg', bytes: new Uint8Array(10) },
    ])
    expect(restored.map((f) => [f.id, f.name])).toEqual([
      [1000, 'a.jpg'],
      [1002, 'b.jpg'],
    ])
    expect(restored[0]!.thermogram.ir.width).toBe(160)
    const { opened } = await openFiles([source('c.jpg', bytes)])
    expect(opened[0]!.id).toBeGreaterThan(1002)
    expect(opened[0]!.bytes.byteLength).toBe(bytes.byteLength)
  })

  it("відновлює розмітку файлу: параметри кадру й об'єкти; пошкоджену — ігнорує", () => {
    const bytes = new Uint8Array(readFileSync(sample))
    const markup = {
      overrides: { emissivity: 0.9 },
      objects: [
        { id: 3, name: 'P1', shape: { kind: 'point' as const, x: 10, y: 20 }, overrides: {}, note: 'стіна' },
      ],
    }
    const [withMarkup, broken] = restoreFiles([
      { id: 2000, name: 'a.jpg', bytes, markup },
      { id: 2001, name: 'b.jpg', bytes, markup: { overrides: {}, objects: [{ id: 'x' }] } as never },
    ])
    expect(withMarkup!.markup).toEqual(markup)
    expect(broken!.markup).toBeUndefined()

    const { body } = render(App, { props: { initialFiles: [withMarkup!] } })
    expect(body).toContain('value="0.9"')
    expect(body).toContain('стіна')
  })

  it('синхронізація: дописати нові, видалити закриті', () => {
    expect(planSync(new Set([1, 2, 3]), [{ id: 1 }, { id: 3 }, { id: 4 }])).toEqual({ add: [4], remove: [2] })
    expect(planSync(new Set(), [])).toEqual({ add: [], remove: [] })
  })
})

describe('форматування', () => {
  it('температура з комою для uk і крапкою для en', () => {
    expect(formatTemperature(25.04, 'uk')).toBe('25,0 °C')
    expect(formatTemperature(-3.25, 'en')).toMatch(/^-3\.[23] °C$/)
    expect(formatTemperature(NaN, 'uk')).toBe('—')
  })

  it('частка: дрібна ненульова — «<0,1 %», майже вся — «>99,9 %»', () => {
    expect(formatShare(0, 'uk')).toBe('0,0 %')
    expect(formatShare(0.0004, 'uk')).toBe('<0,1 %')
    expect(formatShare(0.0005, 'uk')).toBe('0,1 %')
    expect(formatShare(0.25, 'en')).toBe('25.0 %')
    expect(formatShare(0.9996, 'uk')).toBe('>99,9 %')
    expect(formatShare(1, 'uk')).toBe('100,0 %')
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
    expect(body).toContain('Відкрити файли')
    // Список мов (shadcn-svelte Select) рендерить пункти лише відкритим — у SSR видно поточне значення
    expect(body).toMatch(/role="combobox"[^>]*>(<!---->)?Українська/)
    expect(body).toContain('aria-label="Мова інтерфейсу"')
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
    // Вкладки файлів — у шапці; заглушка для вузького вікна є в розмітці (показується медіазапитом)
    expect(body.indexOf('role="tablist"')).toBeLessThan(body.indexOf('</header>'))
    expect(body).toContain('Вікно завузьке')
    // Довідка щодо керування — під кнопкою «?», а не постійним текстом
    expect(body).toContain('aria-label="Довідка щодо керування"')
    expect(body).not.toContain('Колесо — масштаб')
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

  it('бічна панель: курсор і файл нагорі; палітра й маркери — у «Параметрах кадру»; межі панелі й фото', async () => {
    const { opened } = await openFiles([source('130604_0002T.jpg', new Uint8Array(readFileSync(sample)))])
    sidebarWidth.set(320)
    try {
      const { body } = render(App, { props: { initialFiles: opened } })
      const at = (text: string) => body.indexOf(text)
      expect(at('Під курсором')).toBeGreaterThan(at('<aside'))
      expect(at('160 × 120')).toBeGreaterThan(at('Під курсором'))
      // Шкала → ізотерми → «Параметри кадру» (палітра, маркери Max/Min, поля параметрів)
      expect(at('Шкала')).toBeGreaterThan(at('160 × 120'))
      expect(at('Ізотерми')).toBeGreaterThan(at('Шкала'))
      expect(at('Параметри кадру')).toBeGreaterThan(at('Ізотерми'))
      expect(at('Палітра')).toBeGreaterThan(at('Параметри кадру'))
      expect(at('Маркери Max/Min кадру')).toBeGreaterThan(at('Палітра'))
      expect(at('Коефіцієнт випромінювання')).toBeGreaterThan(at('Маркери Max/Min кадру'))
      // Без курсора — заглушка «—», щоб панель не стрибала; координат пікселя немає (рішення викладача)
      expect(body).toMatch(/class="temp[^"]*"[^>]*>\s*<span>—<\/span>/)
      expect(body).not.toContain('Піксель')
      expect(body).toContain('--sidebar-width: 320px')
      // Чотири межі: бічна панель, висота гістограми (між «Шкалою» та «Ізотермами»), ІЧ | фото (у зразку є видиме фото), зображення / нижня смуга
      expect(body.match(/role="separator"/g)).toHaveLength(4)
      expect(body).toContain(`height: ${HISTOGRAM.default}px`)
      expect(body).toContain('aria-valuenow="320"')
      expect(body).toContain('aria-orientation="horizontal"')
      expect(body).toContain(`height: ${BOTTOM.default}px`)
      expect(body).toContain('--ir-share: 0.5')
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

describe('clampBottomHeight', () => {
  it('висота смуги — у межах; зображенню лишається місце; некоректне — стандартна', () => {
    expect(clampBottomHeight(50)).toBe(BOTTOM.min)
    expect(clampBottomHeight(5000)).toBe(BOTTOM.max)
    expect(clampBottomHeight(300.4)).toBe(300)
    expect(clampBottomHeight(500, 600)).toBe(600 - BOTTOM.keepImage)
    expect(clampBottomHeight(500, 200)).toBe(BOTTOM.min)
    expect(clampBottomHeight(NaN)).toBe(BOTTOM.default)
  })
})

describe('clampHistogramHeight', () => {
  it('висота гістограми — у межах, некоректне — стандартна', () => {
    expect(clampHistogramHeight(10)).toBe(HISTOGRAM.min)
    expect(clampHistogramHeight(5000)).toBe(HISTOGRAM.max)
    expect(clampHistogramHeight(100.6)).toBe(101)
    expect(clampHistogramHeight(NaN)).toBe(HISTOGRAM.default)
  })
})

describe('clampPhotoSplit', () => {
  it('частка ІЧ — у межах, некоректне — порівну', () => {
    expect(clampPhotoSplit(0.1)).toBe(PHOTO_SPLIT.min)
    expect(clampPhotoSplit(0.9)).toBe(PHOTO_SPLIT.max)
    expect(clampPhotoSplit(0.6)).toBe(0.6)
    expect(clampPhotoSplit(NaN)).toBe(PHOTO_SPLIT.default)
  })
})
