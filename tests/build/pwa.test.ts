import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import { precacheList, precacheVersion, serviceWorkerSource } from '../../vite.pwa'

const root = join(import.meta.dirname, '..', '..')

describe('precacheList', () => {
  it('усе, крім sw.js, карт коду й index.html (замість нього — ./)', () => {
    expect(
      precacheList([
        'sw.js',
        'index.html',
        'assets/b.js',
        'assets/b.js.map',
        'manifest.webmanifest',
        'assets/a.css',
      ]),
    ).toEqual(['./', 'assets/a.css', 'assets/b.js', 'manifest.webmanifest'])
  })
})

describe('precacheVersion', () => {
  const files = (js: string) =>
    new Map<string, string | Uint8Array>([
      ['assets/a.js', js],
      ['icons/i.png', new Uint8Array([1, 2, 3])],
    ])

  it('не залежить від порядку, змінюється зі вмістом', () => {
    const v = precacheVersion(files('x'))
    expect(v).toMatch(/^[0-9a-f]{12}$/)
    expect(precacheVersion(new Map([...files('x')].reverse()))).toBe(v)
    expect(precacheVersion(files('y'))).not.toBe(v)
  })
})

/** Виконати зібраний sw.js у мінімальному фейковому оточенні service worker. */
async function loadServiceWorker(precache: string[], version: string) {
  const swPath = join(root, 'src', 'sw', 'sw.ts')
  const { code } = await transformWithOxc(readFileSync(swPath, 'utf8'), swPath, { lang: 'ts' })
  const source = serviceWorkerSource(code, precache, version)

  const scope = 'https://example.org/app/'
  const stores = new Map<string, Map<string, string>>()
  const keyOf = (r: Request | string) => {
    const u = new URL(typeof r === 'string' ? r : r.url)
    u.search = ''
    return u.href
  }
  const caches = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>()
      stores.set(name, store)
      return {
        addAll: async (reqs: Request[]) => reqs.forEach((r) => store.set(keyOf(r), 'cached ' + r.url)),
        match: async (r: Request | string) => {
          const body = store.get(keyOf(r))
          return body === undefined ? undefined : new Response(body)
        },
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }
  const listeners = new Map<string, (e: unknown) => void>()
  const self = {
    registration: { scope },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
  }
  const fetch = async (r: Request) => new Response('network ' + r.url)
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch)

  const dispatch = async (type: string, extra: object = {}) => {
    let done: Promise<unknown> = Promise.resolve()
    let responded: Promise<Response> | undefined
    listeners.get(type)!({
      ...extra,
      waitUntil: (p: Promise<unknown>) => (done = p),
      respondWith: (p: Promise<Response>) => (responded = p),
    })
    await done
    return responded && (await (await responded).text())
  }
  const get = (url: string, mode: 'navigate' | 'no-cors' = 'no-cors') =>
    dispatch('fetch', { request: { method: 'GET', url, mode } as Request })
  return { stores, dispatch, get, scope }
}

describe('sw.js', () => {
  it('передкешовує файли й видає їх без мережі; навігація — оболонка застосунку', async () => {
    const sw = await loadServiceWorker(['./', 'assets/a.js'], 'v2')
    sw.stores.set('pcirmeter-v1', new Map())
    sw.stores.set('other-app', new Map())
    await sw.dispatch('install')
    await sw.dispatch('activate')
    expect([...sw.stores.keys()]).toEqual(['other-app', 'pcirmeter-v2'])

    expect(await sw.get(sw.scope + 'assets/a.js')).toBe('cached ' + sw.scope + 'assets/a.js')
    expect(await sw.get(sw.scope + 'index.html?x=1', 'navigate')).toBe('cached ' + sw.scope)
    expect(await sw.get(sw.scope + 'assets/new.js')).toBe('network ' + sw.scope + 'assets/new.js')
    // Чуже походження й не-GET — повз SW
    expect(await sw.get('https://cdn.example.com/x.js')).toBeUndefined()
    expect(
      await sw.dispatch('fetch', { request: { method: 'POST', url: sw.scope + 'x', mode: 'cors' } }),
    ).toBeUndefined()
  })
})
