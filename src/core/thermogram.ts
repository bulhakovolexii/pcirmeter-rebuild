/** Відкриття файлу будь-якого підтримуваного формату: PCIRMeter / CEM (`*.jpg`, `*.hir`) або UNI-T (`*.bmp`). */

import { parseThermogram, type Thermogram } from './parser'
import { isBmp, parseUti, type UtiSnapshot } from './uti'

export type AnyThermogram = { kind: 'pcirmeter'; thermogram: Thermogram } | { kind: 'uti'; uti: UtiSnapshot }

/** Розпізнає формат за вмістом; помилки — `ThermogramError`. */
export function openThermogram(bytes: Uint8Array): AnyThermogram {
  if (isBmp(bytes)) return { kind: 'uti', uti: parseUti(bytes) }
  return { kind: 'pcirmeter', thermogram: parseThermogram(bytes) }
}
