/** Масштаб і зсув зображення у вікні (ІЧ-кадр, видиме фото). Без DOM — тестується в Node. */

/** Масштаб (екранних пікселів на піксель зображення) і положення лівого верхнього кута зображення у вікні. */
export interface View {
  zoom: number
  panX: number
  panY: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 64
export const ZOOM_STEP = 1.25

/** Вписує зображення у вікно по центру. */
export function fitView(width: number, height: number, viewWidth: number, viewHeight: number): View {
  const zoom = Math.min(viewWidth / width, viewHeight / height)
  return { zoom, panX: (viewWidth - width * zoom) / 2, panY: (viewHeight - height * zoom) / 2 }
}

/** Новий масштаб у межах [MIN_ZOOM, MAX_ZOOM]; точка вікна (cx, cy) лишається на місці. */
export function zoomAt(view: View, next: number, cx: number, cy: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
  return {
    zoom,
    panX: cx - ((cx - view.panX) * zoom) / view.zoom,
    panY: cy - ((cy - view.panY) * zoom) / view.zoom,
  }
}

/** Прокрутка колеса, потрібна для одного кроку масштабу (стільки дає клацання миші в Chrome/Edge). */
const WHEEL_STEP_PX = 100
// Firefox рахує колесо в рядках — 3 на клацання
const WHEEL_LINE_PX = 40
const WHEEL_PAGE_PX = 800
/** У скільки разів щипок на тачпаді (колесо з ctrlKey і малими deltaY) чутливіший за прокрутку. */
const PINCH_GAIN = 10

/**
 * Множник масштабу за подією колеса — пропорційно відстані прокрутки, але не більше за `step` на подію.
 * Миша дає рідкі події з великою відстанню — один `step` на клацання; тачпад — десятки дрібних подій
 * на жест (ще й з інерцією), і фіксований крок на подію робив би масштабування надто швидким.
 */
export function wheelFactor(
  e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean },
  step = ZOOM_STEP,
): number {
  // Shift + колесо в деяких системах дає горизонтальну прокрутку
  const delta = e.deltaY || e.deltaX
  const px = delta * (e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1)
  const power = Math.min(1, (Math.abs(px) * (e.ctrlKey ? PINCH_GAIN : 1)) / WHEEL_STEP_PX)
  return step ** (px < 0 ? power : -power)
}
