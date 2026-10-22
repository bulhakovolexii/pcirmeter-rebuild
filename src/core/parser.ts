/**
 * Розбір радіометричних термограм PCIRMeter / CEM (`*.jpg`, `*.hir`).
 * Формат — docs/spec/file-format.md.
 */

const FILE_PARA_SIZE = 0xa0
const BLOCK_TABLE_SIZE = 16 * 16
const IR_HEADER_SIZE = 0x700
const LUT_MAX_POINTS = 60
/** `File_Type`, за якого видимим фото є головний JPEG. */
const FILE_TYPE_MAIN_VISIBLE = 3

/** Типи блоків у таблиці `Type_Data_t`. */
export const BlockType = {
  ir: 0,
  audio: 1,
  userText: 3,
  visibleJpeg: 4,
  custom: 6,
} as const

export type ThermogramErrorCode =
  'too-short' | 'no-trailer' | 'bad-block' | 'no-ir-block' | 'ir-truncated' | 'bad-calibration'

/** Файл не є термограмою підтримуваного формату або пошкоджений. */
export class ThermogramError extends Error {
  readonly code: ThermogramErrorCode

  constructor(code: ThermogramErrorCode, message: string) {
    super(message)
    this.name = 'ThermogramError'
    this.code = code
  }
}

/** `File_Para_t` — загальні відомості про файл і камеру. */
export interface FileInfo {
  /** Модель / прапорець, напр. `DT-980`; у файлах 2013 р. порожній. */
  model: string
  producer: string
  calibrationDate: string
  serial: string
  firmware: string
  /** Час зйомки як у файлі: `YYYYMMDDhhmmss`. */
  savedAt: string
  imageWidth: number
  imageHeight: number
  additionWidth: number
  additionHeight: number
  sensorWidth: number
  sensorHeight: number
  fileType: number
  typeNum: number
}

/** Запис таблиці блоків (лише непорожні). */
export interface BlockEntry {
  type: number
  offset: number
  length: number
}

/** Параметри з заголовка ІЧ-блоку. Температури — °C, частки — 0…1. */
export interface IrParams {
  emissivity: number
  /** Відстань до об'єкта, м. */
  distance: number
  airTemp: number
  humidity: number
  reflectedTemp: number
  offset: number
  level: number
  span: number
  /** Верхня межа автошкали, записана камерою (не максимум кадру). */
  maxTemp: number
  /** Нижня межа автошкали, записана камерою. */
  minTemp: number
  lens: number
  /** 0 → −20…150 °C, 1 → 0…400 °C. */
  tempRange: number
  fpgaLevel: number
  fpgaSpan: number
  shutterTemp: number
  /** Поправка затвора в AD; 0 — відсутня. */
  deltaAd: number
}

/** Калібрувальна таблиця AD → °C (вузли зростають за AD). */
export interface Calibration {
  ad: Uint16Array
  temp: Int16Array
}

export interface IrImage {
  width: number
  height: number
  params: IrParams
  calibration: Calibration
  /** Сирі відліки АЦП, рядок за рядком: піксель (x, y) → `ad[y * width + x]`. */
  ad: Uint16Array
  /** Копія заголовка ІЧ-блоку (0x700 байт) — для полів, які ще не розібрано. */
  header: Uint8Array
  /** Дані після кадру (1024 байти у файлах 2013 р.), призначення невідоме. */
  extra: Uint8Array
}

export interface Thermogram {
  info: FileInfo
  blocks: BlockEntry[]
  /** Головний JPEG (байти до `File_Para_t`). */
  jpeg: Uint8Array
  ir: IrImage
  /** Видиме фото: блок type 4, а при `File_Type = 3` — головний JPEG (як в оригіналі). */
  visibleJpeg?: Uint8Array
  /** Сирі байти тексту користувача; кодування не визначено — декодує UI. */
  userText?: Uint8Array
  audio?: Uint8Array
  custom?: Uint8Array
}

/** Розбирає файл термограми; кидає `ThermogramError`, якщо це не термограма. */
export function parseThermogram(input: ArrayBuffer | Uint8Array): Thermogram {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const size = bytes.byteLength

  if (size < FILE_PARA_SIZE + BLOCK_TABLE_SIZE + 4) {
    throw new ThermogramError('too-short', `Файл занадто короткий (${size} Б) для термограми`)
  }

  const t0 = view.getUint32(size - 4, true)
  if (
    t0 + FILE_PARA_SIZE + BLOCK_TABLE_SIZE > size - 4 ||
    view.getInt32(t0 + 0x08, true) !== FILE_PARA_SIZE
  ) {
    throw new ThermogramError(
      'no-trailer',
      'Немає радіометричних даних: це звичайне зображення, а не термограма',
    )
  }

  const info = readFileInfo(bytes, view, t0)
  const blocks = readBlocks(view, t0, size)

  const irBlock = blocks.find((b) => b.type === BlockType.ir)
  if (!irBlock) {
    throw new ThermogramError('no-ir-block', 'У файлі немає ІЧ-кадру')
  }

  const part = (type: number) => {
    const b = blocks.find((e) => e.type === type)
    return b && bytes.slice(b.offset, b.offset + b.length)
  }

  const jpeg = bytes.slice(0, t0)
  return {
    info,
    blocks,
    jpeg,
    ir: readIr(bytes, view, irBlock, info.sensorWidth, info.sensorHeight),
    visibleJpeg: info.fileType === FILE_TYPE_MAIN_VISIBLE ? jpeg : part(BlockType.visibleJpeg),
    userText: part(BlockType.userText),
    audio: part(BlockType.audio),
    custom: part(BlockType.custom),
  }
}

