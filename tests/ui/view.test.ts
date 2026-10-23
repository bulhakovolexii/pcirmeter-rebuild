import { describe, expect, it } from 'vitest'
import { wheelFactor, ZOOM_STEP } from '../../src/ui/view'

const wheel = (deltaY: number, more: Partial<{ deltaX: number; deltaMode: number; ctrlKey: boolean }> = {}) =>
  wheelFactor({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false, ...more })

describe('wheelFactor', () => {
  it('клацання миші — повний крок, угору збільшує', () => {
    expect(wheel(-100)).toBeCloseTo(ZOOM_STEP)
    expect(wheel(100)).toBeCloseTo(1 / ZOOM_STEP)
    expect(wheel(-3, { deltaMode: 1 })).toBeCloseTo(ZOOM_STEP) // Firefox: рядки
  })

  it('не більше кроку на подію', () => {
    expect(wheel(-1000)).toBeCloseTo(ZOOM_STEP)
  })

  it('дрібні події тачпада складаються в той самий масштаб, що й одне клацання', () => {
    let f = 1
    for (let i = 0; i < 25; i++) f *= wheel(-4)
    expect(f).toBeCloseTo(ZOOM_STEP)
  })

  it('щипок (ctrlKey) чутливіший; Shift — горизонтальна прокрутка', () => {
    expect(wheel(-10, { ctrlKey: true })).toBeCloseTo(ZOOM_STEP)
    expect(wheel(0, { deltaX: -100 })).toBeCloseTo(ZOOM_STEP)
    expect(wheel(0)).toBe(1)
  })
})
