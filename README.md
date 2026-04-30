<div align="center">

# ⚡ BoltMD

**A free, open-source Markdown editor. Tiny, fast, and just works.**

<p>
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-2.0-orange?logo=tauri" alt="Tauri 2.0"></a>
  <a href="https://vuejs.org"><img src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js&logoColor=white" alt="Vue 3"></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.80+-dea584?logo=rust&logoColor=white" alt="Rust"></a>
</p>

[Features](#features) · [Download](#download) · [Build from Source](#build-from-source) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## What is BoltMD?

BoltMD is a Markdown file editor built with [Tauri 2.0](https://tauri.app) and [Vue 3](https://vuejs.org). No Electron, no bundled Chromium — just your system's native WebView and a Rust backend.

**Free. Open source. No account required. No internet needed. Your files stay on your machine.**

---

## Screenshots

> 📸 Coming soon — screenshots will be added after UI polish.

---

## Features

### Three Editing Modes

Switch instantly with `Ctrl+/`:

- **WYSIWYG** — Write in rich text, see formatted output in real time
- **Source** — Full Markdown source with syntax highlighting (CodeMirror 6)
- **Split** — Source on the left, live preview on the right, scroll synced

### Tiny & Lightweight

- **~5 MB installer** — No Chromium bundled, uses your system's WebView2
- **Low memory footprint** — Shares the system WebView process
- **Optimized loading** — Code-split bundles, async editor initialization

### Multi-Tab Editing

- Open multiple files in tabs, drag to reorder
- Tab session auto-saved and restored on relaunch
- `Ctrl+Tab` / `Ctrl+1~9` to switch, right-click menu for batch close
- Same file won't open twice — jumps to existing tab

### Full Markdown Support

Headings, bold, italic, strikethrough, inline code, ordered/unordered lists, task lists (clickable checkboxes), tables, blockquotes, horizontal rules, code blocks with syntax highlighting (150+ languages), links, and images with inline preview.

### Image Paste & Drop

- `Ctrl+V` paste clipboard images — auto-saved to `./assets/` with relative paths
- Drag & drop image files into the editor
- Works in both WYSIWYG and source mode

### Find & Replace

- `Ctrl+F` to search, `Ctrl+H` to replace
- Regex support, case sensitivity, whole word matching
- Match count display, replace all

### Command Palette

`Ctrl+Shift+P` — fuzzy search all available commands and actions.

### Auto-Save

Configurable debounce delay, toggle on/off in settings. Never lose work.

### Theme & i18n

- Light / Dark / Follow system
- English + 中文 built-in

### Other

- Encoding auto-detection (UTF-8, GBK, Latin-1)
- Single instance mode — reuses existing window
- File association for `.md` / `.markdown`
- CLI support: `boltmd file.md`
- Drag & drop files onto the window
- Window state memory (size, position, maximized)
- Welcome page on first launch

### Swappable Editor Engine

The editor backend is isolated behind an `IEditor` interface. The app never talks to Tiptap directly — the rendering engine can be replaced without touching the rest of the codebase.

---

## Download

> 🚧 BoltMD is in early development.

| Platform | Download | Status |
|---|---|---|
| Windows | [GitHub Releases](https://github.com/bolthq/boltmd/releases) | ✅ Available |
| Linux | — | Planned |
| macOS | — | Planned |

---

## Build from Source

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 9
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.80
- [Tauri 2.0 prerequisites](https://tauri.app/start/prerequisites/)

### Development

```bash
git clone https://github.com/bolthq/boltmd.git
cd boltmd
pnpm install
pnpm tauri dev
```

### Production Build

```bash
pnpm tauri build
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Vue 3 UI                               │
│  Tabs · Toolbar · StatusBar · Settings  │
├─────────────────────────────────────────┤
│  Core Services                          │
│  EditorManager · TabManager             │
│  ConfigService · ThemeService           │
│  FileService · ImageService · AutoSave  │
├──────────┬──────────────────────────────┤
│ IEditor  │  WysiwygEditor (Tiptap)      │
│ interface│  SourceEditor (CodeMirror)   │
├──────────┴──────────────────────────────┤
│  Tauri 2.0 IPC                          │
├─────────────────────────────────────────┤
│  Rust Backend                           │
│  File I/O · Encoding · Config · Images  │
└─────────────────────────────────────────┘
```

See [docs/01-architecture.md](docs/01-architecture.md) for details.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Application shell | Tauri 2.0 (Rust) |
| Frontend | Vue 3 + TypeScript |
| WYSIWYG | Tiptap 3 (ProseMirror) |
| Source editor | CodeMirror 6 |
| Styling | TailwindCSS 4 |
| Bundler | Vite 6 |

---

## Roadmap

- [ ] Document outline & heading navigation
- [ ] Recent files
- [ ] Smart paste (URL → link, HTML → Markdown)
- [ ] Zen mode (distraction-free writing)
- [ ] Markdown formatter
- [ ] Export PDF / HTML
- [ ] Plugin system
- [ ] Local version history
- [ ] Cloud sync (plugin, self-hostable)
- [ ] Cross-platform (Linux, macOS, mobile)

See [TASKS.md](TASKS.md) for the full breakdown.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+W` | Close tab |
| `Ctrl+/` | Switch editing mode |
| `Ctrl+Tab` | Next tab |
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |

---

## Contributing

BoltMD is in early development. Contributions, issues, and ideas are welcome!

1. Fork the repo
2. Create a feature branch
3. Open a Pull Request

---

## License

[Apache License 2.0](LICENSE) — Free to use, modify, and distribute.
