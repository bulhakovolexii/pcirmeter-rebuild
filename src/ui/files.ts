/** Відкриття файлів термограм у браузері (без DOM-залежностей — тестується в Node). */

import { ThermogramError, type Thermogram } from '../core/parser'
import { openThermogram, type AnyThermogram } from '../core/thermogram'
import type { UtiSnapshot } from '../core/uti'
import type { ObjectParams } from '../core/temperature'
import type { MeasureObject } from './tools'

interface FileBase {
  /** Унікальний у межах сеансу (ключ вкладки). */
  id: number
  name: string
  /** Байти файлу як є — для збереження в сеансі вкладки (`session.ts`). */
  bytes: Uint8Array
}

/** Відкрита радіометрична термограма PCIRMeter / CEM. */
export interface OpenedThermogram extends FileBase {
  kind: 'pcirmeter'
  thermogram: Thermogram
  /** Розмітка, відновлена з сеансу вкладки (стартовий стан переглядача). */
  markup?: FileMarkup
}

/** Відкритий знімок UNI-T: без температурної карти, тож і без розмітки. */
export interface OpenedUti extends FileBase {
  kind: 'uti'
  uti: UtiSnapshot
}

export type OpenedFile = OpenedThermogram | OpenedUti

/** Що користувач змінив у файлі й що переживає перезавантаження: параметри кадру та об'єкти. */
export interface FileMarkup {
  overrides: Partial<ObjectParams>
  objects: MeasureObject[]
}

/** Причина, з якої файл не відкрито (ключ повідомлення `error.<reason>`). */
export type OpenErrorReason = 'not-thermogram' | 'unsupported-bmp' | 'damaged' | 'read'

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
      opened.push(toOpened(nextId++, file.name, bytes, openThermogram(bytes)))
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
  markup?: FileMarkup
}

/**
 * Відкриває збережені файли з їхніми `id` (порядок вкладок — за `id`); наступні нові файли отримують більші `id`.
 * Файл, що перестав розбиратися, пропускається.
 */
export function restoreFiles(stored: StoredFile[]): OpenedFile[] {
  const opened: OpenedFile[] = []
  for (const { id, name, bytes, markup } of [...stored].sort((a, b) => a.id - b.id)) {
    nextId = Math.max(nextId, id + 1)
    try {
      const file = toOpened(id, name, bytes, openThermogram(bytes))
      opened.push(file.kind === 'pcirmeter' && isMarkup(markup) ? { ...file, markup } : file)
    } catch {
      // Пошкоджений запис — просто не відновлюємо
    }
  }
  return opened
}

function toOpened(id: number, name: string, bytes: Uint8Array, t: AnyThermogram): OpenedFile {
  return t.kind === 'pcirmeter'
    ? { id, name, bytes, kind: t.kind, thermogram: t.thermogram }
    : { id, name, bytes, kind: t.kind, uti: t.uti }
}

/** Перевірка форми збереженої розмітки (запис міг лишитися від іншої версії застосунку). */
function isMarkup(m: unknown): m is FileMarkup {
  if (typeof m !== 'object' || m === null) return false
  const { overrides, objects } = m as Partial<FileMarkup>
  return (
    typeof overrides === 'object' &&
    overrides !== null &&
    Array.isArray(objects) &&
    objects.every(
      (o) =>
        typeof o?.id === 'number' &&
        typeof o.name === 'string' &&
        typeof o.shape?.kind === 'string' &&
        typeof o.overrides === 'object',
    )
  )
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
  if (e.code === 'bmp-not-uti') return 'unsupported-bmp'
  return e.code === 'too-short' || e.code === 'no-trailer' || e.code === 'no-ir-block'
    ? 'not-thermogram'
    : 'damaged'
}
