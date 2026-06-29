// src/xml-parser.ts
function parseMultistatus(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }
  const results = [];
  const responses = doc.querySelectorAll("*|response");
  for (const response of responses) {
    const href = getText(response, "href");
    if (!href) continue;
    const propstat = findOkPropstat(response);
    if (!propstat) continue;
    const resourceType = propstat.querySelector("*|resourcetype");
    const isCollection = resourceType ? resourceType.querySelector("*|collection") !== null : false;
    const etag = getText(propstat, "getetag");
    const lastModified = getText(propstat, "getlastmodified");
    const contentLengthStr = getText(propstat, "getcontentlength");
    results.push({
      href: decodeURIComponent(href),
      isCollection,
      etag: etag ? etag.replace(/"/g, "") : null,
      lastModified,
      contentLength: contentLengthStr ? parseInt(contentLengthStr, 10) : null
    });
  }
  return results;
}
function findOkPropstat(response) {
  const propstats = response.querySelectorAll("*|propstat");
  for (const ps of propstats) {
    const status = getText(ps, "status");
    if (status && status.includes("200")) return ps;
  }
  if (propstats.length === 1) return propstats[0];
  return null;
}
function getText(parent, localName) {
  const el = parent.querySelector(`*|${localName}`);
  return el?.textContent?.trim() || null;
}

