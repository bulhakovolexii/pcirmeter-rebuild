/** Видиме фото й накладення ІЧ-кадру (docs/spec/features.md §2.6). Без DOM — тестується в Node. */

import type { View } from './view'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Частка висоти фото, яку займає ІЧ-кадр іншої пропорції (DT-980: 80×80 → 640 px у JPEG 1280×960) — гіпотеза. */
const INSET_HEIGHT = 2 / 3

/**
 * Розміщення ІЧ-кадру на фото за замовчуванням, у пікселях фото. Однакові пропорції — на все фото (оригінал і
 * камери 2013 р.); інакше — по центру висотою 2/3 фото зі збереженням пропорцій кадру (головний JPEG DT-980).
 */
export function defaultPlacement(sensorW: number, sensorH: number, photoW: number, photoH: number): Rect {
  const sensorAspect = sensorW / sensorH
  const photoAspect = photoW / photoH
  if (Math.abs(sensorAspect / photoAspect - 1) < 0.01) return { x: 0, y: 0, width: photoW, height: photoH }
  let height = photoH * INSET_HEIGHT
  let width = height * sensorAspect
  if (width > photoW) {
    width = photoW
    height = width / sensorAspect
  }
  return { x: (photoW - width) / 2, y: (photoH - height) / 2, width, height }
}

/** Розмір JPEG із маркера SOF (без декодування); `null`, якщо маркер не знайдено. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const u16 = (o: number) => (bytes[o]! << 8) | bytes[o + 1]!
  let o = 2
  while (o + 9 < bytes.length) {
    if (bytes[o] !== 0xff) {
      o++
      continue
    }
    const marker = bytes[o + 1]!
    // SOF0…SOF15, крім DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: u16(o + 7), height: u16(o + 5) }
    }
    // Маркери без довжини: заповнювач FF, TEM, RSTn
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += marker === 0xff ? 1 : 2
      continue
    }
    o += 2 + u16(o + 2)
  }
  return null
}

/** Ручне суміщення ІЧ-шару з фото: масштаб відносно розміщення за замовчуванням (навколо його центру) і зсув, px фото. */
export interface Alignment {
  scale: number
  dx: number
  dy: number
}

export const NO_ALIGNMENT: Alignment = { scale: 1, dx: 0, dy: 0 }
const MIN_LAYER_SCALE = 0.2
const MAX_LAYER_SCALE = 5

/** ІЧ-шар на фото з урахуванням суміщення, px фото. */
export function layerRect(base: Rect, a: Alignment): Rect {
  const width = base.width * a.scale
  const height = base.height * a.scale
  return {
    x: base.x + (base.width - width) / 2 + a.dx,
    y: base.y + (base.height - height) / 2 + a.dy,
    width,
    height,
  }
}

function alignmentFor(base: Rect, r: Rect): Alignment {
  return {
    scale: r.width / base.width,
    dx: r.x - base.x - (base.width - r.width) / 2,
    dy: r.y - base.y - (base.height - r.height) / 2,
  }
}

/** Зсув вікна фото відносно ІЧ-вікна, за якого їхні центри збігаються: (розмір фото − розмір ІЧ) / 2. */
export interface Offset {
  x: number
  y: number
}

export function centerOffset(irW: number, irH: number, photoW: number, photoH: number): Offset {
  return { x: (photoW - irW) / 2, y: (photoH - irH) / 2 }
}

/**
 * Вид фото, синхронний з ІЧ-вікном: кожна точка ІЧ-шару стоїть відносно центру вікна фото там само, де на
 * ІЧ-зображенні відносно центру ІЧ-вікна (`offset` — `centerOffset`; нуль — синхронізація за лівим верхнім кутом).
 */
export function syncedPhotoView(
  ir: View,
  layer: Rect,
  frameWidth: number,
  offset: Offset = { x: 0, y: 0 },
): View {
  const zoom = (ir.zoom * frameWidth) / layer.width
  return { zoom, panX: ir.panX + offset.x - layer.x * zoom, panY: ir.panY + offset.y - layer.y * zoom }
}

/** Обернене до `syncedPhotoView`: вид ІЧ-вікна для заданого виду фото. */
export function irViewFor(
  photo: View,
  layer: Rect,
  frameWidth: number,
  offset: Offset = { x: 0, y: 0 },
): View {
  return {
    zoom: (photo.zoom * layer.width) / frameWidth,
    panX: photo.panX + layer.x * photo.zoom - offset.x,
    panY: photo.panY + layer.y * photo.zoom - offset.y,
  }
}

/**
 * Зсув суміщення на (deltaX, deltaY) екранних пікселів. За синхронізації ІЧ стоїть на місці й за курсором рухається
 * фото; без неї — рухається ІЧ-шар над нерухомим фото.
 */
export function moveAlignment(
  a: Alignment,
  deltaX: number,
  deltaY: number,
  photoZoom: number,
  sync: boolean,
): Alignment {
  const k = (sync ? -1 : 1) / photoZoom
  return { ...a, dx: a.dx + deltaX * k, dy: a.dy + deltaY * k }
}

/**
 * Масштаб суміщення ×`factor` навколо точки вікна (cx, cy) при виді фото `photo`. За синхронізації фото
 * збільшується під нерухомим ІЧ (шар зменшується в px фото); без неї — ІЧ-шар над нерухомим фото.
 * Точка фото під курсором лишається на місці. Поза межами масштабу шару — без змін.
 */
export function scaleAlignment(
  base: Rect,
  a: Alignment,
  factor: number,
  cx: number,
  cy: number,
  photo: View,
  sync: boolean,
): Alignment {
  const r = layerRect(base, a)
  const px = (cx - photo.panX) / photo.zoom
  const py = (cy - photo.panY) / photo.zoom
  let next: Rect
  if (sync) {
    // Вид ІЧ незмінний: його зсув у вікні — photo.pan + r·photo.zoom; новий масштаб фото — photo.zoom·factor
    const zoom = photo.zoom * factor
    const irPanX = photo.panX + r.x * photo.zoom
    const irPanY = photo.panY + r.y * photo.zoom
    next = {
      x: px - (cx - irPanX) / zoom,
      y: py - (cy - irPanY) / zoom,
      width: r.width / factor,
      height: r.height / factor,
    }
  } else {
    next = {
      x: px - (px - r.x) * factor,
      y: py - (py - r.y) * factor,
      width: r.width * factor,
      height: r.height * factor,
    }
  }
  const scale = next.width / base.width
  return scale < MIN_LAYER_SCALE || scale > MAX_LAYER_SCALE ? a : alignmentFor(base, next)
}
