import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue runtime + vue-i18n
          "vendor": ["vue", "vue-i18n"],
          // Tiptap core
          "tiptap": [
            "@tiptap/core",
            "@tiptap/vue-3",
            "@tiptap/starter-kit",
            "tiptap-markdown",
          ],
          // Tiptap extensions (less critical, loaded alongside tiptap)
          "tiptap-ext": [
            "@tiptap/extension-table",
            "@tiptap/extension-table-row",
            "@tiptap/extension-table-cell",
            "@tiptap/extension-table-header",
            "@tiptap/extension-task-list",
            "@tiptap/extension-task-item",
            "@tiptap/extension-highlight",
            "@tiptap/extension-image",
          ],
          // CodeMirror core
          "codemirror": [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/commands",
            "@codemirror/lang-markdown",
            "@codemirror/language",
            "@codemirror/search",
          ],
          // Syntax highlighting (heavy, can be deferred)
          "lowlight": ["lowlight"],
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
