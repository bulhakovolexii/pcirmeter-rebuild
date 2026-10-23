/**
 * Плагін збірки PWA: компілює `src/sw/sw.ts` у `dist/sw.js` і дописує до нього список передкешування
 * та версію (див. шапку `sw.ts`). Працює лише у `vite build` — у dev-сервері SW не реєструється.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { transformWithOxc, type Plugin } from 'vite'
import { DEMO_SAMPLES } from './vite.demo.ts'

export const SW_FILE = 'sw.js'

/**
 * Файли, які SW кешує при встановленні: усе, крім себе, карт коду й зразків демо (вантажаться лише на вимогу).
 * Сторінки `…/index.html` — під адресою теки (`./`, `demo/`): саме так їх запитує навігація.
 */
export function precacheList(files: Iterable<string>): string[] {
  return [...files]
    .filter((f) => f !== SW_FILE && !f.endsWith('.map') && !f.startsWith(DEMO_SAMPLES))
    .map((f) => (f === 'index.html' ? './' : f.replace(/\/index\.html$/, '/')))
    .sort()
}

/** Версія кешу — короткий хеш шляхів і вмісту всіх файлів (порядок не важливий). */
export function precacheVersion(files: Map<string, string | Uint8Array>): string {
  const hash = createHash('sha256')
  for (const name of [...files.keys()].sort())
    hash.update(name).update('\0').update(files.get(name)!).update('\0')
  return hash.digest('hex').slice(0, 12)
}

/** Текст `sw.js`: оголошення констант + скомпільований код SW. */
export function serviceWorkerSource(compiled: string, precache: string[], version: string): string {
  return (
    `const __PRECACHE__ = ${JSON.stringify(precache)};\n` +
    `const __VERSION__ = ${JSON.stringify(version)};\n` +
    compiled
  )
}

function listFiles(dir: string, root = dir): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((e) =>
    e.isDirectory()
      ? listFiles(join(dir, e.name), root)
      : [relative(root, join(dir, e.name)).replaceAll('\\', '/')],
  )
}

export function pwa(swSource = 'src/sw/sw.ts'): Plugin {
  let publicDir = ''
  return {
    name: 'pcirmeter-pwa',
    apply: 'build',
    // Після вбудованих плагінів — щоб у бандлі вже були всі файли
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    async generateBundle(_, bundle) {
      const files = new Map<string, string | Uint8Array>()
      for (const name of listFiles(publicDir)) files.set(name, readFileSync(join(publicDir, name)))
      for (const [name, out] of Object.entries(bundle))
        files.set(name, out.type === 'chunk' ? out.code : out.source)
      files.delete(SW_FILE)

      const { code } = await transformWithOxc(readFileSync(swSource, 'utf8'), swSource, { lang: 'ts' })
      this.emitFile({
        type: 'asset',
        fileName: SW_FILE,
        source: serviceWorkerSource(code, precacheList(files.keys()), precacheVersion(files)),
      })
    },
  }
}
