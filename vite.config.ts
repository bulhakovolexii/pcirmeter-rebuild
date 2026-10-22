/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // Відносні шляхи — щоб збірка працювала з підкаталогу GitHub Pages і з file://
  base: './',
  plugins: [svelte()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
