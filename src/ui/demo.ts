/**
 * Демонстраційний режим: сторінка `…/demo/` відкриває зразки `samples/legacy-2013/` (посилання для заняття);
 * корінь застосунку — звичайний режим. Сторінку для статичного хостингу створює `vite.demo.ts`. Vite копіює зразки
 * в збірку окремими файлами (`demo/samples/`); у передкеш SW вони не входять — без мережі демо не відкриється,
 * а встановлення застосунку не важчає на ≈ 1,6 МБ.
 */

import type { FileSource } from './files'

const samples = import.meta.glob<string>('../../samples/legacy-2013/*.jpg', {
  query: '?url',
  import: 'default',
  eager: true,
})

/** Чи це демо-сторінка: шлях закінчується на `/demo` чи `/demo/` (або `/demo/index.html`). */
export function isDemoPath(pathname: string): boolean {
  return /\/demo(\/(index\.html)?)?$/.test(pathname)
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
