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

// src/index.ts
async function activate(ctx) {
  const storage = new VersionStorage(ctx.fs);
  let currentFilePath = null;
  let lastSavedContent = null;
  ctx.events.on("file:opened", async (...args) => {
    const data = args[0];
    if (!data?.path) return;
    currentFilePath = data.path;
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
    try {
      const content = await ctx.editor.getContent();
      const saved = await storage.saveVersion(currentFilePath, content, lastSavedContent);
      if (saved) {
        console.log("[local-history] Version saved for", currentFilePath);
        lastSavedContent = content;
      }
    } catch (err) {
      console.error("[local-history] Failed to save version:", err);
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
