/** Форматування чисел і дат для інтерфейсу. */

import type { Locale } from '../i18n'

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

/** Температура в °C з одним знаком; `NaN` → «—». */
export function formatCelsius(value: number, locale: Locale): string {
  return Number.isNaN(value) ? '—' : `${formatNumber(value, locale)} °C`
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
