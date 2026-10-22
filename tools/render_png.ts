/**
 * Рендер ІЧ-кадру термограми в PNG ядром застосунку — для візуальної звірки без браузера
 * (порівняти з головним JPEG камери або скриншотом оригіналу).
 *
 * Запуск (Node не виконує TS-імпорти без розширень — спершу зібрати rolldown):
 *   npx rolldown tools/render_png.ts --format esm --platform node -o <scratch>/render_png.mjs
 *   node <scratch>/render_png.mjs <файл.jpg> <вихід.png> [палітра=iron] [масштаб=4]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { parseThermogram } from '../src/core/parser'
import { palette, type PaletteId } from '../src/core/palettes'
import { autoDisplayScale, renderFrame } from '../src/core/render'

const [src, out, pal = 'iron', scaleArg = '4'] = process.argv.slice(2)
const t = parseThermogram(readFileSync(src!))
const { width: w, height: h } = t.ir
const k = Number(scaleArg)
const rgba = renderFrame(t.ir.ad, palette(pal as PaletteId), autoDisplayScale(t.ir))
const W = w * k, H = h * k
const raw = Buffer.alloc((W * 3 + 1) * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4, d = y * (W * 3 + 1) + 1 + x * 3
  raw[d] = rgba[s]!; raw[d + 1] = rgba[s + 1]!; raw[d + 2] = rgba[s + 2]!
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2
writeFileSync(out!, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log(w, h, t.ir.params.fpgaLevel, t.ir.params.fpgaSpan)
