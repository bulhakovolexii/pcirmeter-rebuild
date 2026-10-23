import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App.svelte'
import { openFiles, restoreFiles, type FileSource } from '../../src/ui/files'
import { utiSavedAt, utiValues } from '../../src/ui/uti'
import { parseUti } from '../../src/core/uti'
import { utiFile } from '../support/uti'

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')

const source = (name: string, bytes: Uint8Array): FileSource => ({
  name,
  arrayBuffer: async () => bytes.slice().buffer,
})

describe('файли UNI-T', () => {
  it('відкриваються поряд з PCIRMeter; інший BMP — зрозуміла помилка', async () => {
    const bmp = utiFile().slice(0, 1000)
    const { opened, errors } = await openFiles([
      source('img20261005_202703.bmp', utiFile()),
      source('130604_0002T.jpg', new Uint8Array(readFileSync(sample))),
      source('picture.bmp', bmp),
    ])
    expect(opened.map((f) => f.kind)).toEqual(['uti', 'pcirmeter'])
    expect(errors).toEqual([{ name: 'picture.bmp', reason: 'unsupported-bmp' }])
  })

  it('відновлюються з сеансу вкладки без розмітки', () => {
    const [f] = restoreFiles([
      { id: 5000, name: 'a.bmp', bytes: utiFile(), markup: { overrides: {}, objects: [] } },
    ])
    expect(f?.kind).toBe('uti')
    expect(f && 'markup' in f).toBe(false)
  })

  it('три значення; поза діапазоном камери — позначка', () => {
    const rows = utiValues(parseUti(utiFile()))
    expect(rows.map((r) => [r.kind, r.point.celsius, r.outOfRange])).toEqual([
      ['max', 46.9, false],
      ['min', -17.7, true],
      ['center', 21, false],
    ])
  })

  it('час зйомки — з імені файлу камери', () => {
    expect(utiSavedAt('img20261015_221327.bmp')).toBe('20261015221327')
    expect(utiSavedAt('photo.bmp')).toBeNull()
  })

  it('вкладка UNI-T: знімок, три значення й пояснення; інструментів і параметрів немає', async () => {
    const { opened } = await openFiles([source('img20261005_202703.bmp', utiFile())])
    const { body } = render(App, { props: { initialFiles: opened } })
    expect(body).toContain('UNI-T UTi89 PRO')
    expect(body).toContain('2026-10-05 20:27:03')
    expect(body).toContain('Лише три температури')
    expect(body).toContain('46,9 °C')
    expect(body).toContain('-17,7 °C')
    expect(body).toContain('21,0 °C')
    expect(body).toContain('поза діапазоном камери')
    for (const absent of ['Прямокутник', 'Параметри кадру', 'Ізотерми', 'Зберегти CSV']) {
      expect(body).not.toContain(absent)
    }
  })
})
