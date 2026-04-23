# Icons

Tauri 应用图标资源目录，遵循 Tauri 脚手架默认扁平结构。

## 文件用途

### 应用主图标（`bundle.icon` 引用）

| 文件 | 用途 |
|------|------|
| `32x32.png` | Linux 桌面快捷方式 |
| `128x128.png` | Linux 应用列表 |
| `128x128@2x.png` | Linux HiDPI |
| `icon.png` | 源文件 / 回退图标 |
| `icon.ico` | Windows 应用图标（多尺寸：16/32/48/256） |
| `icon.icns` | macOS 应用图标（11 个尺寸条目） |

### Windows Store / MSIX 资产（官方规范命名，勿改）

命名遵循 **Microsoft Store AppxManifest 规范**，改名会破坏 MSIX 打包兼容性：

- `Square30x30Logo.png` ~ `Square310x310Logo.png`
- `StoreLogo.png`

> ⚠️ 这些文件**必须**使用 PascalCase 原名，由 `tauri icon` 命令生成，未来启用 MSIX target 时被 Tauri CLI 引用。

### 文件关联图标（预留，未生效）

- `md.png`
- `md.ico`

> ℹ️ **当前未被 `tauri.conf.json` 引用**。原因：Tauri 2 的 `fileAssociations` 配置不支持 `icon` 字段（schema 会校验报错）。
>
> 这两个文件作为预留资源保留，未来若需要为 `.md` 文件显示自定义图标（而非继承应用图标），需通过以下任一方式实现：
>
> 1. **NSIS hook**：在 `bundle.windows.nsis.installerHooks` 中注入脚本，通过 NSIS 的 `WriteRegStr` 往注册表 `HKCR\.md\DefaultIcon` 写入图标路径
> 2. **WiX 自定义**：通过 `bundle.windows.wix.fragmentPaths` 提供自定义 `.wxs` 片段定义 `ProgId/Icon`
> 3. **macOS Info.plist 扩展**：通过 `bundle.macOS.infoPlist` 补充 `CFBundleTypeIconFile`
>
> 目前 Tauri 默认行为：文件关联图标自动继承应用主图标。

## 替换图标

若需重新生成所有图标，从 `icon.png`（推荐 1024×1024）源文件出发：

```bash
pnpm tauri icon src-tauri/icons/icon.png
```

该命令会覆盖除 `md.*` 和本 README 之外的所有图标文件。
