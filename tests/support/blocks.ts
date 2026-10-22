/** Синтетичні термограми для тестів: додає блоки до справжнього файлу (у зразках немає тексту й аудіо). */

/**
 * Копія `file` з додатковими блоками `blocks` (у вільних записах таблиці) і, за потреби, іншим `File_Type`.
 * Нові блоки дописуються перед хвостовим `T0`; зсуви наявних блоків не змінюються.
 */
export function withBlocks(
  file: Uint8Array,
  blocks: { type: number; data: Uint8Array }[],
  fileType?: number,
): Uint8Array {
  const body = file.length - 4
  const extra = blocks.reduce((n, b) => n + b.data.length, 0)
  const out = new Uint8Array(file.length + extra)
  out.set(file.subarray(0, body))
  const view = new DataView(out.buffer)
  const t0 = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(body, true)
  if (fileType !== undefined) view.setInt16(t0 + 0x68, fileType, true)
  let offset = body
  let slot = 0
  for (const b of blocks) {
    while (view.getInt32(t0 + 0xa0 + 16 * slot + 8, true) !== 0) slot++
    const o = t0 + 0xa0 + 16 * slot
    view.setInt32(o, b.type, true)
    view.setInt32(o + 4, offset, true)
    view.setInt32(o + 8, b.data.length, true)
    out.set(b.data, offset)
    offset += b.data.length
  }
  view.setUint32(out.length - 4, t0, true)
  return out
}

/** Мінімальний WAV (PCM 8 біт, моно) із `samples` відліків тиші. */
export function tinyWav(samples = 8): Uint8Array {
  const out = new Uint8Array(44 + samples).fill(128)
  const v = new DataView(out.buffer)
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)))
  ascii(0, 'RIFF')
  v.setUint32(4, 36 + samples, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true)
  v.setUint32(28, 8000, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  ascii(36, 'data')
  v.setUint32(40, samples, true)
  return out
}
