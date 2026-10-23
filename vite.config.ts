/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { pwa } from './vite.pwa.ts'

export default defineConfig({
  // Відносні шляхи — щоб збірка працювала з підкаталогу GitHub Pages і з file://
  base: './',
  plugins: [svelte(), pwa()],
  build: {
    // PDF-звіт (pdf-lib + fontkit, ≈ 1,1 МБ) — окремий chunk, що вантажиться лише при створенні звіту
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Зразки демо (`src/ui/demo.ts`) — окремо від застосунку: `vite.pwa.ts` не передкешує `demo/`
        assetFileNames: (asset) =>
          asset.originalFileNames.some((f) => f.includes('samples/'))
            ? 'demo/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
