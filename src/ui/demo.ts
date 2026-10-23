/**
 * Демонстраційний режим: `?demo` в адресі відкриває зразки `samples/legacy-2013/` (посилання для заняття).
 * Vite копіює зразки в збірку окремими файлами (`demo/`, див. `vite.config.ts`); у передкеш SW вони не входять —
 * без мережі демо не відкриється, а решта застосунку не важчає на ≈ 1,5 МБ.
 */

import type { FileSource } from './files'

const samples = import.meta.glob<string>('../../samples/legacy-2013/*.jpg', {
  query: '?url',
  import: 'default',
  eager: true,
})

export const DEMO_PARAM = 'demo'

/** Чи просить адреса демо (`?demo`, `?demo=1`…; `?demo=false` / `?demo=0` — ні). */
export function isDemoUrl(url: URL): boolean {
  const v = url.searchParams.get(DEMO_PARAM)
  return v !== null && v !== 'false' && v !== '0'
}

/** Адреса без параметра демо — щоб перезавантаження відновлювало сеанс, а не відкривало зразки вдруге. */
export function withoutDemo(url: URL): URL {
  const out = new URL(url)
  out.searchParams.delete(DEMO_PARAM)
  return out
}

/** Зразки як джерела для `openFiles` (за назвою файлу — у хронологічному порядку зйомки). */
export function demoSources(): FileSource[] {
  return Object.entries(samples)
    .map(([path, url]) => ({ name: path.slice(path.lastIndexOf('/') + 1), url }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, url }) => ({
      name,
      async arrayBuffer() {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} ${url}`)
        return res.arrayBuffer()
      },
    }))
}
