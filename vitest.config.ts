import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Vitest configuration kept separate from vite.config.ts so the Tauri build
// pipeline is unaffected. Uses happy-dom to provide a lightweight browser
// environment required by code paths that touch `document` / `navigator`.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**/*.ts'],
    },
  },
})
