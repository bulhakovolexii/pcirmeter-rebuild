/**
 * Знімки тепловізора UNI-T UTi89 PRO (`*.bmp`) — docs/spec/uti89pro.md, «варіант 1».
 * Температурної карти у файлі немає: лише знімок екрана камери й три точні значення (T max, T min, T центру).
 */

import { ThermogramError } from './parser'

/** Розміри знімка екрана (портрет). */
export const UTI_WIDTH = 240
export const UTI_HEIGHT = 320
const BMP_HEADER = 54
const BMP_SIZE = BMP_HEADER + UTI_WIDTH * UTI_HEIGHT * 2
/** Блок параметрів `P` — після BMP, 3 нульових байтів, сірого зображення й палітри. */
const PARAMS = BMP_SIZE + 3 + UTI_WIDTH * UTI_HEIGHT + 512
/** Розмір файлу UTi89 PRO — завжди 231 013 Б. */
export const UTI_FILE_SIZE = PARAMS + 44

/** Діапазон вимірювання камери за посібником, °C. */
export const UTI_RANGE = { min: -10, max: 400 } as const

/** Точка зі значенням: координати — у системі знімка екрана (0…239, 0…319). */
export interface UtiPoint {
  x: number
  y: number
  /** °C, як записала камера (з ε, встановленою під час зйомки). */
  celsius: number
}

export interface UtiSnapshot {
  width: number
  height: number
  /** Знімок екрана камери (з оформленням), RGBA, рядки згори вниз. */
  screen: Uint8ClampedArray
  max: UtiPoint
  min: UtiPoint
  center: UtiPoint
}

/** Чи схожі байти на BMP (підпис `BM`) — тоді це або файл UNI-T, або непідтримуваний BMP. */
export function isBmp(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d
}

/** Розбирає файл UTi89 PRO; для іншого BMP — `ThermogramError('bmp-not-uti')`. */
export function parseUti(input: ArrayBuffer | Uint8Array): UtiSnapshot {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fits =
    isBmp(bytes) &&
    bytes.length === UTI_FILE_SIZE &&
    view.getUint32(10, true) === BMP_HEADER &&
    view.getInt32(18, true) === UTI_WIDTH &&
    view.getInt32(22, true) === UTI_HEIGHT &&
    view.getUint16(28, true) === 16 &&
    view.getUint32(30, true) === 0
  if (!fits) throw new ThermogramError('bmp-not-uti', 'BMP не є знімком UNI-T UTi89 PRO')

  // 16 біт без стиснення = X1R5G5B5 (стандарт BMP), рядки знизу вгору
  const screen = new Uint8ClampedArray(UTI_WIDTH * UTI_HEIGHT * 4)
  for (let y = 0; y < UTI_HEIGHT; y++) {
    const row = BMP_HEADER + (UTI_HEIGHT - 1 - y) * UTI_WIDTH * 2
    for (let x = 0; x < UTI_WIDTH; x++) {
      const v = view.getUint16(row + 2 * x, true)
      const r = (v >> 10) & 31
      const g = (v >> 5) & 31
      const b = v & 31
      const o = 4 * (y * UTI_WIDTH + x)
      screen[o] = (r << 3) | (r >> 2)
      screen[o + 1] = (g << 3) | (g >> 2)
      screen[o + 2] = (b << 3) | (b >> 2)
      screen[o + 3] = 255
    }
  }

  const temp = (at: number) => view.getInt16(PARAMS + at, true) / 10
  // Координати у файлі — у системі сірого зображення, повернутого на 180°; бувають на одиницю за межею кадру
  const point = (at: number, celsius: number): UtiPoint => ({
    x: clamp(UTI_WIDTH - 1 - view.getUint16(PARAMS + at, true), UTI_WIDTH),
    y: clamp(UTI_HEIGHT - 1 - view.getUint16(PARAMS + at + 2, true), UTI_HEIGHT),
    celsius,
  })
  return {
    width: UTI_WIDTH,
    height: UTI_HEIGHT,
    screen,
    max: point(18, temp(1)),
    min: point(14, temp(3)),
    center: point(22, temp(7)),
  }
}

function clamp(v: number, size: number): number {
  return Math.min(size - 1, Math.max(0, v))
}

/** Чи значення поза діапазоном вимірювання камери (на екрані камери — «-OL» / «OL»). */
export function outOfUtiRange(celsius: number): boolean {
  return celsius < UTI_RANGE.min || celsius > UTI_RANGE.max
}
