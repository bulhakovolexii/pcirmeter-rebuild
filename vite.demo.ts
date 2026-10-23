/**
 * Демо-сторінка `demo/` (`src/ui/demo.ts`): копія `index.html` з `<base href="../">` — відносні шляхи збірки
 * (`./assets/…`, `./sw.js`, маніфест) лишаються спільними з основною сторінкою, а статичний хостинг (GitHub Pages)
 * віддає `…/demo/` без жодних переписувань адрес. У dev-сервері окремий файл не потрібен: `/demo/` віддає
 * `index.html` (запасний маршрут SPA).
 */
import type { Plugin } from 'vite'

export const DEMO_PAGE = 'demo/index.html'
/** Зразки демо в збірці; `vite.pwa.ts` їх не передкешує. */
export const DEMO_SAMPLES = 'demo/samples/'

/** Текст демо-сторінки з тексту `index.html`. */
export function demoPage(html: string): string {
  if (!html.includes('<head>')) throw new Error('index.html без <head>')
  return html.replace('<head>', '<head>\n    <base href="../" />')
}

export function demo(): Plugin {
  return {
    name: 'pcirmeter-demo',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const index = bundle['index.html']
      if (index?.type !== 'asset') throw new Error('index.html не знайдено в збірці')
      this.emitFile({ type: 'asset', fileName: DEMO_PAGE, source: demoPage(String(index.source)) })
    },
  }
}
