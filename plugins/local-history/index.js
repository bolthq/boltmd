// src/storage.ts
var DEFAULT_RETENTION = {
  maxVersionsPerFile: 50,
  maxAgeDays: 30
};
function hashPath(filePath) {
  let hash = 5381;
  for (let i = 0; i < filePath.length; i++) {
    hash = (hash << 5) + hash + filePath.charCodeAt(i) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
var VersionStorage = class {
  fs;
  config;
  constructor(fs, config) {
    this.fs = fs;
    this.config = config;
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
    await this.applyRetention(meta, hash);
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
  /**
   * Get retention config from plugin settings (or defaults).
   */
  async getRetention() {
    const saved = await this.config.get("retention");
    return saved ?? DEFAULT_RETENTION;
  }
  /**
   * Apply retention policy: remove versions exceeding max count or max age.
   */
  async applyRetention(meta, pathHash) {
    const retention = await this.getRetention();
    const now = Date.now();
    const maxAge = retention.maxAgeDays * 24 * 60 * 60 * 1e3;
    const expired = meta.versions.filter((v) => now - v.timestamp > maxAge);
    for (const v of expired) {
      try {
        await this.fs.deleteFile(this.versionPath(pathHash, v.timestamp));
      } catch {
      }
    }
    meta.versions = meta.versions.filter((v) => now - v.timestamp <= maxAge);
    while (meta.versions.length > retention.maxVersionsPerFile) {
      const removed = meta.versions.pop();
      try {
        await this.fs.deleteFile(this.versionPath(pathHash, removed.timestamp));
      } catch {
      }
    }
  }
};

// src/diff.ts
function computeDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result = [];
  let prefixLen = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }
  let suffixLen = 0;
  while (suffixLen < minLen - prefixLen && oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]) {
    suffixLen++;
  }
  for (let i = 0; i < prefixLen; i++) {
    result.push({ type: "same", text: oldLines[i], oldNum: i + 1, newNum: i + 1 });
  }
  const oldMiddle = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const newMiddle = newLines.slice(prefixLen, newLines.length - suffixLen);
  result.push(...lcsMiddleDiff(oldMiddle, newMiddle, prefixLen));
  for (let i = 0; i < suffixLen; i++) {
    const oldIdx = oldLines.length - suffixLen + i;
    const newIdx = newLines.length - suffixLen + i;
    result.push({ type: "same", text: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: newIdx + 1 });
  }
  return result;
}
function lcsMiddleDiff(oldLines, newLines, offset) {
  const m = oldLines.length;
  const n = newLines.length;
  if (m * n > 1e5) {
    return simpleDiff(oldLines, newLines, offset);
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      if (oldLines[i2 - 1] === newLines[j2 - 1]) {
        dp[i2][j2] = dp[i2 - 1][j2 - 1] + 1;
      } else {
        dp[i2][j2] = Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
      }
    }
  }
  const stack = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "same", text: oldLines[i - 1], oldNum: offset + i, newNum: offset + j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", text: newLines[j - 1], newNum: offset + j });
      j--;
    } else {
      stack.push({ type: "del", text: oldLines[i - 1], oldNum: offset + i });
      i--;
    }
  }
  stack.reverse();
  return stack;
}
function simpleDiff(oldLines, newLines, offset) {
  const result = [];
  for (let i = 0; i < oldLines.length; i++) {
    result.push({ type: "del", text: oldLines[i], oldNum: offset + i + 1 });
  }
  for (let i = 0; i < newLines.length; i++) {
    result.push({ type: "add", text: newLines[i], newNum: offset + i + 1 });
  }
  return result;
}
function diffStats(lines) {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.type === "add") additions++;
    if (line.type === "del") deletions++;
  }
  return { additions, deletions };
}

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

