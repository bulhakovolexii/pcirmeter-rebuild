import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import { BlockType, parseThermogram } from '../../src/core/parser'
import App from '../../src/ui/App.svelte'
import { audioType, decodeUserText } from '../../src/ui/attachments'
import { openFiles } from '../../src/ui/files'
import { defaultPlacement, jpegSize } from '../../src/ui/photo'
import PhotoPanel from '../../src/ui/PhotoPanel.svelte'
import { fitView, MAX_ZOOM, MIN_ZOOM, zoomAt } from '../../src/ui/view'
import { tinyWav, withBlocks } from '../support/blocks'

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')
const bytes = new Uint8Array(readFileSync(sample))
const encode = (s: string) => new TextEncoder().encode(s)

describe('розміщення ІЧ-кадру на фото', () => {
  it('однакові пропорції — на все фото (2013 р.: 160×120 на 640×480)', () => {
    expect(defaultPlacement(160, 120, 640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 480 })
    expect(defaultPlacement(384, 288, 1280, 960)).toEqual({ x: 0, y: 0, width: 1280, height: 960 })
  })

  it('інша пропорція — по центру висотою 2/3 (DT-980: 80×80 на 1280×960)', () => {
    const r = defaultPlacement(80, 80, 1280, 960)
    expect(r.width).toBeCloseTo(640)
    expect(r.height).toBeCloseTo(640)
    expect(r.x).toBeCloseTo(320)
    expect(r.y).toBeCloseTo(160)
  })

  it('широкий кадр не виходить за межі фото', () => {
    const r = defaultPlacement(400, 100, 640, 480)
    expect(r.width).toBeCloseTo(640)
    expect(r.height).toBeCloseTo(160)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(160)
  })
})

describe('розмір JPEG', () => {
  it('видиме фото зразків 2013 р. — 640×480', () => {
    expect(jpegSize(parseThermogram(bytes).visibleJpeg!)).toEqual({ width: 640, height: 480 })
  })

  const dt980 = join(import.meta.dirname, '..', '..', 'samples', 'latest-2021', '20210212_0135.JPG')
  it.skipIf(!existsSync(dt980))('видиме фото DT-980 (EXIF з мініатюрою) — 1280×960', () => {
    const t = parseThermogram(new Uint8Array(readFileSync(dt980)))
    expect(jpegSize(t.visibleJpeg!)).toEqual({ width: 1280, height: 960 })
  })

  it('пропускає EXIF з мініатюрою і не плутає DHT із SOF', () => {
    const exif = [0xff, 0xe1, 0, 16, ...encode('Exif\0\0'), 0xff, 0xc0, 0, 11, 8, 0, 9, 0, 9]
    const dht = [0xff, 0xc4, 0, 4, 0, 0]
    const sof = [0xff, 0xc0, 0, 11, 8, 0x03, 0xc0, 0x05, 0x00, 1, 0x11]
    const jpeg = new Uint8Array([0xff, 0xd8, ...exif, ...dht, ...sof, 0xff, 0xd9])
    expect(jpegSize(jpeg)).toEqual({ width: 1280, height: 960 })
  })

  it('немає SOF — null', () => {
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })
})

describe('масштаб і зсув', () => {
  it('вписує по центру', () => {
    expect(fitView(640, 480, 800, 300)).toEqual({ zoom: 0.625, panX: 200, panY: 0 })
  })

  it('точка під курсором лишається на місці, межі масштабу', () => {
    const v = zoomAt({ zoom: 1, panX: 10, panY: 20 }, 2, 110, 70)
    expect(v).toEqual({ zoom: 2, panX: -90, panY: -30 })
    expect(zoomAt(v, 1000, 0, 0).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(v, 0, 0, 0).zoom).toBe(MIN_ZOOM)
  })
})

describe('текст і аудіо з камери', () => {
  it('ASCII і UTF-8; закінчується першим нулем', () => {
    expect(decodeUserText(encode('Wall 2\r\nnorth\0\0garbage'))).toBe('Wall 2\nnorth')
    expect(decodeUserText(encode('Стіна, північ'))).toBe('Стіна, північ')
  })

  it('не UTF-8 — Windows-1251; 0xFF у кінці — заповнювач', () => {
    // «Стіна» у Windows-1251
    expect(decodeUserText(new Uint8Array([0xd1, 0xf2, 0xb3, 0xed, 0xe0, 0xff, 0xff]))).toBe('Стіна')
  })

  it('тип аудіо за сигнатурою', () => {
    expect(audioType(tinyWav())).toBe('audio/wav')
    expect(audioType(new Uint8Array(20))).toBe('application/octet-stream')
  })
})

describe('вкладення у файлі', () => {
  it('блоки тексту й аудіо читаються парсером', () => {
    const wav = tinyWav()
    const t = parseThermogram(
      withBlocks(bytes, [
        { type: BlockType.userText, data: encode('Test note') },
        { type: BlockType.audio, data: wav },
      ]),
    )
    expect(decodeUserText(t.userText!)).toBe('Test note')
    expect(Array.from(t.audio!)).toEqual(Array.from(wav))
    expect(t.ir.width).toBe(160)
  })

  it('File_Type = 3 — видиме фото = головний JPEG', () => {
    const t = parseThermogram(withBlocks(bytes, [], 3))
    expect(t.visibleJpeg).toEqual(t.jpeg)
  })

  it('UI показує примітку, програвач і панель фото', async () => {
    const file = withBlocks(bytes, [
      { type: BlockType.userText, data: encode('Кут стіни') },
      { type: BlockType.audio, data: tinyWav() },
    ])
    const { opened } = await openFiles([{ name: 'note.jpg', arrayBuffer: async () => file.slice().buffer }])
    const { body } = render(App, { props: { initialFiles: opened } })
    expect(body).toContain('Примітка з камери')
    expect(body).toContain('Кут стіни')
    expect(body).toContain('<audio')
    expect(body).toContain('Зберегти аудіо')
    expect(body).toContain('Видиме фото')
    expect(body).toContain('Накладення')
  })

  it('без тексту й аудіо — немає їхніх блоків', async () => {
    const { opened } = await openFiles([{ name: 'a.jpg', arrayBuffer: async () => bytes.slice().buffer }])
    const { body } = render(App, { props: { initialFiles: opened } })
    expect(body).not.toContain('Примітка з камери')
    expect(body).not.toContain('<audio')
  })
})

describe('PhotoPanel', () => {
  it('рендерить перемикач режимів і масштаб', () => {
    const t = parseThermogram(bytes)
    const { body } = render(PhotoPanel, {
      props: {
        photo: t.visibleJpeg!,
        frame: new Uint8ClampedArray(160 * 120 * 4),
        frameWidth: 160,
        frameHeight: 120,
        id: 1,
      },
    })
    expect(body).toContain('Фото')
    expect(body).toContain('Накладення')
    expect(body).toContain('Вписати')
  })
})
