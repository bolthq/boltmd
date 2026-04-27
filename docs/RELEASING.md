# Releasing BoltMD

This document describes how to publish a new release of BoltMD via GitHub
Actions.

## Prerequisites

### 1. Tauri updater signing keys (one-time setup)

BoltMD uses [Tauri's built-in updater](https://v2.tauri.app/plugin/updater/)
which requires an Ed25519 key pair. The **public key** is committed in
`src-tauri/tauri.conf.json`; the **private key** is stored as a GitHub Secret.

If you need to regenerate the key pair:

```bash
pnpm tauri signer generate -w boltmd-updater.key
```

- `boltmd-updater.key` — private key (never commit this)
- `boltmd-updater.key.pub` — public key (paste into `tauri.conf.json` →
  `plugins.updater.pubkey`)

### 2. GitHub Secrets

Go to **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `boltmd-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you chose during key generation |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## Release workflow

1. **Bump the version** in both files:
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`

2. **Commit** the version bump:
   ```bash
   git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
   git commit -m "chore: bump version to X.Y.Z"
   ```

3. **Tag and push**:
   ```bash
   git tag vX.Y.Z
   git push origin master --tags
   ```

4. **Wait for CI**. The `Release` workflow builds on three platforms
   (Windows, macOS arm64 + x64, Linux) and creates a **draft** GitHub Release
   with all artifacts attached, including `latest.json` for the auto-updater.

5. **Review the draft** at
   `https://github.com/bolthq/boltmd/releases`. Edit the release notes if
   needed, then click **Publish release**.

## Build matrix

| Runner | Target | Artifacts |
|---|---|---|
| `windows-latest` | x86_64-pc-windows-msvc | `.exe` (NSIS), `.msi`, `.nsis.zip` + sig |
| `macos-latest` | aarch64-apple-darwin | `.dmg`, `.app.tar.gz` + sig |
| `macos-latest` | x86_64-apple-darwin | `.dmg`, `.app.tar.gz` + sig |
| `ubuntu-22.04` | x86_64-unknown-linux-gnu | `.AppImage`, `.deb`, `.AppImage.tar.gz` + sig |

## Code signing (not yet configured)

- **Windows**: No EV/OV code signing certificate. Users will see a SmartScreen
  warning on first launch — right-click → "Run anyway".
- **macOS**: No Apple Developer ID notarization. Users need to bypass
  Gatekeeper — right-click → Open, or `xattr -cr /path/to/BoltMD.app`.
- **Linux**: No signature requirement.

These can be added later without changing the release workflow structure.