.lh-back-btn {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--accent-color, #64b5f6);
  border-bottom: 1px solid var(--border-color, #333);
  flex-shrink: 0;
}

.lh-back-btn:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

.lh-diff-header {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color, #333);
  flex-shrink: 0;
}

.lh-diff-stats {
  font-size: 11px;
}

.lh-diff-stats .add { color: #81c784; }
.lh-diff-stats .del { color: #e57373; }

.lh-diff-actions {
  display: flex;
  gap: 6px;
}

.lh-btn {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--border-color, #555);
  border-radius: 3px;
  background: transparent;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
  transition: background 0.15s;
}

.lh-btn:hover {
  background: var(--bg-hover, rgba(255,255,255,0.1));
}

.lh-btn.danger {
  border-color: #e57373;
  color: #e57373;
}

.lh-btn.danger:hover {
  background: rgba(229, 115, 115, 0.15);
}

.lh-btn.primary {
  border-color: var(--accent-color, #64b5f6);
  color: var(--accent-color, #64b5f6);
}

.lh-btn.primary:hover {
  background: rgba(100, 181, 246, 0.15);
}

.lh-diff-panel {
  flex: 1;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.lh-diff-line {
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.lh-diff-line.add {
  background: rgba(129, 199, 132, 0.12);
  color: #a5d6a7;
}

.lh-diff-line.del {
  background: rgba(229, 115, 115, 0.12);
  color: #ef9a9a;
}

.lh-diff-line .line-num {
  display: inline-block;
  width: 35px;
  color: var(--text-secondary, #666);
  user-select: none;
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
  currentContent = "";
  viewingTimestamp = null;
  /** Callback when user clicks a version entry. */
  onVersionSelect = null;
  /** Callback when user clicks Restore. Receives the old content. */
  onRestore = null;
  /** Callback when user clicks Delete. Receives the timestamp. */
  onDelete = null;
  constructor(storage) {
    this.storage = storage;
  }
  setFilePath(path) {
    this.currentFilePath = path;
    this.viewingTimestamp = null;
    this.render();
  }
  setCurrentContent(content) {
    this.currentContent = content;
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
    if (this.viewingTimestamp !== null) {
      await this.renderDiff(this.viewingTimestamp);
    } else {
      await this.renderList();
    }
  }
  async renderList() {
    if (!this.container || !this.currentFilePath) return;
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
  async renderDiff(timestamp) {
    if (!this.container || !this.currentFilePath) return;
    let oldContent;
    try {
      oldContent = await this.storage.loadVersion(this.currentFilePath, timestamp);
    } catch {
      this.container.innerHTML = `
        <div class="lh-panel">
          <div class="lh-empty">Failed to load version</div>
        </div>
      `;
      return;
    }
    const diffLines = computeDiff(oldContent, this.currentContent);
    const stats = diffStats(diffLines);
    const panel = document.createElement("div");
    panel.className = "lh-panel";
    const backBtn = document.createElement("div");
    backBtn.className = "lh-back-btn";
    backBtn.textContent = "\u2190 Back to list";
    backBtn.addEventListener("click", () => {
      this.viewingTimestamp = null;
      this.render();
    });
    panel.appendChild(backBtn);
    const header = document.createElement("div");
    header.className = "lh-diff-header";
    header.innerHTML = `
      <div class="lh-diff-stats">
        <span class="add">+${stats.additions}</span>
        <span class="del"> -${stats.deletions}</span>
      </div>
      <div class="lh-diff-actions">
        <button class="lh-btn primary lh-restore-btn">Restore</button>
        <button class="lh-btn danger lh-delete-btn">Delete</button>
      </div>
    `;
    header.querySelector(".lh-restore-btn").addEventListener("click", () => {
      if (this.onRestore) this.onRestore(oldContent);
    });
    header.querySelector(".lh-delete-btn").addEventListener("click", () => {
      if (this.onDelete) this.onDelete(timestamp);
    });
    panel.appendChild(header);
    const diffPanel = document.createElement("div");
    diffPanel.className = "lh-diff-panel";
    this.renderDiffLines(diffPanel, diffLines);
    panel.appendChild(diffPanel);
    this.container.innerHTML = "";
    this.container.appendChild(panel);
  }
  renderDiffLines(container, lines) {
    const maxLines = 2e3;
    const toRender = lines.slice(0, maxLines);
    for (const line of toRender) {
      const el = document.createElement("div");
      el.className = `lh-diff-line ${line.type}`;
      const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
      const num = line.type === "del" ? line.oldNum : line.newNum;
      el.innerHTML = `<span class="line-num">${num ?? ""}</span>${prefix} ${escapeHtml(line.text)}`;
      container.appendChild(el);
    }
    if (lines.length > maxLines) {
      const more = document.createElement("div");
      more.className = "lh-diff-line";
      more.textContent = `... ${lines.length - maxLines} more lines ...`;
      container.appendChild(more);
    }
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
      this.viewingTimestamp = version.timestamp;
      this.render();
      if (this.onVersionSelect) {
        this.onVersionSelect(version.timestamp);
      }
    });
    return item;
  }
};

// src/index.ts
async function activate(ctx) {
  const storage = new VersionStorage(ctx.fs, ctx.config);
  const panel = new HistoryPanel(storage);
  let currentFilePath = null;
  let lastSavedContent = null;
  ctx.events.on("file:opened", async (...args) => {
    const data = args[0];
    if (!data?.path) return;
    currentFilePath = data.path;
    panel.setFilePath(currentFilePath);
    try {
      const content = await ctx.editor.getContent();
      lastSavedContent = content;
      panel.setCurrentContent(content);
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
        panel.setCurrentContent(content);
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
  panel.onRestore = async (content) => {
    await ctx.editor.setContent(content);
    lastSavedContent = content;
    panel.setCurrentContent(content);
    panel.refresh();
  };
  panel.onDelete = async (timestamp) => {
    if (!currentFilePath) return;
    await storage.deleteVersion(currentFilePath, timestamp);
    panel.refresh();
    updateStatusBar();
  };
  ctx.statusbar.addItem({
    id: "local-history.status",
    text: "",
    tooltip: "Local History",
    align: "right",
    priority: 200
  });
  async function updateStatusBar() {
    if (!currentFilePath) return;
    try {
      const meta = await storage.loadMeta(currentFilePath);
      const count = meta.versions.length;
      ctx.statusbar.updateItem("local-history.status", {
        text: count > 0 ? `${count} ver` : "",
        tooltip: count > 0 ? `Local History: ${count} version${count > 1 ? "s" : ""}` : "Local History: no versions yet"
      });
    } catch {
    }
  }
  ctx.commands.register({
    id: "local-history.show",
    label: "Local History: Show Version History",
    shortcut: "Ctrl+Shift+H",
    action: () => {
    }
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
