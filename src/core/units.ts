/** Одиниці температури, які пропонує оригінал (°C / °F / K). */
export type TemperatureUnit = 'C' | 'F' | 'K'

/** Одиниці відстані (м / фут). */
export type LengthUnit = 'm' | 'ft'

/** Футів в одному метрі — стала оригіналу (`IRImageBox`, `LengthEnum.ft`). */
export const FEET_PER_METER = 3.28084

/** Переводить температуру з °C у задану одиницю. */
export function fromCelsius(celsius: number, unit: TemperatureUnit): number {
  switch (unit) {
    case 'C':
      return celsius
    case 'F':
      return (celsius * 9) / 5 + 32
    case 'K':
      return celsius + 273.15
  }
}

/** Переводить температуру із заданої одиниці в °C. */
export function toCelsius(value: number, unit: TemperatureUnit): number {
  switch (unit) {
    case 'C':
      return value
    case 'F':
      return ((value - 32) * 5) / 9
    case 'K':
      return value - 273.15
  }
}

/** Переводить відстань з метрів у задану одиницю. */
export function fromMeters(meters: number, unit: LengthUnit): number {
  return unit === 'ft' ? meters * FEET_PER_METER : meters
}

/** Переводить відстань із заданої одиниці в метри. */
export function toMeters(value: number, unit: LengthUnit): number {
  return unit === 'ft' ? value / FEET_PER_METER : value
}
