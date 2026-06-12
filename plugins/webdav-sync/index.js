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

.wds-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-primary, #333);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary, #999);
  flex-shrink: 0;
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
`;
var stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}
var SettingsPanel = class {
  container = null;
  config;
  onSave;
  onTest;
  statusEl = null;
  constructor(config, onSave, onTest) {
    this.config = { ...config };
    this.onSave = onSave;
    this.onTest = onTest;
  }
  updateConfig(config) {
    this.config = { ...config };
    if (this.container) this.render();
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
    panel.innerHTML = `
      <div class="wds-header">WebDAV Sync</div>
      <div class="wds-body">
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
        <div class="wds-actions">
          <button class="wds-btn" data-action="test">Test</button>
          <button class="wds-btn primary" data-action="save">Save</button>
        </div>
        <div class="wds-status-container"></div>
      </div>
    `;
    const inputs = panel.querySelectorAll("[data-field]");
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
          if (field === "timeout" || field === "draftSyncIntervalSec") {
            this.config[field] = parseInt(input.value, 10) || 0;
          } else {
            this.config[field] = input.value;
          }
        });
        input.addEventListener("change", () => {
          if (field === "timeout" || field === "draftSyncIntervalSec") {
            this.config[field] = parseInt(input.value, 10) || 0;
          } else {
            this.config[field] = input.value;
          }
        });
      }
    }
    this.statusEl = panel.querySelector(".wds-status-container");
    panel.querySelector('[data-action="test"]').addEventListener("click", () => this.handleTest());
    panel.querySelector('[data-action="save"]').addEventListener("click", () => this.handleSave());
    this.container.innerHTML = "";
    this.container.appendChild(panel);
  }
  async handleTest() {
    this.showStatus("info", "Testing connection...");
    const btns = this.container?.querySelectorAll(".wds-btn");
    btns?.forEach((b) => b.disabled = true);
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
      btns?.forEach((b) => b.disabled = false);
    }
  }
  async handleSave() {
    const btns = this.container?.querySelectorAll(".wds-btn");
    btns?.forEach((b) => b.disabled = true);
    try {
      await this.onSave(this.config);
      this.showStatus("success", "Settings saved.");
    } catch (err) {
      this.showStatus("error", `Save failed: ${err}`);
    } finally {
      btns?.forEach((b) => b.disabled = false);
    }
  }
  statusTimer = null;
  showStatus(type, message) {
    if (!this.statusEl) return;
    this.statusEl.innerHTML = `<div class="wds-status ${type}">${message}</div>`;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.statusEl) this.statusEl.innerHTML = "";
      this.statusTimer = null;
    }, 3e3);
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
  draftSyncIntervalSec: 0
};
var client = null;
var draftTimer = null;
async function activate(ctx) {
  const saved = await ctx.config.get(CONFIG_KEY);
  let config = saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG };
  client = new WebDAVClient(ctx.network, config);
  const panel = new SettingsPanel(
    config,
    // onSave
    async (newConfig) => {
      config = { ...newConfig };
      client.updateConfig(config);
      await ctx.config.set(CONFIG_KEY, config);
      startDraftTimer();
      console.log("[webdav-sync] Config saved.");
    },
    // onTest
    async (testConfig) => {
      const tempClient = new WebDAVClient(ctx.network, testConfig);
      return tempClient.testConnection();
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
      const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + fileName;
      const result = await client.putFile(remotePath, content);
      lastUploadedContent = content;
      console.log(`[webdav-sync] Uploaded "${fileName}" (etag: ${result.etag})`);
    } catch (err) {
      console.error(`[webdav-sync] Upload failed for "${fileName}":`, err);
    }
  });
  function startDraftTimer() {
    stopDraftTimer();
    if (config.draftSyncIntervalSec <= 0 || !config.serverUrl) return;
    draftTimer = setInterval(async () => {
      if (!client || !lastSavedFileName) return;
      try {
        const content = await ctx.editor.getContent();
        if (content === lastUploadedContent) return;
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const result = await client.putFile(remotePath, content);
        lastUploadedContent = content;
        console.log(`[webdav-sync] Draft sync: uploaded "${lastSavedFileName}" (etag: ${result.etag})`);
      } catch (err) {
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
  ctx.commands.register({
    id: "syncNow",
    label: "WebDAV Sync: Sync Now",
    async action() {
      if (!client || !config.serverUrl) return;
      if (!lastSavedFileName) {
        console.warn("[webdav-sync] No file has been saved yet.");
        return;
      }
      try {
        const content = await ctx.editor.getContent();
        const remotePath = config.remoteDir.replace(/\/$/, "") + "/" + lastSavedFileName;
        const result = await client.putFile(remotePath, content);
        lastUploadedContent = content;
        console.log(`[webdav-sync] Manual sync: uploaded "${lastSavedFileName}" (etag: ${result.etag})`);
      } catch (err) {
        console.error(`[webdav-sync] Manual sync failed:`, err);
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
  client = null;
  console.log("[webdav-sync] Plugin deactivated");
}
export {
  activate,
  deactivate
};
