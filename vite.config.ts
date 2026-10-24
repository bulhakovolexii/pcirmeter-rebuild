/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { demo, DEMO_SAMPLES } from './vite.demo.ts'
import { pwa } from './vite.pwa.ts'

export default defineConfig({
  // Відносні шляхи — щоб збірка працювала з підкаталогу GitHub Pages і з file://
  base: './',
  // Порядок важливий: `pwa` має бачити демо-сторінку в збірці
  plugins: [tailwindcss(), svelte(), demo(), pwa()],
  // Компоненти shadcn-svelte імпортують `$lib/…` (components.json)
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/ui/lib', import.meta.url)) } },
  build: {
    // PDF-звіт (pdf-lib + fontkit, ≈ 1,1 МБ) — окремий chunk, що вантажиться лише при створенні звіту
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Зразки демо (`src/ui/demo.ts`) — окремо від застосунку, поза передкешем SW
        assetFileNames: (asset) =>
          asset.originalFileNames.some((f) => f.includes('samples/'))
            ? `${DEMO_SAMPLES}[name]-[hash][extname]`
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
