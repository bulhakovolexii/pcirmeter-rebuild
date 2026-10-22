import { describe, expect, it } from 'vitest'
import { isothermBounds, isValidIsotherm, paintIsotherms, type Isotherm } from '../../src/core/isotherms'

const green: Isotherm['color'] = [0, 128, 0]
const blue: Isotherm['color'] = [0, 0, 255]

/** RGBA-кадр із сірих пікселів. */
const grey = (n: number) => new Uint8ClampedArray(n * 4).fill(100)
const rgbAt = (rgba: Uint8ClampedArray, i: number) => Array.from(rgba.subarray(4 * i, 4 * i + 3))

describe('ізотерми', () => {
  it('межі режимів: «вище» без верхньої межі, «нижче» без нижньої', () => {
    expect(isothermBounds({ mode: 'above', from: 30, to: 0, color: green })).toEqual({ lo: 30, hi: Infinity })
    expect(isothermBounds({ mode: 'below', from: 0, to: 20, color: green })).toEqual({
      lo: -Infinity,
      hi: 20,
    })
    expect(isothermBounds({ mode: 'between', from: 20, to: 30, color: green })).toEqual({ lo: 20, hi: 30 })
  })

  it('коректність: для «між» потрібно from < to, невикористана межа не перевіряється', () => {
    expect(isValidIsotherm({ mode: 'between', from: 30, to: 30, color: green })).toBe(false)
    expect(isValidIsotherm({ mode: 'between', from: 29.9, to: 30, color: green })).toBe(true)
    expect(isValidIsotherm({ mode: 'above', from: 30, to: NaN, color: green })).toBe(true)
    expect(isValidIsotherm({ mode: 'below', from: 0, to: NaN, color: green })).toBe(false)
  })

  it('фарбує пікселі в межах (межі входять), NaN — ні; альфа не змінюється', () => {
    const temps = [19.9, 20, 25, 30, 30.1, NaN, 1000]
    const rgba = grey(temps.length)
    const [count] = paintIsotherms(temps, rgba, [{ mode: 'between', from: 20, to: 30, color: green }])
    expect(count).toBe(3)
    expect(temps.map((_, i) => rgbAt(rgba, i)[1])).toEqual([100, 128, 128, 128, 100, 100, 100])
    expect(rgba[4 * 2 + 3]).toBe(100)

    const above = grey(temps.length)
    expect(paintIsotherms(temps, above, [{ mode: 'above', from: 30, to: 0, color: green }])).toEqual([3])
    expect(rgbAt(above, 6)).toEqual([0, 128, 0])
    expect(rgbAt(above, 5)).toEqual([100, 100, 100])
  })

  it('перша ізотерма — поверх другої; частки рахуються незалежно від перекриття', () => {
    const temps = [10, 25, 35]
    const rgba = grey(3)
    const counts = paintIsotherms(temps, rgba, [
      { mode: 'above', from: 20, to: 0, color: green },
      { mode: 'below', from: 0, to: 30, color: blue },
    ])
    expect(counts).toEqual([2, 2])
    expect(rgbAt(rgba, 0)).toEqual([0, 0, 255])
    expect(rgbAt(rgba, 1)).toEqual([0, 128, 0])
    expect(rgbAt(rgba, 2)).toEqual([0, 128, 0])
  })

  it('без ізотерм кадр не змінюється', () => {
    const rgba = grey(2)
    expect(paintIsotherms([1, 2], rgba, [])).toEqual([])
    expect(Array.from(rgba)).toEqual(Array.from(grey(2)))
  })
})
