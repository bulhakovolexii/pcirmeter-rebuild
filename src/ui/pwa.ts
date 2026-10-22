/**
 * Встановлення застосунку (PWA): реєстрація service worker (`src/sw/sw.ts`) і стан оновлення для банера в `App`.
 *
 * Новий SW не активується сам: сторінка з відкритими термограмами не має перезавантажуватися без дозволу.
 * Коли нова версія завантажена й чекає, `pwa.update = true`; кнопка «Оновити» викликає `applyUpdate()`.
 */
import { writable } from 'svelte/store'

export interface PwaState {
  /** Нова версія завантажена й чекає на «Оновити». */
  update: boolean
  /** Застосунок щойно вперше закешовано — працює без мережі (повідомлення показується один раз). */
  offlineReady: boolean
}

export const pwa = writable<PwaState>({ update: false, offlineReady: false })

// Структурні мінімуми API service worker (типи DOM недоступні в tsconfig тестів; у тестах — фейки)
interface Listenable {
  addEventListener(type: string, listener: () => void): void
}
interface SwLike extends Listenable {
  readonly state: string
  postMessage(message: unknown): void
}
interface RegistrationLike extends Listenable {
  readonly installing: SwLike | null
  readonly waiting: SwLike | null
}
export interface SwContainer extends Listenable {
  readonly controller: unknown
  register(url: string): Promise<RegistrationLike>
}

let waiting: SwLike | null = null
let reload = () => {}

/** @param onReload перезавантаження сторінки (`location.reload()`), коли нова версія взяла керування */
export async function registerServiceWorker(
  container: SwContainer,
  onReload: () => void,
  url = './sw.js',
): Promise<void> {
  reload = onReload
  // Перший SW на сторінці без контролера — це встановлення, а не оновлення
  const firstInstall = !container.controller
  let reloading = false
  container.addEventListener('controllerchange', () => {
    if (firstInstall || reloading) return
    reloading = true
    reload()
  })

  const reg = await container.register(url)
  const track = (sw: SwLike) => {
    const settle = () => {
      if (sw.state !== 'installed') return
      if (firstInstall) pwa.update((s) => ({ ...s, offlineReady: true }))
      else markWaiting(sw)
    }
    settle()
    sw.addEventListener('statechange', settle)
  }
  if (reg.waiting && !firstInstall) markWaiting(reg.waiting)
  if (reg.installing) track(reg.installing)
  reg.addEventListener('updatefound', () => {
    if (reg.installing) track(reg.installing)
  })
}

function markWaiting(sw: SwLike) {
  waiting = sw
  pwa.update((s) => ({ ...s, update: true }))
}

/** Активувати нову версію; сторінка перезавантажиться, щойно вона візьме керування (`controllerchange`). */
export function applyUpdate(): void {
  if (waiting) waiting.postMessage('skip-waiting')
  else reload()
}

export function dismissOfflineReady(): void {
  pwa.update((s) => ({ ...s, offlineReady: false }))
}

interface LaunchParams {
  files?: readonly { getFile(): Promise<File> }[]
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}

/**
 * Файли, відкриті через «Відкрити за допомогою» встановленого застосунку (`file_handlers` у маніфесті;
 * Chromium на комп'ютері). Без підтримки — нічого не робить.
 */
export function onLaunchFiles(
  open: (files: File[]) => void,
  w: { launchQueue?: LaunchQueue } = globalThis as { launchQueue?: LaunchQueue },
): void {
  w.launchQueue?.setConsumer(async ({ files }) => {
    if (files?.length) open(await Promise.all(files.map((h) => h.getFile())))
  })
}