function readFileInfo(bytes: Uint8Array, view: DataView, t0: number): FileInfo {
  const i16 = (o: number) => view.getInt16(t0 + o, true)
  return {
    model: cString(bytes, t0, 8),
    producer: cString(bytes, t0 + 0x0c, 16),
    calibrationDate: cString(bytes, t0 + 0x1c, 16),
    serial: cString(bytes, t0 + 0x2c, 16),
    firmware: cString(bytes, t0 + 0x3c, 16),
    savedAt: cString(bytes, t0 + 0x4c, 16),
    imageWidth: i16(0x5c),
    imageHeight: i16(0x5e),
    additionWidth: i16(0x60),
    additionHeight: i16(0x62),
    sensorWidth: i16(0x64),
    sensorHeight: i16(0x66),
    fileType: i16(0x68),
    typeNum: i16(0x6a),
  }
}

function readBlocks(view: DataView, t0: number, size: number): BlockEntry[] {
  const blocks: BlockEntry[] = []
  for (let k = 0; k < 16; k++) {
    const o = t0 + FILE_PARA_SIZE + 16 * k
    const length = view.getInt32(o + 8, true)
    if (length === 0) continue
    const type = view.getInt32(o, true)
    const offset = view.getInt32(o + 4, true)
    if (length < 0 || offset < 0 || offset + length > size - 4) {
      throw new ThermogramError('bad-block', `Пошкоджена таблиця блоків: запис ${k} виходить за межі файлу`)
    }
    blocks.push({ type, offset, length })
  }
  return blocks
}

function readIr(
  bytes: Uint8Array,
  view: DataView,
  block: BlockEntry,
  width: number,
  height: number,
): IrImage {
  const pixels = width * height
  if (width <= 0 || height <= 0 || block.length < IR_HEADER_SIZE + 2 * pixels) {
    throw new ThermogramError(
      'ir-truncated',
      `ІЧ-блок (${block.length} Б) замалий для кадру ${width}×${height}`,
    )
  }

  const h = block.offset
  const u8 = (o: number) => view.getUint8(h + o)
  const u16 = (o: number) => view.getUint16(h + o, true)
  // (u16 − 1000) / 10 ≡ u16 / 10 − 100, але без хвостів на кшталт 12.799999…
  const temp = (o: number) => (u16(o) - 1000) / 10
  const rawDeltaAd = u16(0x5c)

  const params: IrParams = {
    emissivity: u8(0x25) / 100,
    distance: u16(0x26),
    airTemp: temp(0x28),
    humidity: u8(0x2a) / 100,
    reflectedTemp: temp(0x2c),
    offset: temp(0x2e),
    level: temp(0x30),
    span: temp(0x32),
    maxTemp: temp(0x34),
    minTemp: temp(0x36),
    lens: u16(0x38),
    tempRange: u8(0x3a),
    fpgaLevel: u16(0x50),
    fpgaSpan: u16(0x52),
    shutterTemp: temp(0x54),
    deltaAd: rawDeltaAd ? rawDeltaAd - 10000 : 0,
  }

  const n = u16(0x600)
  if (n < 2 || n > LUT_MAX_POINTS) {
    throw new ThermogramError('bad-calibration', `Некоректна калібрувальна таблиця: ${n} вузлів`)
  }
  const calibration: Calibration = { ad: new Uint16Array(n), temp: new Int16Array(n) }
  for (let i = 0; i < n; i++) {
    calibration.ad[i] = u16(0x604 + 2 * i)
    calibration.temp[i] = view.getInt16(h + 0x680 + 2 * i, true)
    if (i > 0 && calibration.ad[i]! <= calibration.ad[i - 1]!) {
      throw new ThermogramError('bad-calibration', 'Некоректна калібрувальна таблиця: вузли AD не зростають')
    }
  }

  // Блок може починатися з непарного зсуву, тож без прямого Uint16Array-подання буфера.
  const ad = new Uint16Array(pixels)
  const base = h + IR_HEADER_SIZE
  for (let i = 0; i < pixels; i++) ad[i] = view.getUint16(base + 2 * i, true)

  return {
    width,
    height,
    params,
    calibration,
    ad,
    header: bytes.slice(h, h + IR_HEADER_SIZE),
    extra: bytes.slice(base + 2 * pixels, h + block.length),
  }
}

/** ASCII-рядок фіксованої довжини; закінчується на `\0` або `0xFF` (роздільник у деяких полях). */
function cString(bytes: Uint8Array, start: number, length: number): string {
  let s = ''
  for (let i = start; i < start + length; i++) {
    const c = bytes[i]!
    if (c === 0 || c === 0xff) break
    s += String.fromCharCode(c)
  }
  return s
}
