import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App.svelte'
import { openFiles, type FileSource } from '../../src/ui/files'
import { formatCelsius, formatSavedAt, temperatureStatus } from '../../src/ui/format'

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
    expect(formatCelsius(25.04, 'uk')).toBe('25,0 °C')
    expect(formatCelsius(-3.25, 'en')).toMatch(/^-3\.[23] °C$/)
    expect(formatCelsius(NaN, 'uk')).toBe('—')
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
})
