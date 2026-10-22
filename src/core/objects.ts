/**
 * Об'єкти аналізу — точка, прямокутник, лінія — і їхня статистика (docs/spec/temperature.md, «Об'єкти аналізу»).
 * На відміну від оригіналу (екранні пікселі), усе рахується по пікселях кадру: результат не залежить від масштабу.
 */

/** Точка — один піксель кадру. */
export interface PointShape {
  kind: 'point'
  x: number
  y: number
}

/** Прямокутник — пікселі кадру x0…x1 × y0…y1 включно (x0 ≤ x1, y0 ≤ y1). */
export interface RectShape {
  kind: 'rect'
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Лінія між центрами пікселів (x0, y0) і (x1, y1), обидва кінці входять. */
export interface LineShape {
  kind: 'line'
  x0: number
  y0: number
  x1: number
  y1: number
}

export type Shape = PointShape | RectShape | LineShape

/** Прямокутник із двох довільних кутів. */
export function rectFromCorners(ax: number, ay: number, bx: number, by: number): RectShape {
  return {
    kind: 'rect',
    x0: Math.min(ax, bx),
    y0: Math.min(ay, by),
    x1: Math.max(ax, bx),
    y1: Math.max(ay, by),
  }
}

/** Пікселі піксельної лінії (Брезенгем) від початку до кінця включно, як пари [x, y]. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    points.push([x, y])
    if (x === x1 && y === y1) return points
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/**
 * Індекси пікселів кадру (`y·width + x`), що належать фігурі; пікселі поза кадром відкидаються.
 * Для лінії — у порядку від початку до кінця (точки профілю).
 */
export function objectPixels(shape: Shape, width: number, height: number): Int32Array {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
  switch (shape.kind) {
    case 'point':
      return Int32Array.from(inside(shape.x, shape.y) ? [shape.y * width + shape.x] : [])
    case 'rect': {
      const x0 = Math.max(0, shape.x0)
      const y0 = Math.max(0, shape.y0)
      const x1 = Math.min(width - 1, shape.x1)
      const y1 = Math.min(height - 1, shape.y1)
      if (x0 > x1 || y0 > y1) return new Int32Array(0)
      const out = new Int32Array((x1 - x0 + 1) * (y1 - y0 + 1))
      let i = 0
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[i++] = y * width + x
      return out
    }
    case 'line':
      return Int32Array.from(
        linePoints(shape.x0, shape.y0, shape.x1, shape.y1)
          .filter(([x, y]) => inside(x, y))
          .map(([x, y]) => y * width + x),
      )
  }
}

/** Статистика температур фігури, °C. Якщо жодного коректного пікселя — значення `NaN`, індекси −1. */
export interface PixelStats {
  max: number
  min: number
  /** Середнє по пікселях кадру (кожен піксель — з однаковою вагою). */
  avg: number
  /** Індекс пікселя з max / min (перший за порядком `indices`). */
  maxAt: number
  minAt: number
  /** Кількість пікселів фігури і з них — поза калібруванням (`NaN`, не враховуються). */
  count: number
  invalid: number
}

export function pixelStats(temps: ArrayLike<number>, indices: ArrayLike<number>): PixelStats {
  let max = -Infinity
  let min = Infinity
  let maxAt = -1
  let minAt = -1
  let sum = 0
  let valid = 0
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!
    const t = temps[i]!
    if (Number.isNaN(t)) continue
    valid++
    sum += t
    if (t > max) {
      max = t
      maxAt = i
    }
    if (t < min) {
      min = t
      minAt = i
    }
  }
  if (valid === 0) {
    return {
      max: NaN,
      min: NaN,
      avg: NaN,
      maxAt: -1,
      minAt: -1,
      count: indices.length,
      invalid: indices.length,
    }
  }
  return { max, min, avg: sum / valid, maxAt, minAt, count: indices.length, invalid: indices.length - valid }
}
