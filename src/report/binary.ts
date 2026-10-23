/**
 * Двійкові дрібниці для ODT-звіту без залежностей: CRC-32, PNG, ZIP (без стиснення), base64.
 * Стиснення PNG — стандартний `CompressionStream('deflate')` (браузери й Node ≥ 18).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return ~c >>> 0
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Кадр RGBA, збільшений у `factor` разів без інтерполяції (пікселі кадру лишаються квадратами). */
export function upscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  factor: number,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  if (factor <= 1) return { rgba, width, height }
  const w = width * factor
  const h = height * factor
  const out = new Uint8ClampedArray(w * h * 4)
  const src = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height)
  const dst = new Uint32Array(out.buffer)
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / factor) * width
    for (let x = 0; x < w; x++) dst[y * w + x] = src[row + Math.floor(x / factor)]!
  }
  return { rgba: out, width: w, height: h }
}

/** PNG (RGBA, 8 біт) з пікселів RGBA. */
export async function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    // Байт фільтра 0 (None) перед кожним рядком
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const chunks = [chunk('IHDR', ihdr), chunk('IDAT', await zlibDeflate(raw)), chunk('IEND', new Uint8Array())]
  return concat([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks])
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * ZIP-архів без стиснення (метод 0 «stored»). Порядок записів зберігається — для ODT
 * першим має бути `mimetype` без стиснення (ODF 1.3, ч. 2, §3.3).
 */
export function zip(entries: readonly ZipEntry[], date = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  // Дата й час у форматі MS-DOS (місцевий час, крок 2 с)
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 10, true) // версія для розпакування 1.0
    lv.setUint16(6, 0x0800, true) // імена в UTF-8
    lv.setUint16(8, 0, true) // stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, day, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    locals.push(local, entry.data)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 10, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, day, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length + size
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  return concat([...locals, ...centrals, end])
}
