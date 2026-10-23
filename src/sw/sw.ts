/**
 * Service worker: увесь застосунок (≈ 150 КБ) передкешовується при встановленні й далі працює без мережі.
 * Термограми відкриваються локально, тож мережа потрібна лише для оновлення самого застосунку.
 *
 * Збирає плагін `vite.pwa.ts`: перед цим кодом він дописує `__PRECACHE__` (файли збірки, шляхи відносно
 * області дії SW) і `__VERSION__` (хеш їхнього вмісту — будь-яка зміна збірки змінює `sw.js`, і браузер
 * встановлює новий SW). Новий SW чекає, доки застосунок не надішле `skip-waiting` (див. `src/ui/pwa.ts`).
 */
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope
declare const __PRECACHE__: string[]
declare const __VERSION__: string

const PREFIX = 'pcirmeter-'
const CACHE = PREFIX + __VERSION__
const scope = new URL(self.registration.scope)
const INDEX = new URL('./', scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' — повз HTTP-кеш браузера, щоб не закешувати застарілий файл під новою версією
      cache.addAll(__PRECACHE__.map((path) => new Request(new URL(path, scope), { cache: 'reload' }))),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(scope.href)) return
  event.respondWith(fromCache(request))
})

async function fromCache(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request, { ignoreSearch: true })
  if (hit) return hit
  // Навігація на іншу адресу (`index.html`, `demo` без скісної риски…) — оболонка застосунку
  if (request.mode === 'navigate') return (await cache.match(INDEX)) ?? fetch(request)
  return fetch(request)
}
