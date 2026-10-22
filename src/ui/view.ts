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
