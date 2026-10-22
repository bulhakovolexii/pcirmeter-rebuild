/** Глобальні налаштування показу (одиниці, ширина бічної панелі); пам'ятаються в браузері, якщо `localStorage` доступне. */

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

/** Ширина бічної панелі, px: за замовчуванням, межі (максимум — ще й не більше половини переглядача). */
export const SIDEBAR = { default: 240, min: 200, max: 560 } as const
const SIDEBAR_KEY = 'pcirmeter.sidebarWidth'

export function clampSidebarWidth(width: number, viewerWidth = Infinity): number {
  const max = Math.max(SIDEBAR.min, Math.min(SIDEBAR.max, Math.floor(viewerWidth / 2)))
  return Number.isFinite(width) ? Math.round(Math.min(max, Math.max(SIDEBAR.min, width))) : SIDEBAR.default
}

function loadSidebarWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SIDEBAR_KEY)
    return raw ? clampSidebarWidth(Number(raw)) : SIDEBAR.default
  } catch {
    return SIDEBAR.default
  }
}

/** Спільна для всіх вкладок: змінюється перетягуванням межі панелі у `Viewer`. */
export const sidebarWidth = writable<number>(loadSidebarWidth())

sidebarWidth.subscribe((value) => {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_KEY, String(value))
  } catch {
    // див. вище
  }
})
