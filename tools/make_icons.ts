/**
 * Іконки застосунку (PWA, favicon) → `public/icons/*.png`: синтетична «термограма» в палітрі «Залізо»
 * з маркером точкового вимірювання на найгарячішому місці. Без зовнішніх бібліотек.
 *
 * Запуск (як `render_png.ts`):
 *   npx rolldown tools/make_icons.ts --format esm --platform node -o <scratch>/make_icons.mjs
 *   node <scratch>/make_icons.mjs public/icons
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { palette } from '../src/core/palettes'

const [outDir = 'public/icons'] = process.argv.slice(2)
const iron = palette('iron')
const HOT = { x: 0.6, y: 0.4 }

/** Температурне поле 0…1 у координатах 0…1: тепла пляма + холодніший низ. */
function field(x: number, y: number): number {
  const g = (cx: number, cy: number, r: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r))
  const v = 0.18 + 0.12 * (1 - y) + 0.52 * g(HOT.x, HOT.y, 0.22) + 0.22 * g(0.25, 0.75, 0.16)
  return Math.min(1, Math.max(0, v))
}

/** Маркер точки: кільце й чотири риски, як інструмент «Точка» у переглядачі. */
function marker(x: number, y: number, s: number): boolean {
  const d = Math.hypot(x - HOT.x, y - HOT.y)
  const w = 0.028 * s
  if (Math.abs(d - 0.1 * s) < w / 2) return true
  const dx = Math.abs(x - HOT.x), dy = Math.abs(y - HOT.y)
  const arm = (a: number, b: number) => a < w / 2 && b > 0.15 * s && b < 0.25 * s
  return arm(dx, dy) || arm(dy, dx)
}

/**
 * @param radius радіус заокруглення кутів (частка розміру; 0 — квадрат на весь кадр)
 * @param markerScale розмір маркера відносно стандартного
 */
function icon(size: number, { radius = 0.22, markerScale = 1 } = {}): Buffer {
  const SS = 4
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size
          if (radius > 0) {
            const qx = Math.max(radius - x, x - (1 - radius), 0), qy = Math.max(radius - y, y - (1 - radius), 0)
            if (Math.hypot(qx, qy) > radius) continue
          }
          let c: [number, number, number]
          if (marker(x, y, markerScale)) c = [255, 255, 255]
          else {
            const i = Math.round(field(x, y) * 255) * 3
            c = [iron[i]!, iron[i + 1]!, iron[i + 2]!]
          }
          r += c[0]; g += c[1]; b += c[2]; a++
        }
      const o = (py * size + px) * 4
      if (a > 0) { rgba[o] = r / a; rgba[o + 1] = g / a; rgba[o + 2] = b / a }
      rgba[o + 3] = Math.round((a / (SS * SS)) * 255)
    }
  return png(size, size, rgba)
}

function png(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync(outDir, { recursive: true })
const out = {
  'icon-192.png': icon(192),
  'icon-512.png': icon(512),
  // Maskable: на весь кадр, маркер дрібніший — лишається в безпечній зоні при обрізанні платформою
  'maskable-512.png': icon(512, { radius: 0, markerScale: 0.8 }),
  // iOS заокруглює сам і не підтримує прозорість
  'apple-touch-icon.png': icon(180, { radius: 0 }),
  'favicon-32.png': icon(32, { radius: 0.15, markerScale: 1.3 }),
}
for (const [name, data] of Object.entries(out)) writeFileSync(join(outDir, name), data)
console.log(Object.keys(out).join(' '))
