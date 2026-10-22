import { describe, expect, it } from 'vitest'
import type { Shape } from '../../src/core/objects'
import {
  dragShape,
  drawingHandle,
  framePixel,
  hitTest,
  isDegenerate,
  newShape,
  nextName,
  type MeasureObject,
} from '../../src/ui/tools'

const obj = (id: number, name: string, shape: Shape): MeasureObject => ({ id, name, shape, overrides: {} })

describe('nextName', () => {
  it('нумерує кожен тип окремо, після найбільшого наявного номера', () => {
    const objects = [obj(1, 'P1', newShape('point', [0, 0])), obj(2, 'P3', newShape('point', [1, 1]))]
    expect(nextName(objects, 'point')).toBe('P4')
    expect(nextName(objects, 'rect')).toBe('R1')
    expect(nextName([], 'line')).toBe('L1')
  })
})

describe('isDegenerate', () => {
  it('клік без перетягування не дає прямокутника чи лінії, але дає точку', () => {
    expect(isDegenerate(newShape('rect', [3, 3]))).toBe(true)
    expect(isDegenerate(newShape('line', [3, 3]))).toBe(true)
    expect(isDegenerate(newShape('point', [3, 3]))).toBe(false)
    expect(isDegenerate({ kind: 'line', x0: 3, y0: 3, x1: 3, y1: 4 })).toBe(false)
  })
})

describe('hitTest', () => {
  const rect = obj(1, 'R1', { kind: 'rect', x0: 10, y0: 10, x1: 19, y1: 19 })
  const line = obj(2, 'L1', { kind: 'line', x0: 0, y0: 30, x1: 20, y1: 30 })
  const point = obj(3, 'P1', { kind: 'point', x: 15, y: 15 })
  const objects = [rect, line, point]

  it('точка всередині прямокутника має пріоритет над його внутрішністю', () => {
    expect(hitTest(objects, 15.5, 15.5, 1)).toEqual({ id: 3, handle: 'move' })
    expect(hitTest(objects, 12, 17, 1)).toEqual({ id: 1, handle: 'move' })
  })

  it('кути прямокутника й кінці лінії', () => {
    expect(hitTest(objects, 20.2, 20.3, 1)).toEqual({ id: 1, handle: 'se' })
    expect(hitTest(objects, 10, 10, 1)).toEqual({ id: 1, handle: 'nw' })
    expect(hitTest(objects, 20.5, 30.5, 1)).toEqual({ id: 2, handle: 'end' })
    expect(hitTest(objects, 8, 30.8, 1)).toEqual({ id: 2, handle: 'move' })
  })

  it('порожнє місце', () => {
    expect(hitTest(objects, 40, 40, 1)).toBeNull()
    expect(hitTest(objects, 8, 33, 1)).toBeNull()
  })

  it('ручки вибраного — першими, навіть якщо зверху інший об’єкт', () => {
    const over = obj(4, 'P2', { kind: 'point', x: 19, y: 19 })
    expect(hitTest([rect, over], 19.6, 19.6, 1)).toEqual({ id: 4, handle: 'move' })
    expect(hitTest([rect, over], 19.6, 19.6, 1, 1)).toEqual({ id: 1, handle: 'se' })
  })
})

describe('dragShape', () => {
  const W = 40
  const H = 30

  it('переміщення не виводить фігуру за кадр', () => {
    const rect: Shape = { kind: 'rect', x0: 5, y0: 5, x1: 14, y1: 9 }
    expect(dragShape(rect, 'move', [6, 6], [8, 7], W, H)).toEqual({
      kind: 'rect',
      x0: 7,
      y0: 6,
      x1: 16,
      y1: 10,
    })
    expect(dragShape(rect, 'move', [6, 6], [0, 0], W, H)).toEqual({
      kind: 'rect',
      x0: 0,
      y0: 0,
      x1: 9,
      y1: 4,
    })
    expect(dragShape(rect, 'move', [6, 6], [39, 29], W, H)).toEqual({
      kind: 'rect',
      x0: 30,
      y0: 25,
      x1: 39,
      y1: 29,
    })
    const line: Shape = { kind: 'line', x0: 30, y0: 5, x1: 35, y1: 2 }
    expect(dragShape(line, 'move', [30, 5], [39, 0], W, H)).toEqual({
      kind: 'line',
      x0: 34,
      y0: 3,
      x1: 39,
      y1: 0,
    })
  })

  it('кут прямокутника тягнеться від протилежного, через нього — з нормалізацією', () => {
    const rect: Shape = { kind: 'rect', x0: 5, y0: 5, x1: 14, y1: 9 }
    expect(dragShape(rect, 'se', [14, 9], [20, 12], W, H)).toEqual({
      kind: 'rect',
      x0: 5,
      y0: 5,
      x1: 20,
      y1: 12,
    })
    expect(dragShape(rect, 'se', [14, 9], [2, 1], W, H)).toEqual({ kind: 'rect', x0: 2, y0: 1, x1: 5, y1: 5 })
    expect(dragShape(rect, 'nw', [5, 5], [7, 50], W, H)).toEqual({
      kind: 'rect',
      x0: 7,
      y0: 9,
      x1: 14,
      y1: 29,
    })
  })

  it('кінці лінії й точка обмежені кадром', () => {
    const line: Shape = { kind: 'line', x0: 1, y0: 1, x1: 5, y1: 5 }
    expect(dragShape(line, 'start', [1, 1], [-3, 2], W, H)).toEqual({
      kind: 'line',
      x0: 0,
      y0: 2,
      x1: 5,
      y1: 5,
    })
    expect(dragShape(line, 'end', [5, 5], [9, 99], W, H)).toEqual({
      kind: 'line',
      x0: 1,
      y0: 1,
      x1: 9,
      y1: 29,
    })
    expect(dragShape({ kind: 'point', x: 1, y: 1 }, 'move', [1, 1], [50, 3], W, H)).toEqual({
      kind: 'point',
      x: 39,
      y: 3,
    })
  })

  it('малювання нової фігури — перетягування ручки від точки натискання', () => {
    const start = newShape('rect', [10, 10])
    expect(dragShape(start, drawingHandle('rect'), [10, 10], [4, 12], W, H)).toEqual({
      kind: 'rect',
      x0: 4,
      y0: 10,
      x1: 10,
      y1: 12,
    })
    const line = newShape('line', [10, 10])
    expect(dragShape(line, drawingHandle('line'), [10, 10], [0, 0], W, H)).toEqual({
      kind: 'line',
      x0: 10,
      y0: 10,
      x1: 0,
      y1: 0,
    })
  })
})

describe('framePixel', () => {
  it('округлює вниз і обмежує кадром', () => {
    expect(framePixel(3.9, 0.1, 10, 10)).toEqual([3, 0])
    expect(framePixel(-0.5, 12, 10, 10)).toEqual([0, 9])
  })
})
