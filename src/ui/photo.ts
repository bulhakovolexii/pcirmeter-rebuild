/** Видиме фото й накладення ІЧ-кадру (docs/spec/features.md §2.6). Без DOM — тестується в Node. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Частка висоти фото, яку займає ІЧ-кадр іншої пропорції (DT-980: 80×80 → 640 px у JPEG 1280×960) — гіпотеза. */
const INSET_HEIGHT = 2 / 3

/**
 * Розміщення ІЧ-кадру на фото за замовчуванням, у пікселях фото. Однакові пропорції — на все фото (оригінал і
 * камери 2013 р.); інакше — по центру висотою 2/3 фото зі збереженням пропорцій кадру (головний JPEG DT-980).
 */
export function defaultPlacement(sensorW: number, sensorH: number, photoW: number, photoH: number): Rect {
  const sensorAspect = sensorW / sensorH
  const photoAspect = photoW / photoH
  if (Math.abs(sensorAspect / photoAspect - 1) < 0.01) return { x: 0, y: 0, width: photoW, height: photoH }
  let height = photoH * INSET_HEIGHT
  let width = height * sensorAspect
  if (width > photoW) {
    width = photoW
    height = width / sensorAspect
  }
  return { x: (photoW - width) / 2, y: (photoH - height) / 2, width, height }
}

/** Розмір JPEG із маркера SOF (без декодування); `null`, якщо маркер не знайдено. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const u16 = (o: number) => (bytes[o]! << 8) | bytes[o + 1]!
  let o = 2
  while (o + 9 < bytes.length) {
    if (bytes[o] !== 0xff) {
      o++
      continue
    }
    const marker = bytes[o + 1]!
    // SOF0…SOF15, крім DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: u16(o + 7), height: u16(o + 5) }
    }
    // Маркери без довжини: заповнювач FF, TEM, RSTn
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += marker === 0xff ? 1 : 2
      continue
    }
    o += 2 + u16(o + 2)
  }
  return null
}
