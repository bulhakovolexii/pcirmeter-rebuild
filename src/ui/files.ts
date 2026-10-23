/** Відкриття файлів термограм у браузері (без DOM-залежностей — тестується в Node). */

import { parseThermogram, ThermogramError, type Thermogram } from '../core/parser'

/** Відкритий файл. `id` — унікальний у межах сеансу (ключ вкладки). */
export interface OpenedFile {
  id: number
  name: string
  /** Байти файлу як є — для збереження в сеансі вкладки (`session.ts`). */
  bytes: Uint8Array
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
      const bytes = new Uint8Array(buffer)
      opened.push({ id: nextId++, name: file.name, bytes, thermogram: parseThermogram(bytes) })
    } catch (e) {
      errors.push({ name: file.name, reason: errorReason(e) })
    }
  }
  return { opened, errors }
}

/** Файл, збережений у сеансі вкладки, з його колишнім `id`. */
export interface StoredFile {
  id: number
  name: string
  bytes: Uint8Array
}

/**
 * Відкриває збережені файли з їхніми `id` (порядок вкладок — за `id`); наступні нові файли отримують більші `id`.
 * Файл, що перестав розбиратися, пропускається.
 */
export function restoreFiles(stored: StoredFile[]): OpenedFile[] {
  const opened: OpenedFile[] = []
  for (const { id, name, bytes } of [...stored].sort((a, b) => a.id - b.id)) {
    nextId = Math.max(nextId, id + 1)
    try {
      opened.push({ id, name, bytes, thermogram: parseThermogram(bytes) })
    } catch {
      // Пошкоджений запис — просто не відновлюємо
    }
  }
  return opened
}

/** Які файли дописати й які `id` видалити, щоб збережене в сеансі вкладки відповідало відкритим. */
export function planSync(saved: ReadonlySet<number>, files: readonly { id: number }[]) {
  const open = new Set(files.map((f) => f.id))
  return {
    add: files.filter((f) => !saved.has(f.id)).map((f) => f.id),
    remove: [...saved].filter((id) => !open.has(id)),
  }
}

function errorReason(e: unknown): OpenErrorReason {
  if (!(e instanceof ThermogramError)) return 'damaged'
  return e.code === 'too-short' || e.code === 'no-trailer' || e.code === 'no-ir-block'
    ? 'not-thermogram'
    : 'damaged'
}
