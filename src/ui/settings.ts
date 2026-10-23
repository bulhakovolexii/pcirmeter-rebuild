/** Глобальні налаштування показу (одиниці, розміри панелей); пам'ятаються в браузері, якщо `localStorage` доступне. */

import { writable, type Writable } from 'svelte/store'
import type { Units } from './params'

/** Store, що пам'ятається в `localStorage` під ключем `key`; `parse` перевіряє й обмежує збережене. */
function persisted<T>(key: string, fallback: T, parse: (raw: string) => T): Writable<T> {
  let initial = fallback
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (raw) initial = parse(raw)
  } catch {
    // Пошкоджене чи недоступне сховище — значення за замовчуванням
  }
  const store = writable<T>(initial)
  store.subscribe((value) => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      // Сховище недоступне (приватне вікно, заборона) — налаштування діє до перезавантаження
    }
  })
  return store
}

const DEFAULT_UNITS: Units = { temperature: 'C', length: 'm' }

export const units = persisted<Units>('pcirmeter.units', DEFAULT_UNITS, (raw) => {
  const saved = JSON.parse(raw) as Partial<Units>
  return {
    temperature: ['C', 'F', 'K'].includes(saved.temperature ?? '') ? saved.temperature! : 'C',
    length: saved.length === 'ft' ? 'ft' : 'm',
  }
})

/** Ширина бічної панелі, px: за замовчуванням, межі (максимум — ще й не більше половини переглядача). */
export const SIDEBAR = { default: 240, min: 200, max: 560 } as const

export function clampSidebarWidth(width: number, viewerWidth = Infinity): number {
  const max = Math.max(SIDEBAR.min, Math.min(SIDEBAR.max, Math.floor(viewerWidth / 2)))
  return Number.isFinite(width) ? Math.round(Math.min(max, Math.max(SIDEBAR.min, width))) : SIDEBAR.default
}

/** Спільна для всіх вкладок: змінюється перетягуванням межі панелі у `Viewer`. */
export const sidebarWidth = persisted('pcirmeter.sidebarWidth', SIDEBAR.default, (raw) =>
  clampSidebarWidth(Number(raw)),
)

/** Частка ширини, яку займає ІЧ-зображення поруч із видимим фото. */
export const PHOTO_SPLIT = { default: 0.5, min: 0.25, max: 0.75 } as const

export function clampPhotoSplit(share: number): number {
  return Number.isFinite(share)
    ? Math.min(PHOTO_SPLIT.max, Math.max(PHOTO_SPLIT.min, share))
    : PHOTO_SPLIT.default
}

/**
 * Висота нижньої смуги (таблиця результатів, профіль / розподіл), px. Максимум — ще й так, щоб зображенню
 * лишалось щонайменше `BOTTOM.keepImage` px висоти області.
 */
export const BOTTOM = { default: 228, min: 132, max: 720, keepImage: 240 } as const

export function clampBottomHeight(height: number, areaHeight = Infinity): number {
  const max = Math.max(BOTTOM.min, Math.min(BOTTOM.max, Math.floor(areaHeight - BOTTOM.keepImage)))
  return Number.isFinite(height) ? Math.round(Math.min(max, Math.max(BOTTOM.min, height))) : BOTTOM.default
}

export const bottomHeight = persisted('pcirmeter.bottomHeight', BOTTOM.default, (raw) =>
  clampBottomHeight(Number(raw)),
)

export const photoSplit = persisted('pcirmeter.photoSplit', PHOTO_SPLIT.default, (raw) =>
  clampPhotoSplit(Number(raw)),
)
