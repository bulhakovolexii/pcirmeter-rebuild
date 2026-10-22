/**
 * Редагування об'єктів аналізу без DOM: попадання курсором, перетягування, зміна розміру, нумерація.
 * Координати курсора — неперервні, у пікселях кадру (піксель (x, y) займає [x, x+1) × [y, y+1)).
 */

import { rectFromCorners, type Shape } from '../core/objects'
import type { ObjectParams } from '../core/temperature'

export type ShapeKind = Shape['kind']

/** Об'єкт аналізу на зображенні: фігура + власні параметри (не задані — як у кадру). */
export interface MeasureObject {
  id: number
  /** P1, R1, L1… */
  name: string
  shape: Shape
  overrides: Partial<ObjectParams>
}

/** Що тягнемо: увесь об'єкт, кут прямокутника або кінець лінії. */
export type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end'

export interface Hit {
  id: number
  handle: Handle
}

const PREFIX: Record<ShapeKind, string> = { point: 'P', rect: 'R', line: 'L' }

/** Наступна назва для фігури: префікс + (найбільший наявний номер + 1). */
export function nextName(objects: readonly MeasureObject[], kind: ShapeKind): string {
  const prefix = PREFIX[kind]
  let n = 0
  for (const o of objects) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(o.name)
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `${prefix}${n + 1}`
}

/** Фігура, яку не варто додавати: прямокутник 1×1 або лінія нульової довжини (клік без перетягування). */
export function isDegenerate(shape: Shape): boolean {
  if (shape.kind === 'point') return false
  return shape.x0 === shape.x1 && shape.y0 === shape.y1
}

/** Ручки фігури — точки в неперервних координатах кадру. */
function handles(shape: Shape): [Handle, number, number][] {
  switch (shape.kind) {
    case 'point':
      return []
    case 'rect':
      return [
        ['nw', shape.x0, shape.y0],
        ['ne', shape.x1 + 1, shape.y0],
        ['sw', shape.x0, shape.y1 + 1],
        ['se', shape.x1 + 1, shape.y1 + 1],
      ]
    case 'line':
      return [
        ['start', shape.x0 + 0.5, shape.y0 + 0.5],
        ['end', shape.x1 + 0.5, shape.y1 + 0.5],
      ]
  }
}

/** Відстань від точки до відрізка. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Попадання в контур фігури (без внутрішності прямокутника). */
function outlineHit(shape: Shape, x: number, y: number, tol: number): Handle | null {
  for (const [handle, hx, hy] of handles(shape)) if (Math.hypot(x - hx, y - hy) <= tol) return handle
  switch (shape.kind) {
    case 'point':
      return Math.hypot(x - shape.x - 0.5, y - shape.y - 0.5) <= Math.max(tol, 0.5) ? 'move' : null
    case 'line':
      return segmentDistance(x, y, shape.x0 + 0.5, shape.y0 + 0.5, shape.x1 + 0.5, shape.y1 + 0.5) <= tol
        ? 'move'
        : null
    case 'rect': {
      const l = shape.x0
      const t = shape.y0
      const r = shape.x1 + 1
      const b = shape.y1 + 1
      const near =
        segmentDistance(x, y, l, t, r, t) <= tol ||
        segmentDistance(x, y, l, b, r, b) <= tol ||
        segmentDistance(x, y, l, t, l, b) <= tol ||
        segmentDistance(x, y, r, t, r, b) <= tol
      return near ? 'move' : null
    }
  }
}

/**
 * Об'єкт під курсором. `tol` — допуск у пікселях кадру (≈ кілька екранних пікселів / масштаб).
 * Пріоритет: ручки вибраного → контури (верхні — ті, що додано пізніше) → внутрішність прямокутників.
 */
export function hitTest(
  objects: readonly MeasureObject[],
  x: number,
  y: number,
  tol: number,
  selectedId: number | null = null,
): Hit | null {
  const selected = objects.find((o) => o.id === selectedId)
  if (selected) {
    for (const [handle, hx, hy] of handles(selected.shape)) {
      if (Math.hypot(x - hx, y - hy) <= tol) return { id: selected.id, handle }
    }
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const handle = outlineHit(objects[i]!.shape, x, y, tol)
    if (handle) return { id: objects[i]!.id, handle }
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const s = objects[i]!.shape
    if (s.kind === 'rect' && x >= s.x0 && x < s.x1 + 1 && y >= s.y0 && y < s.y1 + 1) {
      return { id: objects[i]!.id, handle: 'move' }
    }
  }
  return null
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** Піксель кадру під неперервною точкою, обмежений кадром. */
export function framePixel(x: number, y: number, width: number, height: number): [number, number] {
  return [clamp(Math.floor(x), 0, width - 1), clamp(Math.floor(y), 0, height - 1)]
}

/**
 * Фігура після перетягування ручки. `shape` — фігура **на початку** перетягування (прямокутник нормалізується,
 * тож кут, протилежний ручці, визначається лише за початковою фігурою); `from` — піксель, де почали тягнути,
 * `to` — поточний піксель. Переміщення не виводить фігуру за кадр; кут/кінець тягнеться від протилежного.
 */
export function dragShape(
  shape: Shape,
  handle: Handle,
  from: readonly [number, number],
  to: readonly [number, number],
  width: number,
  height: number,
): Shape {
  const [tx, ty] = [clamp(to[0], 0, width - 1), clamp(to[1], 0, height - 1)]
  if (handle === 'move') {
    if (shape.kind === 'point') return { ...shape, x: tx, y: ty }
    const left = Math.min(shape.x0, shape.x1)
    const top = Math.min(shape.y0, shape.y1)
    const right = Math.max(shape.x0, shape.x1)
    const bottom = Math.max(shape.y0, shape.y1)
    const dx = clamp(to[0] - from[0], -left, width - 1 - right)
    const dy = clamp(to[1] - from[1], -top, height - 1 - bottom)
    return { ...shape, x0: shape.x0 + dx, y0: shape.y0 + dy, x1: shape.x1 + dx, y1: shape.y1 + dy }
  }
  if (shape.kind === 'rect') {
    const ax = handle === 'nw' || handle === 'sw' ? shape.x1 : shape.x0
    const ay = handle === 'nw' || handle === 'ne' ? shape.y1 : shape.y0
    return rectFromCorners(ax, ay, tx, ty)
  }
  if (shape.kind === 'line') {
    return handle === 'start' ? { ...shape, x0: tx, y0: ty } : { ...shape, x1: tx, y1: ty }
  }
  return shape
}

/** Ручка, яку тягнуть під час малювання нової фігури від `anchor`. */
export function drawingHandle(kind: ShapeKind): Handle {
  return kind === 'point' ? 'move' : kind === 'rect' ? 'se' : 'end'
}

/** Нова фігура в пікселі `[x, y]` (прямокутник 1×1 / лінія нульової довжини — далі тягнуть `drawingHandle`). */
export function newShape(kind: ShapeKind, [x, y]: readonly [number, number]): Shape {
  return kind === 'point' ? { kind, x, y } : { kind, x0: x, y0: y, x1: x, y1: y }
}
