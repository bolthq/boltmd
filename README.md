<div align="center">

# ⚡ BoltMD

**A fast, lightweight Markdown editor.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-orange?logo=tauri)](https://tauri.app)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js&logoColor=white)](https://vuejs.org)
[![Rust](https://img.shields.io/badge/Rust-1.80+-dea584?logo=rust&logoColor=white)](https://www.rust-lang.org)

</div>

---

BoltMD is a Markdown file editor built with [Tauri 2.0](https://tauri.app), [Vue 3](https://vuejs.org), and [Tiptap](https://tiptap.dev). It uses your system's native WebView — no bundled Chromium, no Electron.

## Features

- ⚡ Fast startup — no Chromium overhead
- ✍️ WYSIWYG + Source mode — powered by Tiptap (ProseMirror) and CodeMirror 6
- 🗂️ Multi-tab editing with session persistence
- 🌗 Light and dark themes
- 📸 Image paste and drag-and-drop support
- 🪶 Lightweight — small installer, low memory footprint
- 🔌 Swappable rendering engine — the editor backend is isolated behind an `IEditor` interface, making it possible to swap Tiptap for other engines in the future

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Tauri 2.0 (Rust) |
| Frontend | Vue 3 + TypeScript |
| WYSIWYG | Tiptap 3 (ProseMirror) |
| Source editor | CodeMirror 6 |
| Styling | TailwindCSS 4 |
| Backend | Rust |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 9
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.80
- [Tauri 2.0 prerequisites](https://tauri.app/start/prerequisites/)

### Install & Run

```bash
git clone https://github.com/bolthq/boltmd.git
cd boltmd
pnpm install
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Architecture

The rendering engine is isolated in `WysiwygEditor.ts` — the rest of the app only depends on the `IEditor` interface. This design makes the WYSIWYG engine swappable (e.g., Tiptap → Milkdown → custom Rust-WASM) without touching other modules.

See [docs/01-architecture.md](docs/01-architecture.md) for details.

## Contributing

BoltMD is in early development. Contributions, issues, and ideas are welcome!

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Open a Pull Request

## License

[Apache License 2.0](LICENSE)
