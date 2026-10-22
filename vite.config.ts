/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { pwa } from './vite.pwa.ts'

export default defineConfig({
  // Відносні шляхи — щоб збірка працювала з підкаталогу GitHub Pages і з file://
  base: './',
  plugins: [svelte(), pwa()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
