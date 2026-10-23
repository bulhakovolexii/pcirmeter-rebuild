/** Знімки UNI-T у переглядачі й звіті (без DOM — тестується в Node). */

import { outOfUtiRange, type UtiPoint, type UtiSnapshot } from '../core/uti'

export type UtiValueKind = 'max' | 'min' | 'center'

export interface UtiValueRow {
  kind: UtiValueKind
  point: UtiPoint
  /** Поза діапазоном вимірювання камери (−10…400 °C). */
  outOfRange: boolean
}

/** Три значення з файлу в порядку показу. */
export function utiValues(uti: UtiSnapshot): UtiValueRow[] {
  return (['max', 'min', 'center'] as const).map((kind) => ({
    kind,
    point: uti[kind],
    outOfRange: outOfUtiRange(uti[kind].celsius),
  }))
}

/** Час зйомки з імені файлу камери (`img20261015_221327.bmp` → `20261015221327`); у самому файлі дати немає. */
export function utiSavedAt(name: string): string | null {
  const m = /(\d{8})_(\d{6})/.exec(name)
  return m ? `${m[1]}${m[2]}` : null
}
