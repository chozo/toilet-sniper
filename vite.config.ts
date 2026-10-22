/// <reference types="vitest" />
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist/toilet-sniper', emptyOutDir: true },
  test: { include: ['tests/**/*.test.ts'] },
});
