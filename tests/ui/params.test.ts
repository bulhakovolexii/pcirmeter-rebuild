import { describe, expect, it } from 'vitest'
import { isValidParam, objectParams, temperatureModel } from '../../src/core/temperature'
import { parseThermogram } from '../../src/core/parser'
import {
  displayLimits,
  displayValue,
  isChanged,
  paramsForm,
  parseParam,
  type Units,
} from '../../src/ui/params'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const C: Units = { temperature: 'C', length: 'm' }
const F: Units = { temperature: 'F', length: 'ft' }
const K: Units = { temperature: 'K', length: 'm' }

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')
const ir = () => parseThermogram(new Uint8Array(readFileSync(sample)).buffer).ir

describe('межі параметрів (як у формі оригіналу)', () => {
  it('ε 0,10…1,00, вологість 0…1, відстань 0…5000 м', () => {
    expect(isValidParam('emissivity', 0.1)).toBe(true)
    expect(isValidParam('emissivity', 0.09)).toBe(false)
    expect(isValidParam('emissivity', 1.01)).toBe(false)
    expect(isValidParam('humidity', 1)).toBe(true)
    expect(isValidParam('distance', 5001)).toBe(false)
    expect(isValidParam('reflectedTemp', -100)).toBe(true)
    expect(isValidParam('airTemp', -41)).toBe(false)
    expect(isValidParam('airTemp', NaN)).toBe(false)
  })

  it('межі в одиницях показу; межа, введена в K / °F, приймається', () => {
    expect(displayLimits('reflectedTemp', F)).toEqual({ min: -148, max: 3632 })
    expect(displayLimits('distance', F)).toEqual({ min: 0, max: 16404.2 })
    expect(displayLimits('humidity', C)).toEqual({ min: 0, max: 100 })
    expect(parseParam('reflectedTemp', 173.15, K)).toBeCloseTo(-100, 9)
    expect(parseParam('airTemp', -40, F)).toBeCloseTo(-40, 9)
  })
})

describe('поля форми', () => {
  it('перерахунок і округлення до кроку поля', () => {
    const p = objectParams(ir().params, { reflectedTemp: 20, humidity: 0.456, distance: 2 })
    const form = paramsForm(p, F)
    expect(form.reflectedTemp).toBe(68)
    expect(form.humidity).toBe(46)
    expect(form.distance).toBe(6.6)
    expect(displayValue('emissivity', 0.951, C)).toBe(0.95)
  })

  it('порожнє, не число або поза межами → null', () => {
    expect(parseParam('emissivity', null, C)).toBeNull()
    expect(parseParam('emissivity', NaN, C)).toBeNull()
    expect(parseParam('emissivity', 0.05, C)).toBeNull()
    expect(parseParam('humidity', 80, C)).toBe(0.8)
    expect(parseParam('distance', 32.8084, F)).toBeCloseTo(10, 9)
  })

  it('«змінено» — з точністю до кроку поля в поточних одиницях', () => {
    expect(isChanged('reflectedTemp', 20, 20.04, C)).toBe(false)
    expect(isChanged('reflectedTemp', 20, 20.1, C)).toBe(true)
    // Те саме значення, введене в °F, не вважається зміною
    const typed = parseParam('reflectedTemp', 71.6, F)!
    expect(isChanged('reflectedTemp', typed, 22, F)).toBe(false)
  })

  it('зміна ε змінює температуру (миттєвий перерахунок через модель)', () => {
    const image = ir()
    const { fpgaLevel, fpgaSpan } = image.params
    const ad = fpgaLevel + fpgaSpan
    const base = temperatureModel(image).toCelsius(ad)
    const lower = temperatureModel(image, { emissivity: parseParam('emissivity', 0.7, C)! }).toCelsius(ad)
    expect(lower).toBeGreaterThan(base + 1)
  })
})
