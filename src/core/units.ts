/** Одиниці температури, які пропонує оригінал (°C / °F / K). */
export type TemperatureUnit = 'C' | 'F' | 'K'

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
