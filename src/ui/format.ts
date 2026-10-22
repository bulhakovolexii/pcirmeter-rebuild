/** Форматування чисел і дат для інтерфейсу. */

import { fromCelsius, type LengthUnit, type TemperatureUnit } from '../core/units'
import type { Locale } from '../i18n'

/** Позначення одиниць (однакові для uk і en). */
export const TEMPERATURE_SYMBOL: Record<TemperatureUnit, string> = { C: '°C', F: '°F', K: 'K' }
export const LENGTH_SYMBOL: Record<LengthUnit, Record<Locale, string>> = {
  m: { uk: 'м', en: 'm' },
  ft: { uk: 'фут', en: 'ft' },
}

const formatters = new Map<string, Intl.NumberFormat>()

/** Число з фіксованою кількістю знаків після коми за правилами мови (uk — кома). */
export function formatNumber(value: number, locale: Locale, digits = 1): string {
  const key = `${locale}:${digits}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formatters.set(key, f)
  }
  return f.format(value)
}

/** Температура (вхід — °C) у заданій одиниці з одним знаком; `NaN` → «—». */
export function formatTemperature(celsius: number, locale: Locale, unit: TemperatureUnit = 'C'): string {
  if (Number.isNaN(celsius)) return '—'
  return `${formatNumber(fromCelsius(celsius, unit), locale)} ${TEMPERATURE_SYMBOL[unit]}`
}

/** `YYYYMMDDhhmmss` із файлу → `YYYY-MM-DD hh:mm:ss`; інше — як є. */
export function formatSavedAt(raw: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw)
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : raw
}

/** Стан виміряної температури відносно діапазону камери. */
export type TemperatureStatus = 'ok' | 'out-of-range' | 'no-calibration'

export function temperatureStatus(value: number, range: { min: number; max: number }): TemperatureStatus {
  if (Number.isNaN(value)) return 'no-calibration'
  return value < range.min || value > range.max ? 'out-of-range' : 'ok'
}
