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
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