// src/webdav-client.ts
var WebDAVClient = class {
  network;
  config;
  constructor(network, config) {
    this.network = network;
    this.config = config;
  }
  updateConfig(config) {
    this.config = config;
  }
  /**
   * Test connection: PROPFIND Depth:0 on remoteDir.
   * Returns { ok: true } if server responds 207, else { ok: false, error }.
   */
  async testConnection() {
    try {
      const resp = await this.propfind(this.config.remoteDir, 0);
      if (resp.status === 207) return { ok: true };
      if (resp.status === 401 || resp.status === 403) {
        return { ok: false, error: `Authentication failed (${resp.status})` };
      }
      if (resp.status === 404) {
        return { ok: false, error: `Remote directory not found: ${this.config.remoteDir}` };
      }
      return { ok: false, error: `Unexpected status: ${resp.status}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  /**
   * List files in a remote directory (PROPFIND Depth:1).
   * Returns entries excluding the directory itself.
   */
  async listDirectory(remotePath) {
    const resp = await this.propfind(remotePath, 1);
    if (resp.status !== 207) {
      throw new Error(`PROPFIND failed with status ${resp.status}`);
    }
    const resources = parseMultistatus(resp.body);
    const dirPath = this.normalizePath(remotePath);
    return resources.filter((r) => this.normalizePath(r.href) !== dirPath);
  }
  /**
   * Upload a file to the server via PUT.
   * Returns the ETag from the response (if provided by server).
   */
  async putFile(remotePath, content) {
    const url = this.buildUrl(remotePath);
    const resp = await this.network.request({
      url,
      method: "PUT",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "text/plain; charset=utf-8"
      },
      body: content,
      timeout: this.config.timeout
    });
    if (resp.status >= 200 && resp.status < 300) {
      const etag = resp.headers["etag"] || resp.headers["ETag"] || null;
      return { etag };
    }
    throw new Error(`PUT failed: ${resp.status}`);
  }
  /**
   * Ensure a remote directory exists (MKCOL).
   * Ignores 405 (already exists) and 301 (redirect to existing).
   */
  async ensureDirectory(remotePath) {
    const url = this.buildUrl(remotePath);
    const resp = await this.network.request({
      url,
      method: "MKCOL",
      headers: this.authHeaders(),
      timeout: this.config.timeout
    });
    if (resp.status === 201 || resp.status === 405 || resp.status === 301) return;
    if (resp.status >= 400) {
      throw new Error(`MKCOL ${remotePath} failed: ${resp.status}`);
    }
  }
  /**
   * Download a file from the server via GET.
   * Returns the file content and ETag.
   */
  async getFile(remotePath) {
    const url = this.buildUrl(remotePath);
    const resp = await this.network.request({
      url,
      method: "GET",
      headers: this.authHeaders(),
      timeout: this.config.timeout
    });
    if (resp.status === 200) {
      const etag = resp.headers["etag"] || resp.headers["ETag"] || null;
      return { content: resp.body, etag: etag ? etag.replace(/"/g, "") : null };
    }
    if (resp.status === 404) {
      throw new Error(`File not found: ${remotePath}`);
    }
    throw new Error(`GET failed: ${resp.status}`);
  }
  /**
   * Get file metadata via PROPFIND Depth:0.
   * Returns ETag and last modified time without downloading content.
   */
  async getFileInfo(remotePath) {
    const resp = await this.propfind(remotePath, 0);
    if (resp.status === 404) return null;
    if (resp.status !== 207) {
      throw new Error(`PROPFIND failed with status ${resp.status}`);
    }
    const resources = parseMultistatus(resp.body);
    return resources.length > 0 ? resources[0] : null;
  }
  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------
  async propfind(remotePath, depth) {
    const url = this.buildUrl(remotePath);
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<d:propfind xmlns:d="DAV:">',
      "  <d:prop>",
      "    <d:resourcetype/>",
      "    <d:getetag/>",
      "    <d:getlastmodified/>",
      "    <d:getcontentlength/>",
      "  </d:prop>",
      "</d:propfind>"
    ].join("\n");
    return this.network.request({
      url,
      method: "PROPFIND",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": String(depth)
      },
      body,
      timeout: this.config.timeout
    });
  }
  buildUrl(remotePath) {
    const base = this.config.serverUrl.replace(/\/$/, "");
    const path = remotePath.startsWith("/") ? remotePath : "/" + remotePath;
    return base + encodeURI(path);
  }
  authHeaders() {
    if (this.config.authMethod === "bearer") {
      return { "Authorization": `Bearer ${this.config.password}` };
    }
    const encoded = btoa(`${this.config.username}:${this.config.password}`);
    return { "Authorization": `Basic ${encoded}` };
  }
  /** Strip trailing slash and server prefix for path comparison. */
  normalizePath(path) {
    const base = this.config.serverUrl.replace(/\/$/, "");
    let p = path.startsWith(base) ? path.slice(base.length) : path;
    try {
      p = decodeURIComponent(p);
    } catch {
    }
    return p.replace(/\/$/, "");
  }
};

// src/settings-panel.ts
var STYLES = `
.wds-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
}

.wds-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-primary, #333);
  flex-shrink: 0;
}

.wds-tab {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.wds-tab:hover {
  color: var(--text-primary, #e0e0e0);
}

.wds-tab.active {
  color: var(--text-primary, #e0e0e0);
  border-bottom-color: var(--accent-primary, #64b5f6);
}

.wds-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wds-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wds-field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #999);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.wds-field input,
.wds-field select {
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-primary, #333);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  outline: none;
  font-family: inherit;
}

.wds-field input:focus,
.wds-field select:focus {
  border-color: var(--accent-primary, #64b5f6);
}

.wds-field input::placeholder {
  color: var(--text-muted, #666);
}

.wds-checkbox-field label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
}

.wds-checkbox-field input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-primary, #64b5f6);
  cursor: pointer;
}

.wds-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.wds-btn {
  flex: 1;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-primary, #333);
  background: var(--bg-hover, #2a2a2a);
  color: var(--text-primary, #e0e0e0);
  transition: background 0.15s;
}

.wds-btn:hover {
  background: var(--bg-active, #333);
}

.wds-btn.primary {
  background: var(--accent-primary, #64b5f6);
  border-color: var(--accent-primary, #64b5f6);
  color: #fff;
}

.wds-btn.primary:hover {
  opacity: 0.9;
}

.wds-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wds-status {
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.wds-status.success {
  background: rgba(129, 199, 132, 0.12);
  color: #a5d6a7;
}

.wds-status.error {
  background: rgba(229, 115, 115, 0.12);
  color: #ef9a9a;
}

.wds-status.info {
  background: rgba(100, 181, 246, 0.12);
  color: #90caf9;
}

.wds-log-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.wds-log-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary, #999);
  line-height: 1.6;
}

.wds-log-item {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary, #222);
}

.wds-log-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wds-log-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.wds-log-icon.upload { color: #81c784; }
.wds-log-icon.download { color: #64b5f6; }
.wds-log-icon.conflict { color: #ffb74d; }
.wds-log-icon.error { color: #e57373; }

.wds-log-file {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wds-log-time {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-left: auto;
  flex-shrink: 0;
}

.wds-log-msg {
  font-size: 11px;
  color: var(--text-muted, #666);
  margin-top: 2px;
}

.wds-log-toolbar {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary, #333);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.wds-log-filter {
  flex: 1;
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-primary, #333);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
  outline: none;
  font-family: inherit;
}

.wds-log-filter:focus {
  border-color: var(--accent-primary, #64b5f6);
}

.wds-log-filter::placeholder {
  color: var(--text-muted, #666);
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
function formatLogTime(ts) {
  const date = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return time;
  return date.toLocaleDateString(void 0, { month: "short", day: "numeric" }) + " " + time;
}
function logIcon(direction) {
  switch (direction) {
    case "upload":
      return "\u2191";
    case "download":
      return "\u2193";
    case "conflict":
      return "\u26A0";
    case "error":
      return "\u2716";
  }
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var SettingsPanel = class {
  container = null;
  config;
  onSave;
  onTest;
  statusEl = null;
  activeTab = "settings";
  logEntries;
  onClearLog;
  logFilter = "";
  constructor(config, onSave, onTest, logEntries, onClearLog) {
    this.config = { ...config };
    this.onSave = onSave;
    this.onTest = onTest;
    this.logEntries = logEntries;
    this.onClearLog = onClearLog ?? null;
  }
  updateConfig(config) {
    this.config = { ...config };
    if (this.container && this.activeTab === "settings") this.render();
  }
  /** Call when a new log entry is added to refresh the log view. */
  refreshLog() {
    if (this.container && this.activeTab === "log") this.render();
  }
  mount(container) {
    injectStyles();
    this.container = container;
    this.render();
    return () => {
      this.container = null;
    };
  }
  render() {
    if (!this.container) return;
    const panel = document.createElement("div");
    panel.className = "wds-panel";
    const tabs = document.createElement("div");
    tabs.className = "wds-tabs";
    tabs.innerHTML = `
      <button class="wds-tab ${this.activeTab === "settings" ? "active" : ""}" data-tab="settings">Settings</button>
      <button class="wds-tab ${this.activeTab === "log" ? "active" : ""}" data-tab="log">Sync Log</button>
    `;
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      this.activeTab = btn.dataset.tab;
      this.render();
    });
    panel.appendChild(tabs);
    if (this.activeTab === "settings") {
      panel.appendChild(this.renderSettings());
    } else {
      panel.appendChild(this.renderLog());
    }
    this.container.innerHTML = "";
    this.container.appendChild(panel);
  }
  renderSettings() {
    const body = document.createElement("div");
    body.className = "wds-body";
    body.innerHTML = `
      <div class="wds-field">
        <label>Server URL</label>
        <input type="text" data-field="serverUrl" placeholder="http://192.168.1.100:9090" />
      </div>
      <div class="wds-field">
        <label>Remote Directory</label>
        <input type="text" data-field="remoteDir" placeholder="/boltmd/" />
      </div>
      <div class="wds-field">
        <label>Auth Method</label>
        <select data-field="authMethod">
          <option value="basic">Basic Auth</option>
          <option value="bearer">Bearer Token</option>
        </select>
      </div>
      <div class="wds-field">
        <label>Username</label>
        <input type="text" data-field="username" placeholder="username" />
      </div>
      <div class="wds-field">
        <label>Password</label>
        <input type="password" data-field="password" placeholder="password" />
      </div>
      <div class="wds-field wds-checkbox-field">
        <label>
          <input type="checkbox" data-field="autoSyncOnSave" />
          Auto sync on save
        </label>
      </div>
      <div class="wds-field">
        <label>Draft sync interval (seconds, 0 = off)</label>
        <input type="number" data-field="draftSyncIntervalSec" min="0" max="3600" placeholder="0" />
      </div>
      <div class="wds-field">
        <label>Poll remote interval (seconds, 0 = off)</label>
        <input type="number" data-field="pollIntervalSec" min="0" max="3600" placeholder="0" />
      </div>
      <div class="wds-actions">
        <button class="wds-btn" data-action="test">Test</button>
        <button class="wds-btn primary" data-action="save">Save</button>
      </div>
      <div class="wds-status-container"></div>
    `;
    const inputs = body.querySelectorAll("[data-field]");
    for (const input of inputs) {
      const field = input.dataset.field;
      if (field && this.config[field] !== void 0) {
        if (input instanceof HTMLInputElement && input.type === "checkbox") {
          input.checked = Boolean(this.config[field]);
        } else {
          input.value = String(this.config[field]);
        }
      }
    }
    for (const input of inputs) {
      const field = input.dataset.field;
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.addEventListener("change", () => {
          this.config[field] = input.checked;
        });
      } else {
        input.addEventListener("input", () => {
          if (field === "timeout" || field === "draftSyncIntervalSec" || field === "pollIntervalSec") {
            this.config[field] = parseInt(input.value, 10) || 0;
          } else {
            this.config[field] = input.value;
          }
        });
        input.addEventListener("change", () => {
          if (field === "timeout" || field === "draftSyncIntervalSec" || field === "pollIntervalSec") {
            this.config[field] = parseInt(input.value, 10) || 0;
          } else {
            this.config[field] = input.value;
          }
        });
      }
    }
    this.statusEl = body.querySelector(".wds-status-container");
    body.querySelector('[data-action="test"]').addEventListener("click", () => this.handleTest());
    body.querySelector('[data-action="save"]').addEventListener("click", () => this.handleSave());
    return body;
  }
  renderLog() {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "flex:1;display:flex;flex-direction:column;overflow:hidden;";
    if (this.logEntries.length === 0) {
      wrapper.innerHTML = `<div class="wds-log-empty">No sync operations yet.</div>`;
      return wrapper;
    }
    const toolbar = document.createElement("div");
    toolbar.className = "wds-log-toolbar";
    toolbar.innerHTML = `
      <input type="text" class="wds-log-filter" placeholder="Filter by filename..." />
      <button class="wds-btn" style="flex:none;padding:3px 8px;">Clear</button>
    `;
    const filterInput = toolbar.querySelector(".wds-log-filter");
    filterInput.value = this.logFilter;
    filterInput.addEventListener("input", () => {
      this.logFilter = filterInput.value;
      this.renderLogList(list);
    });
    toolbar.querySelector("button").addEventListener("click", () => {
      this.logEntries.length = 0;
      if (this.onClearLog) this.onClearLog();
      this.render();
    });
    wrapper.appendChild(toolbar);
    const list = document.createElement("div");
    list.className = "wds-log-list";
    this.renderLogList(list);
    wrapper.appendChild(list);
    return wrapper;
  }
  renderLogList(list) {
    list.innerHTML = "";
    const filter = this.logFilter.toLowerCase();
    let count = 0;
    for (let i = this.logEntries.length - 1; i >= 0; i--) {
      const entry = this.logEntries[i];
      if (filter && !entry.file.toLowerCase().includes(filter)) continue;
      count++;
      const item = document.createElement("div");
      item.className = "wds-log-item";
      item.innerHTML = `
        <div class="wds-log-item-row">
          <span class="wds-log-icon ${entry.direction}">${logIcon(entry.direction)}</span>
          <span class="wds-log-file">${escapeHtml(entry.file)}</span>
          <span class="wds-log-time">${formatLogTime(entry.timestamp)}</span>
        </div>
        <div class="wds-log-msg">${escapeHtml(entry.message)}</div>
      `;
      list.appendChild(item);
    }
    if (count === 0) {
      list.innerHTML = `<div class="wds-log-empty">No matching entries.</div>`;
    }
  }
  async handleTest() {
    this.showStatus("info", "Testing connection...");
    this.setButtonsDisabled(true);
    try {
      const result = await this.onTest(this.config);
      if (result.ok) {
        this.showStatus("success", "Connection successful!");
      } else {
        this.showStatus("error", `Connection failed: ${result.error}`);
      }
    } catch (err) {
      this.showStatus("error", `Error: ${err}`);
    } finally {
      this.setButtonsDisabled(false);
    }
  }
  async handleSave() {
    this.setButtonsDisabled(true);
    try {
      await this.onSave(this.config);
      this.showStatus("success", "Settings saved.");
    } catch (err) {
      this.showStatus("error", `Save failed: ${err}`);
    } finally {
      this.setButtonsDisabled(false);
    }
  }
  setButtonsDisabled(disabled) {
    this.container?.querySelectorAll("[data-action]").forEach((b) => b.disabled = disabled);
  }
  statusTimer = null;
  showStatus(type, message) {
    if (!this.statusEl) return;
    this.statusEl.innerHTML = `<div class="wds-status ${type}">${message}</div>`;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.statusEl) this.statusEl.innerHTML = "";
      this.statusTimer = null;
    }, 4e3);
  }
};

// src/index.ts
var CONFIG_KEY = "connection";
var DEFAULT_CONFIG = {
  serverUrl: "",
  remoteDir: "/boltmd/",
  username: "",
  password: "",
  authMethod: "basic",
  timeout: 3e4,
  autoSyncOnSave: true,
  draftSyncIntervalSec: 0,
  pollIntervalSec: 0
};
var client = null;
var draftTimer = null;
var pollTimer = null;
var MAX_LOG_ENTRIES = 200;
var syncLog = [];
var LOG_FILE = "sync-log.json";
var logFs = null;
async function loadLog(fs) {
  logFs = fs;
  try {
    const exists = await fs.exists(LOG_FILE);
    if (!exists) return;
    const raw = await fs.readFile(LOG_FILE);
    const entries = JSON.parse(raw);
    syncLog.push(...entries.slice(-MAX_LOG_ENTRIES));
  } catch {
  }
}
async function saveLog() {
  if (!logFs) return;
  try {
    await logFs.writeFile(LOG_FILE, JSON.stringify(syncLog));
  } catch {
  }
}
function addLog(direction, file, message) {
  syncLog.push({ timestamp: Date.now(), direction, file, message });
  if (syncLog.length > MAX_LOG_ENTRIES) syncLog.splice(0, syncLog.length - MAX_LOG_ENTRIES);
  saveLog();
}
async function activate(ctx) {
  const saved = await ctx.config.get(CONFIG_KEY);
  let config = saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG };
  client = new WebDAVClient(ctx.network, config);
  await loadLog(ctx.fs);
  let currentState = config.serverUrl ? "idle" : "offline";
  let conflictEtag = null;
  let busyStartTime = 0;
  let busyDelayTimer = null;
  ctx.statusbar.addItem({
    id: "sync-status",
    text: stateText("offline"),
    tooltip: "WebDAV Sync: not configured",
    align: "right",
    priority: 50,
    onClick: () => ctx.sidebar.show("settings")
  });
  function setState(state, detail) {
    if (busyDelayTimer) {
      clearTimeout(busyDelayTimer);
      busyDelayTimer = null;
    }
    if (state === "uploading" || state === "downloading") {
      busyStartTime = Date.now();
      applyState(state, detail);
      return;
    }
    if (currentState === "uploading" || currentState === "downloading") {
      const elapsed = Date.now() - busyStartTime;
      const MIN_DISPLAY = 1e3;
      if (elapsed < MIN_DISPLAY) {
        busyDelayTimer = setTimeout(() => {
          busyDelayTimer = null;
          applyState(state, detail);
        }, MIN_DISPLAY - elapsed);
        return;
      }
    }
    applyState(state, detail);
  }
  function applyState(state, detail) {
    currentState = state;
    ctx.statusbar.updateItem("sync-status", {
      text: stateText(state),
      tooltip: detail || stateTooltip(state)
    });
  }
  function stateText(state) {
    switch (state) {
      case "idle":
        return "\u21C5 Synced";
      case "uploading":
        return "\u2191 Uploading";
      case "downloading":
        return "\u2193 Downloading";
      case "conflict":
        return "\u26A0 Conflict";
      case "error":
        return "\u21C5 Error";
      case "offline":
        return "\u21C5 Offline";
    }
  }
  function stateTooltip(state) {
    switch (state) {
      case "idle":
        return "WebDAV Sync: up to date";
      case "uploading":
        return "WebDAV Sync: uploading...";
      case "downloading":
        return "WebDAV Sync: downloading...";
      case "conflict":
        return "WebDAV Sync: conflict detected \u2014 use Pull Remote or Sync Now to resolve";
      case "error":
        return "WebDAV Sync: last operation failed";
      case "offline":
        return "WebDAV Sync: not configured";
    }
  }
  if (config.serverUrl) setState("idle");
  const panel = new SettingsPanel(
    config,
    // onSave
    async (newConfig) => {
      config = { ...newConfig };
      client.updateConfig(config);
      await ctx.config.set(CONFIG_KEY, config);
      startDraftTimer();
      startPollTimer();
      setState(config.serverUrl ? "idle" : "offline");
      console.log("[webdav-sync] Config saved.");
    },
    // onTest
    async (testConfig) => {
      const tempClient = new WebDAVClient(ctx.network, testConfig);
      return tempClient.testConnection();
    },
    syncLog,
    // onClearLog
    () => {
      saveLog();
    }
  );
  ctx.sidebar.registerPanel({
    id: "settings",
    title: "WebDAV Sync",
    icon: "\u2601",
    // cloud icon
    mount: (container) => panel.mount(container)
  });
  let lastSavedFileName = null;
  let lastUploadedContent = null;
  let lastKnownEtag = null;
  ctx.events.on("file:saved", async (...args) => {
    const payload = args[0];
    if (!payload?.path || !client || !config.serverUrl || !config.autoSyncOnSave) return;
    const filePath = payload.path;
    const fileName = filePath.split(/[\\/]/).pop();
    if (!fileName) return;
    lastSavedFileName = fileName;
    try {
      const content = await ctx.editor.getContent();
      if (content === lastUploadedContent) return;
      setState("uploading");
      const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + fileName;
      const result = await client.putFile(remotePath, content);
      lastUploadedContent = content;
      lastKnownEtag = result.etag ? result.etag.replace(/"/g, "") : null;
      conflictEtag = null;
      setState("idle");
      addLog("upload", fileName, "Uploaded on save");
      panel.refreshLog();
      console.log(`[webdav-sync] Uploaded "${fileName}" (etag: ${lastKnownEtag})`);
    } catch (err) {
      setState("error", `Upload failed: ${err}`);
      addLog("error", fileName, `Upload failed: ${err}`);
      panel.refreshLog();
      console.error(`[webdav-sync] Upload failed for "${fileName}":`, err);
    }
  });
  function startDraftTimer() {
    stopDraftTimer();
    if (config.draftSyncIntervalSec <= 0 || !config.serverUrl) return;
    draftTimer = setInterval(async () => {
      if (!client || !lastSavedFileName) return;
      if (currentState === "conflict") return;
      try {
        const content = await ctx.editor.getContent();
        if (content === lastUploadedContent) return;
        setState("uploading");
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const result = await client.putFile(remotePath, content);
        lastUploadedContent = content;
        lastKnownEtag = result.etag ? result.etag.replace(/"/g, "") : null;
        setState("idle");
        addLog("upload", lastSavedFileName, "Draft sync");
        panel.refreshLog();
        console.log(`[webdav-sync] Draft sync: uploaded "${lastSavedFileName}" (etag: ${lastKnownEtag})`);
      } catch (err) {
        setState("error", `Draft sync failed: ${err}`);
        addLog("error", lastSavedFileName, `Draft sync failed: ${err}`);
        panel.refreshLog();
        console.error(`[webdav-sync] Draft sync failed:`, err);
      }
    }, config.draftSyncIntervalSec * 1e3);
  }
  function stopDraftTimer() {
    if (draftTimer) {
      clearInterval(draftTimer);
      draftTimer = null;
    }
  }
  startDraftTimer();
  function startPollTimer() {
    stopPollTimer();
    if (config.pollIntervalSec <= 0 || !config.serverUrl) return;
    pollTimer = setInterval(async () => {
      if (!client || !lastSavedFileName) return;
      if (currentState === "conflict") return;
      try {
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const info = await client.getFileInfo(remotePath);
        if (!info || !info.etag) return;
        if (info.etag === lastKnownEtag) return;
        const localContent = await ctx.editor.getContent();
        const hasLocalChanges = localContent !== lastUploadedContent;
        if (hasLocalChanges) {
          conflictEtag = info.etag;
          setState("conflict", `Remote "${lastSavedFileName}" changed (etag: ${info.etag}) but local has unsaved edits.`);
          addLog("conflict", lastSavedFileName, `Remote changed while local has edits`);
          panel.refreshLog();
          console.warn(`[webdav-sync] Conflict detected for "${lastSavedFileName}"`);
          return;
        }
        setState("downloading");
        const { content, etag } = await client.getFile(remotePath);
        lastKnownEtag = etag;
        lastUploadedContent = content;
        await ctx.editor.setContent(content);
        setState("idle");
        addLog("download", lastSavedFileName, "Downloaded remote change");
        panel.refreshLog();
        console.log(`[webdav-sync] Downloaded remote change for "${lastSavedFileName}" (etag: ${etag})`);
      } catch (err) {
        setState("error", `Poll failed: ${err}`);
        addLog("error", lastSavedFileName, `Poll failed: ${err}`);
        panel.refreshLog();
        console.error(`[webdav-sync] Poll failed:`, err);
      }
    }, config.pollIntervalSec * 1e3);
  }
  function stopPollTimer() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
  startPollTimer();
  ctx.commands.register({
    id: "syncNow",
    label: "WebDAV Sync: Sync Now (Push)",
    async action() {
      if (!client || !config.serverUrl) return;
      if (!lastSavedFileName) {
        console.warn("[webdav-sync] No file has been saved yet.");
        return;
      }
      try {
        setState("uploading");
        const content = await ctx.editor.getContent();
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const result = await client.putFile(remotePath, content);
        lastUploadedContent = content;
        lastKnownEtag = result.etag ? result.etag.replace(/"/g, "") : null;
        conflictEtag = null;
        setState("idle");
        addLog("upload", lastSavedFileName, "Manual sync (push)");
        panel.refreshLog();
        console.log(`[webdav-sync] Manual sync: uploaded "${lastSavedFileName}" (etag: ${lastKnownEtag})`);
      } catch (err) {
        setState("error", `Manual sync failed: ${err}`);
        addLog("error", lastSavedFileName, `Manual sync failed: ${err}`);
        panel.refreshLog();
        console.error(`[webdav-sync] Manual sync failed:`, err);
      }
    }
  });
  ctx.commands.register({
    id: "pullRemote",
    label: "WebDAV Sync: Pull Remote",
    async action() {
      if (!client || !config.serverUrl) return;
      if (!lastSavedFileName) {
        console.warn("[webdav-sync] No file has been saved yet.");
        return;
      }
      try {
        setState("downloading");
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const { content, etag } = await client.getFile(remotePath);
        lastKnownEtag = etag;
        lastUploadedContent = content;
        conflictEtag = null;
        await ctx.editor.setContent(content);
        setState("idle");
        addLog("download", lastSavedFileName, "Pulled from remote");
        panel.refreshLog();
        console.log(`[webdav-sync] Pulled remote "${lastSavedFileName}" (etag: ${etag})`);
      } catch (err) {
        setState("error", `Pull failed: ${err}`);
        addLog("error", lastSavedFileName, `Pull failed: ${err}`);
        panel.refreshLog();
        console.error(`[webdav-sync] Pull failed:`, err);
      }
    }
  });
  ctx.commands.register({
    id: "resolveKeepLocal",
    label: "WebDAV Sync: Resolve Conflict \u2014 Keep Local",
    async action() {
      if (!client || !config.serverUrl || currentState !== "conflict") return;
      if (!lastSavedFileName) return;
      try {
        setState("uploading");
        const content = await ctx.editor.getContent();
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const result = await client.putFile(remotePath, content);
        lastUploadedContent = content;
        lastKnownEtag = result.etag ? result.etag.replace(/"/g, "") : null;
        conflictEtag = null;
        setState("idle");
        addLog("upload", lastSavedFileName, "Conflict resolved: kept local");
        panel.refreshLog();
        console.log(`[webdav-sync] Conflict resolved: kept local, pushed to remote (etag: ${lastKnownEtag})`);
      } catch (err) {
        setState("error", `Resolve failed: ${err}`);
        addLog("error", lastSavedFileName, `Resolve (keep local) failed: ${err}`);
        panel.refreshLog();
        console.error(`[webdav-sync] Resolve (keep local) failed:`, err);
      }
    }
  });
  ctx.commands.register({
    id: "resolveKeepRemote",
    label: "WebDAV Sync: Resolve Conflict \u2014 Keep Remote",
    async action() {
      if (!client || !config.serverUrl || currentState !== "conflict") return;
      if (!lastSavedFileName) return;
      try {
        setState("downloading");
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const { content, etag } = await client.getFile(remotePath);
        lastKnownEtag = etag;
        lastUploadedContent = content;
        conflictEtag = null;
        await ctx.editor.setContent(content);
        setState("idle");
        addLog("download", lastSavedFileName, "Conflict resolved: kept remote");
        panel.refreshLog();
        console.log(`[webdav-sync] Conflict resolved: kept remote (etag: ${etag})`);
      } catch (err) {
        setState("error", `Resolve failed: ${err}`);
        addLog("error", lastSavedFileName, `Resolve (keep remote) failed: ${err}`);
        panel.refreshLog();
        console.error(`[webdav-sync] Resolve (keep remote) failed:`, err);
      }
    }
  });
  ctx.commands.register({
    id: "testConnection",
    label: "WebDAV Sync: Test Connection",
    async action() {
      if (!client) return;
      const result = await client.testConnection();
      if (result.ok) {
        console.log("[webdav-sync] Connection successful!");
      } else {
        console.error("[webdav-sync] Connection failed:", result.error);
      }
    }
  });
  ctx.commands.register({
    id: "listRemote",
    label: "WebDAV Sync: List Remote Files",
    async action() {
      if (!client) return;
      try {
        const files = await client.listDirectory(config.remoteDir);
        console.log(`[webdav-sync] ${files.length} files on remote:`);
        for (const f of files) {
          console.log(`  ${f.isCollection ? "[dir]" : "[file]"} ${f.href} (etag: ${f.etag})`);
        }
      } catch (err) {
        console.error("[webdav-sync] List failed:", err);
      }
    }
  });
  ctx.commands.register({
    id: "openSettings",
    label: "WebDAV Sync: Open Settings",
    action() {
      ctx.sidebar.show("settings");
    }
  });
  console.log("[webdav-sync] Plugin activated.");
}
function deactivate() {
  if (draftTimer) {
    clearInterval(draftTimer);
    draftTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  client = null;
  logFs = null;
  syncLog.length = 0;
  console.log("[webdav-sync] Plugin deactivated");
}
export {
  activate,
  deactivate
};
