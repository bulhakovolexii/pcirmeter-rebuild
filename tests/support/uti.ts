/** Синтетичні знімки UNI-T UTi89 PRO для тестів (у git жодних знімків камери) — розкладка docs/spec/uti89pro.md. */

const W = 240
const H = 320
const BMP = 54 + W * H * 2
const PARAMS = BMP + 3 + W * H + 512

export interface UtiFields {
  /** °C; записуються ×10. */
  max: number
  min: number
  center: number
  /** Координати у файлі — у системі сірого зображення (повернутого на 180° відносно екрана). */
  maxAt: [number, number]
  minAt: [number, number]
}

/**
 * Файл UTi89 PRO: BMP 240×320 X1R5G5B5 (рядки знизу вгору); піксель екрана (x, y) має колір
 * `RGB555(r = x mod 32, g = y mod 32, b = 31)`, щоб можна було перевірити розворот рядків.
 */
export function utiFile(
  fields: UtiFields = {
    max: 46.9,
    min: -17.7,
    center: 21,
    maxAt: [80, 56],
    minAt: [144, 320],
  },
): Uint8Array {
  const out = new Uint8Array(PARAMS + 44)
  const view = new DataView(out.buffer)
  out.set([0x42, 0x4d])
  view.setUint32(2, BMP, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, W, true)
  view.setInt32(22, H, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 16, true)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      view.setUint16(54 + ((H - 1 - y) * W + x) * 2, ((x % 32) << 10) | ((y % 32) << 5) | 31, true)
  view.setInt16(PARAMS + 1, Math.round(fields.max * 10), true)
  view.setInt16(PARAMS + 3, Math.round(fields.min * 10), true)
  view.setInt16(PARAMS + 7, Math.round(fields.center * 10), true)
  out[PARAMS + 9] = 95
  out.set([2, 0, 1, 0], PARAMS + 10)
  view.setUint16(PARAMS + 14, fields.minAt[0], true)
  view.setUint16(PARAMS + 16, fields.minAt[1], true)
  view.setUint16(PARAMS + 18, fields.maxAt[0], true)
  view.setUint16(PARAMS + 20, fields.maxAt[1], true)
  view.setUint16(PARAMS + 22, 120, true)
  view.setUint16(PARAMS + 24, 160, true)
  out[PARAMS + 42] = 1
  return out
}
