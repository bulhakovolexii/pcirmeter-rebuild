import { describe, expect, it } from 'vitest'
import { fromCelsius, toCelsius, type TemperatureUnit } from '../../src/core/units'

describe('units', () => {
  it('переводить опорні точки', () => {
    expect(fromCelsius(0, 'F')).toBe(32)
    expect(fromCelsius(100, 'F')).toBe(212)
    expect(fromCelsius(-40, 'F')).toBe(-40)
    expect(fromCelsius(0, 'K')).toBeCloseTo(273.15, 10)
    expect(fromCelsius(36.6, 'C')).toBe(36.6)
  })

  it('toCelsius обернена до fromCelsius', () => {
    for (const unit of ['C', 'F', 'K'] as TemperatureUnit[]) {
      for (const c of [-20, 0, 21.5, 150]) {
        expect(toCelsius(fromCelsius(c, unit), unit)).toBeCloseTo(c, 10)
      }
    }
  })
})
