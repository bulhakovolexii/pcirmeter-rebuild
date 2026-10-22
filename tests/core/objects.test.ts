import { describe, expect, it } from 'vitest'
import { linePoints, objectPixels, pixelStats, rectFromCorners } from '../../src/core/objects'

describe('linePoints', () => {
  it('включає обидва кінці й іде від початку до кінця', () => {
    expect(linePoints(0, 0, 3, 0)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ])
    expect(linePoints(2, 3, 2, 1)).toEqual([
      [2, 3],
      [2, 2],
      [2, 1],
    ])
    expect(linePoints(5, 5, 5, 5)).toEqual([[5, 5]])
  })

  it('одна точка на крок уздовж більшої осі, без розривів', () => {
    const pts = linePoints(9, 1, 0, 4)
    expect(pts).toHaveLength(10)
    expect(pts[0]).toEqual([9, 1])
    expect(pts.at(-1)).toEqual([0, 4])
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i]![0] - pts[i - 1]![0])).toBe(1)
      expect(Math.abs(pts[i]![1] - pts[i - 1]![1])).toBeLessThanOrEqual(1)
    }
  })

  it('діагональ', () => {
    expect(linePoints(0, 0, 2, 2)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ])
  })
})

describe('objectPixels', () => {
  it('прямокутник — пікселі включно з краями, обрізаний кадром', () => {
    expect([...objectPixels(rectFromCorners(2, 1, 1, 2), 4, 3)]).toEqual([5, 6, 9, 10])
    expect([...objectPixels(rectFromCorners(3, 2, 9, 9), 4, 3)]).toEqual([11])
    expect(objectPixels(rectFromCorners(5, 5, 9, 9), 4, 3)).toHaveLength(0)
  })

  it('точка і лінія', () => {
    expect([...objectPixels({ kind: 'point', x: 1, y: 2 }, 4, 3)]).toEqual([9])
    expect(objectPixels({ kind: 'point', x: 4, y: 0 }, 4, 3)).toHaveLength(0)
    expect([...objectPixels({ kind: 'line', x0: 3, y0: 0, x1: 0, y1: 0 }, 4, 3)]).toEqual([3, 2, 1, 0])
  })
})

describe('pixelStats', () => {
  it('max/min/рівновагове середнє з координатами', () => {
    const temps = Float32Array.from([10, 30, 20, 40])
    expect(pixelStats(temps, [0, 1, 2])).toEqual({
      max: 30,
      min: 10,
      avg: 20,
      maxAt: 1,
      minAt: 0,
      count: 3,
      invalid: 0,
    })
  })

  it('пікселі поза калібруванням не враховуються', () => {
    const temps = Float32Array.from([NaN, 30, 20])
    const s = pixelStats(temps, [0, 1, 2])
    expect(s.avg).toBe(25)
    expect(s.invalid).toBe(1)
    const none = pixelStats(temps, [0])
    expect(none.max).toBeNaN()
    expect(none.maxAt).toBe(-1)
    expect(pixelStats(temps, []).avg).toBeNaN()
  })

  it('перший піксель з екстремумом — за порядком індексів', () => {
    expect(pixelStats([5, 5, 5], [2, 0, 1]).maxAt).toBe(2)
  })
})
