/** Глобальні налаштування показу (одиниці); пам'ятаються в браузері, якщо `localStorage` доступне. */

import { writable } from 'svelte/store'
import type { Units } from './params'

const KEY = 'pcirmeter.units'
const DEFAULT_UNITS: Units = { temperature: 'C', length: 'm' }

function load(): Units {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return DEFAULT_UNITS
    const saved = JSON.parse(raw) as Partial<Units>
    return {
      temperature: ['C', 'F', 'K'].includes(saved.temperature ?? '') ? saved.temperature! : 'C',
      length: saved.length === 'ft' ? 'ft' : 'm',
    }
  } catch {
    return DEFAULT_UNITS
  }
}

export const units = writable<Units>(load())

units.subscribe((value) => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value))
  } catch {
    // Сховище недоступне (приватне вікно, заборона) — налаштування діє до перезавантаження
  }
})
