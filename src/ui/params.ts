/**
 * Логіка панелі параметрів об'єкта без DOM: перерахунок в одиниці показу, округлення, межі.
 * Модель завжди зберігає °C, метри й частки — одиниці впливають лише на показ і введення.
 */

import { isValidParam, PARAM_LIMITS, type EditableParam, type ObjectParams } from '../core/temperature'
import {
  fromCelsius,
  fromMeters,
  toCelsius,
  toMeters,
  type LengthUnit,
  type TemperatureUnit,
} from '../core/units'

export interface Units {
  temperature: TemperatureUnit
  length: LengthUnit
}

/** Поля панелі в порядку показу. */
export const PARAM_FIELDS: readonly EditableParam[] = [
  'emissivity',
  'reflectedTemp',
  'airTemp',
  'humidity',
  'distance',
]

/** Знаків після коми — як у полях оригіналу (крок = одиниця останнього знака). */
const DIGITS: Record<EditableParam, number> = {
  emissivity: 2,
  reflectedTemp: 1,
  airTemp: 1,
  humidity: 0,
  distance: 1,
}

export function paramDigits(key: EditableParam): number {
  return DIGITS[key]
}

export function paramStep(key: EditableParam): number {
  return 10 ** -DIGITS[key]
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

/** Значення моделі → одиниці показу (без округлення). Вологість показується у відсотках. */
export function toDisplay(key: EditableParam, value: number, units: Units): number {
  switch (key) {
    case 'emissivity':
      return value
    case 'humidity':
      return value * 100
    case 'distance':
      return fromMeters(value, units.length)
    case 'reflectedTemp':
    case 'airTemp':
      return fromCelsius(value, units.temperature)
  }
}

/** Одиниці показу → значення моделі. */
export function fromDisplay(key: EditableParam, value: number, units: Units): number {
  switch (key) {
    case 'emissivity':
      return value
    case 'humidity':
      return value / 100
    case 'distance':
      return toMeters(value, units.length)
    case 'reflectedTemp':
    case 'airTemp':
      return toCelsius(value, units.temperature)
  }
}

/** Значення для поля введення: в одиницях показу, округлене до кроку поля. */
export function displayValue(key: EditableParam, value: number, units: Units): number {
  return round(toDisplay(key, value, units), DIGITS[key])
}

/** Межі поля в одиницях показу (округлені до кроку). */
export function displayLimits(key: EditableParam, units: Units): { min: number; max: number } {
  const { min, max } = PARAM_LIMITS[key]
  return { min: displayValue(key, min, units), max: displayValue(key, max, units) }
}

/** Значення всіх полів форми для параметрів моделі. */
export function paramsForm(params: ObjectParams, units: Units): Record<EditableParam, number> {
  const form = {} as Record<EditableParam, number>
  for (const key of PARAM_FIELDS) form[key] = displayValue(key, params[key], units)
  return form
}

/**
 * Введене в поле значення → значення моделі; `null`, якщо поле порожнє, не число або поза межами.
 * `input` — те, що дає `bind:value` числового поля (`null` для порожнього).
 */
export function parseParam(key: EditableParam, input: number | null, units: Units): number | null {
  if (input === null || !Number.isFinite(input)) return null
  const value = fromDisplay(key, input, units)
  return isValidParam(key, value) ? value : null
}

/** Чи відрізняється параметр від значення з файлу так, що це видно в полі (з точністю до кроку). */
export function isChanged(key: EditableParam, value: number, original: number, units: Units): boolean {
  return displayValue(key, value, units) !== displayValue(key, original, units)
}
