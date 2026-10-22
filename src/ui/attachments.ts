/** Вкладення термограми: текст і аудіо з камери (docs/spec/features.md §2.6). Без DOM — тестується в Node. */

/**
 * Текст користувача з камери. Оригінал читає ASCII; кодування не-ASCII символів не встановлено (зразків немає),
 * тому — UTF-8, а якщо байти ним не є — Windows-1251. Текст закінчується першим нулем; `0xFF` у кінці —
 * заповнювач (як у рядках `File_Para_t`).
 */
export function decodeUserText(bytes: Uint8Array): string {
  const nul = bytes.indexOf(0)
  let end = nul < 0 ? bytes.length : nul
  while (end > 0 && bytes[end - 1] === 0xff) end--
  const clean = bytes.subarray(0, end)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(clean)
  } catch {
    text = new TextDecoder('windows-1251').decode(clean)
  }
  return text.replace(/\r\n?/g, '\n').trim()
}

/** MIME-тип аудіонотатки за сигнатурою; оригінал вважає її WAV і зберігає як є. */
export function audioType(bytes: Uint8Array): string {
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4))
  return bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WAVE'
    ? 'audio/wav'
    : 'application/octet-stream'
}
