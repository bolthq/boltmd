// src/storage.ts
function hashPath(filePath) {
  let hash = 5381;
  for (let i = 0; i < filePath.length; i++) {
    hash = (hash << 5) + hash + filePath.charCodeAt(i) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
var VersionStorage = class {
  fs;
  constructor(fs) {
    this.fs = fs;
  }
  dirFor(pathHash) {
    return `history/${pathHash}`;
  }
  metaPath(pathHash) {
    return `${this.dirFor(pathHash)}/meta.json`;
  }
  versionPath(pathHash, timestamp) {
    return `${this.dirFor(pathHash)}/v_${timestamp}.md`;
  }
  /**
   * Load version metadata for a file.
   */
  async loadMeta(filePath) {
    const hash = hashPath(filePath);
    const metaFile = this.metaPath(hash);
    if (await this.fs.exists(metaFile)) {
      const raw = await this.fs.readFile(metaFile);
      return JSON.parse(raw);
    }
    return { filePath, versions: [] };
  }
  /**
   * Save a new version snapshot. Returns true if saved, false if content unchanged.
   */
  async saveVersion(filePath, content, lastContent) {
    if (lastContent !== null && content === lastContent) {
      return false;
    }
    const hash = hashPath(filePath);
    const meta = await this.loadMeta(filePath);
    const timestamp = Date.now();
    const summary = this.generateSummary(content, lastContent);
    await this.fs.writeFile(this.versionPath(hash, timestamp), content);
    meta.filePath = filePath;
    meta.versions.unshift({
      timestamp,
      size: content.length,
      summary
    });
    await this.fs.writeFile(this.metaPath(hash), JSON.stringify(meta, null, 2));
    return true;
  }
  /**
   * Load version content by timestamp.
   */
  async loadVersion(filePath, timestamp) {
    const hash = hashPath(filePath);
    return await this.fs.readFile(this.versionPath(hash, timestamp));
  }
  /**
   * Delete a specific version.
   */
  async deleteVersion(filePath, timestamp) {
    const hash = hashPath(filePath);
    const meta = await this.loadMeta(filePath);
    meta.versions = meta.versions.filter((v) => v.timestamp !== timestamp);
    await this.fs.writeFile(this.metaPath(hash), JSON.stringify(meta, null, 2));
    try {
      await this.fs.deleteFile(this.versionPath(hash, timestamp));
    } catch {
    }
  }
  /**
   * Generate a short summary of what changed.
   */
  generateSummary(content, lastContent) {
    if (lastContent === null) {
      const firstLine = content.split("\n")[0] || "";
      return firstLine.slice(0, 60);
    }
    const newLines = content.split("\n");
    const oldLines = lastContent.split("\n");
    const maxLen = Math.max(newLines.length, oldLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (newLines[i] !== oldLines[i]) {
        const line = newLines[i] ?? oldLines[i] ?? "";
        return line.trim().slice(0, 60) || `(line ${i + 1} changed)`;
      }
    }
    return "(minor change)";
  }
};

// src/ui.ts
var STYLES = `
.lh-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
}

.lh-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #333);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary, #999);
  flex-shrink: 0;
}

.lh-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary, #999);
  line-height: 1.6;
}

.lh-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.lh-item {
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}

.lh-item:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

.lh-item.active {
  background: var(--bg-active, rgba(255,255,255,0.08));
  border-left-color: var(--accent-color, #64b5f6);
}

.lh-item-time {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
}

.lh-item-meta {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-top: 2px;
}

.lh-item-summary {
  font-size: 11px;
  color: var(--text-tertiary, #666);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
var stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}
function formatTime(ts) {
  const date = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleDateString(void 0, { month: "short", day: "numeric" }) + " " + time;
}
function formatSize(chars) {
  if (chars < 1024) return `${chars} chars`;
  return `${(chars / 1024).toFixed(1)} KB`;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var HistoryPanel = class {
  storage;
  container = null;
  currentFilePath = null;
  /** Callback when user clicks a version entry. Set by index.ts in later steps. */
  onVersionSelect = null;
  constructor(storage) {
    this.storage = storage;
  }
  setFilePath(path) {
    this.currentFilePath = path;
    this.render();
  }
  mount(container) {
    injectStyles();
    this.container = container;
    this.render();
    return () => {
      this.container = null;
    };
  }
  refresh() {
    this.render();
  }
  async render() {
    if (!this.container) return;
    if (!this.currentFilePath) {
      this.container.innerHTML = `
        <div class="lh-panel">
          <div class="lh-header">Local History</div>
          <div class="lh-empty">No file open</div>
        </div>
      `;
      return;
    }
    const meta = await this.storage.loadMeta(this.currentFilePath);
    const versions = meta.versions;
    if (versions.length === 0) {
      this.container.innerHTML = `
        <div class="lh-panel">
          <div class="lh-header">Local History</div>
          <div class="lh-empty">No versions yet.<br>Versions are created automatically on save.</div>
        </div>
      `;
      return;
    }
    const panel = document.createElement("div");
    panel.className = "lh-panel";
    panel.innerHTML = `<div class="lh-header">Local History (${versions.length})</div>`;
    const list = document.createElement("div");
    list.className = "lh-list";
    for (const version of versions) {
      list.appendChild(this.createVersionItem(version));
    }
    panel.appendChild(list);
    this.container.innerHTML = "";
    this.container.appendChild(panel);
  }
  createVersionItem(version) {
    const item = document.createElement("div");
    item.className = "lh-item";
    item.innerHTML = `
      <div class="lh-item-time">${formatTime(version.timestamp)}</div>
      <div class="lh-item-meta">${formatSize(version.size)}</div>
      <div class="lh-item-summary">${escapeHtml(version.summary)}</div>
    `;
    item.addEventListener("click", () => {
      if (this.onVersionSelect) {
        this.onVersionSelect(version.timestamp);
      }
    });
    return item;
  }
};

// src/index.ts
async function activate(ctx) {
  const storage = new VersionStorage(ctx.fs);
  const panel = new HistoryPanel(storage);
  let currentFilePath = null;
  let lastSavedContent = null;
  ctx.events.on("file:opened", async (...args) => {
    const data = args[0];
    if (!data?.path) return;
    currentFilePath = data.path;
    panel.setFilePath(currentFilePath);
    try {
      lastSavedContent = await ctx.editor.getContent();
    } catch {
      lastSavedContent = null;
    }
  });
  ctx.events.on("file:saved", async (...args) => {
    const data = args[0];
    if (!data?.path) return;
    currentFilePath = data.path;
    panel.setFilePath(currentFilePath);
    try {
      const content = await ctx.editor.getContent();
      const saved = await storage.saveVersion(currentFilePath, content, lastSavedContent);
      if (saved) {
        lastSavedContent = content;
        panel.refresh();
      }
    } catch (err) {
      console.error("[local-history] Failed to save version:", err);
    }
  });
  ctx.sidebar.registerPanel({
    id: "local-history.panel",
    title: "History",
    icon: "\u{1F4CB}",
    mount: (container) => panel.mount(container)
  });
  console.log("[local-history] Plugin activated");
}
function deactivate() {
  console.log("[local-history] Plugin deactivated");
}
export {
  activate,
  deactivate
};
