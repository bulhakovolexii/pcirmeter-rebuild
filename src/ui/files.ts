/** Відкриття файлів термограм у браузері (без DOM-залежностей — тестується в Node). */

import { parseThermogram, ThermogramError, type Thermogram } from '../core/parser'

/** Відкритий файл. `id` — унікальний у межах сеансу (ключ вкладки). */
export interface OpenedFile {
  id: number
  name: string
  thermogram: Thermogram
}

/** Причина, з якої файл не відкрито (ключ повідомлення `error.<reason>`). */
export type OpenErrorReason = 'not-thermogram' | 'damaged' | 'read'

export interface OpenError {
  name: string
  reason: OpenErrorReason
}

/** Те, що потрібно від `File`. */
export interface FileSource {
  name: string
  arrayBuffer(): Promise<ArrayBuffer>
}

let nextId = 1

/** Розбирає файли; не кидає — помилки повертаються поруч з успішно відкритими. */
export async function openFiles(
  files: Iterable<FileSource>,
): Promise<{ opened: OpenedFile[]; errors: OpenError[] }> {
  const opened: OpenedFile[] = []
  const errors: OpenError[] = []
  for (const file of files) {
    let buffer: ArrayBuffer
    try {
      buffer = await file.arrayBuffer()
    } catch {
      errors.push({ name: file.name, reason: 'read' })
      continue
    }
    try {
      opened.push({ id: nextId++, name: file.name, thermogram: parseThermogram(buffer) })
    } catch (e) {
      errors.push({ name: file.name, reason: errorReason(e) })
    }
  }
  return { opened, errors }
}

function errorReason(e: unknown): OpenErrorReason {
  if (!(e instanceof ThermogramError)) return 'damaged'
  return e.code === 'too-short' || e.code === 'no-trailer' || e.code === 'no-ir-block'
    ? 'not-thermogram'
    : 'damaged'
}
