# BoltMD — 系统架构设计

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    BoltMD Application                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                Frontend (WebView2)                 │  │
│  │                                                   │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────────┐ │  │
│  │  │ App     │ │ Editor   │ │ UI Components      │ │  │
│  │  │ Shell   │ │ Core     │ │                    │ │  │
│  │  │         │ │          │ │ - Toolbar          │ │  │
│  │  │ - 路由  │ │ - Tiptap │ │ - TabBar           │ │  │
│  │  │ - 状态  │ │ - CM6    │ │ - StatusBar        │ │  │
│  │  │ - 主题  │ │ - 切换器 │ │ - Settings         │ │  │
│  │  └────┬────┘ └────┬─────┘ └────────────────────┘ │  │
│  │       │           │                               │  │
│  │  ┌────┴───────────┴──────────────────────────┐   │  │
│  │  │           Service Layer (服务层)            │   │  │
│  │  │                                           │   │  │
│  │  │  FileService | ThemeService | ConfigService│   │  │
│  │  │  KeymapService | ImageService | ErrorService│   │  │
│  │  │  TabManager                                 │   │  │
│  │  └──────────────────┬────────────────────────┘   │  │
│  │                     │ invoke() / events           │  │
│  └─────────────────────┼─────────────────────────────┘  │
│                        │ IPC                             │
│  ┌─────────────────────┼─────────────────────────────┐  │
│  │              Rust Backend                          │  │
│  │                                                   │  │
│  │  ┌───────────┐ ┌───────────┐ ┌─────────────────┐ │  │
│  │  │ File      │ │ Window    │ │ System           │ │  │
│  │  │ Manager   │ │ Manager   │ │ Integration      │ │  │
│  │  │           │ │           │ │                   │ │  │
│  │  │ - 读写    │ │ - 多窗口  │ │ - 文件关联       │ │  │
│  │  │ - 监听    │ │ - 状态    │ │ - 右键菜单       │ │  │
│  │  │ - 编码    │ │ - 记忆    │ │ - 命令行启动     │ │  │
│  │  └───────────┘ └───────────┘ └─────────────────┘ │  │
│  │                                                   │  │
│  │  ┌───────────────────────────────────────────────┐│  │
│  │  │ Plugin Host (v0.2)                            ││  │
│  │  └───────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
   ┌───────────┐
   │ 文件系统   │  .md / .txt / .markdown 文件
   └───────────┘
```

## 模块划分

### 前端模块

```
src/
├── App.vue                    # 应用根组件
├── main.ts                    # 入口文件
│
├── core/                      # 核心层 — 不依赖 UI 框架
│   ├── editor/                # 编辑器核心
│   │   ├── EditorManager.ts   # 编辑器管理器（模式切换、状态同步）
│   │   ├── WysiwygEditor.ts   # Tiptap WYSIWYG 编辑器封装
│   │   ├── SourceEditor.ts    # CodeMirror 6 源码编辑器封装
│   │   ├── MarkdownSerializer.ts  # Markdown 序列化/反序列化
│   │   └── types.ts           # 编辑器相关类型定义
│   │
│   ├── services/              # 服务层 — 业务逻辑
│   │   ├── FileService.ts     # 文件操作（打开/保存/新建）
│   │   ├── ThemeService.ts    # 主题管理（亮/暗/自定义）
│   │   ├── ConfigService.ts   # 配置管理（持久化设置）
│   │   ├── KeymapService.ts   # 快捷键管理
│   │   ├── ImageService.ts    # 图片处理（粘贴/拖拽/存储）
│   │   ├── ErrorService.ts    # 全局错误处理与通知
│   │   ├── RecentFileService.ts  # 最近文件记录 (v0.2)
│   │   └── TabManager.ts      # 多标签页管理
│   │
│   ├── events/                # 事件系统
│   │   ├── EventBus.ts        # 事件总线实现
│   │   └── events.ts          # 事件名常量与类型定义
│   │
│   └── types/                 # 全局类型定义
│       ├── editor.ts
│       ├── config.ts
│       ├── tab.ts
│       └── file.ts
│
├── components/                # UI 组件层
│   ├── layout/                # 布局组件
│   │   ├── AppLayout.vue      # 主布局
│   │   ├── TitleBar.vue       # 自定义标题栏
│   │   └── StatusBar.vue      # 底部状态栏
│   │
│   ├── editor/                # 编辑器 UI 组件
│   │   ├── EditorContainer.vue    # 编辑器容器（管理模式切换）
│   │   ├── WysiwygView.vue        # WYSIWYG 视图
│   │   ├── SourceView.vue         # 源码视图
│   │   ├── SplitView.vue          # 分屏视图（源码+Tiptap只读预览）
│   │   ├── Toolbar.vue            # 格式化工具栏
│   │   └── TabBar.vue             # 标签栏组件
│   │
│   ├── common/                # 通用 UI 组件
│   │   ├── CommandPalette.vue # 命令面板（Ctrl+Shift+P）
│   │   ├── Modal.vue          # 模态框
│   │   └── Dropdown.vue       # 下拉菜单
│   │
│   └── settings/              # 设置相关
│       └── SettingsPanel.vue  # 设置面板
│
├── composables/               # Vue 组合式函数
│   ├── useEditor.ts           # 编辑器状态管理
│   ├── useTheme.ts            # 主题切换
│   ├── useFile.ts             # 文件操作
│   ├── useKeymap.ts           # 快捷键绑定
│   └── useTabs.ts             # 标签页管理

├── stores/                    # Pinia 状态管理（组件与服务层的桥梁）
│   ├── editorStore.ts         # 编辑器全局状态
│   ├── fileStore.ts           # 文件状态
│   └── tabStore.ts            # 标签页状态
│
├── styles/                    # 样式
│   ├── themes/
│   │   ├── variables.css      # 主题 CSS 变量名定义
│   │   ├── light.css          # 亮色主题变量值
│   │   └── dark.css           # 暗色主题变量值
│   ├── editor.css             # 编辑器样式
│   └── base.css               # 基础样式
│
└── utils/                     # 工具函数
    ├── markdown.ts            # Markdown 工具
    ├── platform.ts            # 平台检测
    └── performance.ts         # 性能监控
```

### Rust 后端模块

```
src-tauri/
├── src/
│   ├── main.rs                # 入口
│   ├── lib.rs                 # 库导出
│   │
│   ├── commands/              # Tauri Commands（前端可调用的接口）
│   │   ├── mod.rs
│   │   ├── file.rs            # 文件操作命令
│   │   ├── window.rs          # 窗口管理命令
│   │   └── system.rs          # 系统集成命令
│   │
│   ├── services/              # 后端服务
│   │   ├── mod.rs
│   │   ├── file_watcher.rs    # 文件变更监听 (v0.2)
│   │   └── config.rs          # 配置文件读写
│   │
│   └── utils/
│       └── path.rs            # 路径工具
│
├── Cargo.toml
└── tauri.conf.json            # Tauri 配置（窗口、权限、打包）
```

## 模块依赖关系（依赖方向：上 → 下）

```
UI Components (Vue 组件)
       │
       ▼
Stores (Pinia 全局状态)
       │
       ▼
Services (业务逻辑服务)
       │
       ├──────────────────┐
       ▼                  ▼
Editor Core          Tauri IPC (invoke)
(Tiptap/CM6)              │
       │                  ▼
       ▼            Rust Backend
  EventBus
(跨模块事件通信)
```

**规则：上层可以依赖下层，下层不能依赖上层。同层之间通过 EventBus 通信。**

**说明：** composables/ 目录保留用于封装复杂的组合逻辑（如快捷键绑定），但不作为必经层。组件可直接使用 stores。配置状态由 ConfigService 直接管理，不单独设 configStore。

## 内容真相源规则

编辑器内容在多个位置存在（编辑器实例、tabStore、fileStore），必须明确唯一真相源以避免不一致：

```
┌─────────────────────────────────────────────────────┐
│ 活跃标签：真相源 = 编辑器实例 (Tiptap/CM6 内部 state) │
│   → store 里的 content 可能是过时的，这是正常的       │
│   → 切换标签/保存时才从编辑器取最新内容写入 store     │
│                                                     │
│ 非活跃标签：真相源 = tabStore.tabs[i].content          │
│   → 编辑器实例已销毁，store 保存的是最后一次快照      │
└─────────────────────────────────────────────────────┘
```

**同步时机（仅以下情况从编辑器实例同步到 store）：**
1. 切换标签时（保存当前标签快照）
2. 保存文件时（取最新内容写入磁盘 + 更新 store）
3. 模式切换时（取 Markdown 内容传递给新编辑器）
4. 关闭标签时（检查 dirty 状态用）

**不在每次按键时同步。** 状态栏字数统计等通过编辑器的 onContentChange 回调获取，不经过 store。

## 事件系统

使用简易 EventBus 处理跨模块通信，避免模块间直接依赖：

```typescript
// core/events/EventBus.ts

type EventHandler = (...args: any[]) => void

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()

  on(event: string, handler: EventHandler): void
  off(event: string, handler: EventHandler): void
  emit(event: string, ...args: any[]): void
}

// 预定义事件名（类型安全）
const enum AppEvent {
  FileOpened = 'file:opened',
  FileSaved = 'file:saved',
  FileExternalChange = 'file:external-change',
  EditorContentChange = 'editor:content-change',
  EditorModeChange = 'editor:mode-change',
  TabSwitch = 'tab:switch',
  TabClose = 'tab:close',
  ThemeChange = 'theme:change',
  ConfigChange = 'config:change',
  Error = 'app:error',
}
```

## 全局错误处理

```typescript
// core/services/ErrorService.ts

enum ErrorLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

interface AppError {
  level: ErrorLevel
  message: string       // 用户可见的提示信息
  detail?: string       // 开发者调试信息
  source?: string       // 来源模块
}

interface IErrorService {
  /** 报告错误，自动在 UI 层展示通知 */
  report(error: AppError): void

  /** 监听错误事件 */
  onError(handler: (error: AppError) => void): void
}
```

所有 Tauri invoke 调用在 service 层统一 catch 并通过 ErrorService 上报：
```typescript
// 示例：FileService 中的错误处理模式
async openFilePath(path: string): Promise<FileInfo> {
  try {
    const content = await invoke<FileContent>('read_file', { path })
    return { ... }
  } catch (e) {
    errorService.report({
      level: ErrorLevel.Error,
      message: `无法打开文件: ${path}`,
      detail: String(e),
      source: 'FileService',
    })
    throw e
  }
}
```

## EditorManager 与 TabManager 协作

标签切换涉及两个管理器，需要明确调用协议：

```
切换标签: Tab A → Tab B
    │
    ▼
1. TabManager 通知 EditorManager 即将切换
    │
    ▼
2. EditorManager 从当前编辑器取内容+光标+滚动位置
   → 返回 EditorSnapshot { content, cursor, scroll, mode }
    │
    ▼
3. TabManager 保存 snapshot 到 Tab A 的 state
    │
    ▼
4. TabManager 将 activeTabId 切换为 Tab B
    │
    ▼
5. EditorManager 销毁当前编辑器，根据 Tab B 的 state 创建新编辑器
   → setContent(tabB.content)
   → setCursorPosition(tabB.cursor)
   → setScrollPosition(tabB.scroll)
    │
    ▼
6. 完成
```

**调用方向：TabManager 调用 EditorManager，反之不行。** EditorManager 不知道标签的存在，只负责"保存快照"和"从快照恢复"。

## 核心接口定义

### 编辑器核心接口

```typescript
// core/editor/types.ts

/** 编辑器模式 */
type EditorMode = 'wysiwyg' | 'source' | 'split'

/** 编辑器实例统一接口 */
interface IEditor {
  /** 获取 Markdown 内容 */
  getContent(): string

  /** 设置 Markdown 内容 */
  setContent(markdown: string): void

  /** 聚焦编辑器 */
  focus(): void

  /** 获取光标位置 */
  getCursorPosition(): CursorPosition

  /** 设置光标位置 */
  setCursorPosition(pos: CursorPosition): void

  /** 获取选区文本 */
  getSelection(): string

  /** 插入文本 */
  insertText(text: string): void

  /** 撤销 */
  undo(): void

  /** 重做 */
  redo(): void

  /** 销毁实例 */
  destroy(): void

  /** 内容变更事件 */
  onContentChange(callback: (markdown: string) => void): void

  /** 获取滚动位置 */
  getScrollPosition(): number

  /** 设置滚动位置 */
  setScrollPosition(pos: number): void

  /** 获取字数统计 */
  getWordCount(): WordCount
}

/** 编辑器快照（标签切换/模式切换时保存恢复用） */
interface EditorSnapshot {
  content: string
  cursor: CursorPosition
  scroll: number
  mode: EditorMode
}

interface CursorPosition {
  line: number
  column: number
  offset: number
}

interface WordCount {
  characters: number
  words: number
  lines: number
}
```

### 服务层接口

```typescript
// core/services/FileService.ts

interface IFileService {
  /** 通过系统对话框打开文件 */
  openFile(): Promise<FileInfo | null>

  /** 通过路径直接打开 */
  openFilePath(path: string): Promise<FileInfo>

  /** 保存当前文件 */
  saveFile(path: string, content: string): Promise<void>

  /** 另存为 */
  saveFileAs(content: string): Promise<string | null>

  /** 新建文件 */
  newFile(): FileInfo

  // 注意：dirty 状态由 TabState 管理，不在 FileService 中
}

interface FileInfo {
  path: string | null   // null = 新建未保存
  name: string
  content: string
  encoding: string
  lastModified: number
}
```

```typescript
// core/services/ThemeService.ts

interface IThemeService {
  /** 获取当前主题 */
  getCurrentTheme(): ThemeName

  /** 切换主题 */
  setTheme(theme: ThemeName): void

  /** 跟随系统 */
  followSystem(): void
}

type ThemeName = 'light' | 'dark' | 'system'
```

```typescript
// core/services/ConfigService.ts

interface IConfigService {
  /** 获取配置（强类型，编译期检查 key 拼写） */
  get<K extends keyof AppConfig>(key: K): AppConfig[K]

  /** 设置配置 */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>

  /** 获取全部配置 */
  getAll(): AppConfig

  /** 监听配置变更 */
  onChange<K extends keyof AppConfig>(key: K, handler: (value: AppConfig[K]) => void): void
}

interface AppConfig {
  theme: ThemeName
  fontSize: number
  fontFamily: string
  lineHeight: number
  tabSize: number
  wordWrap: boolean
  autoSave: boolean
  autoSaveDelay: number  // ms
  defaultMode: EditorMode
  showLineNumbers: boolean
  showToolbar: boolean
  imageStorePath: 'relative' | 'absolute'  // 图片存储方式
  language: string
}
```

```typescript
// core/services/ImageService.ts

interface IImageService {
  /** 处理粘贴的图片 */
  handlePasteImage(blob: Blob, currentFilePath: string): Promise<string>

  /** 处理拖拽的图片 */
  handleDropImage(file: File, currentFilePath: string): Promise<string>

  /** 返回值是相对路径，如 ./assets/image-20260416.png */
}
```

```typescript
// core/types/tab.ts

/** 标签页状态 */
interface TabState {
  id: string                    // 唯一标识（uuid）
  filePath: string | null       // 文件路径，null = 新建未保存
  fileName: string              // 显示名称
  content: string               // 当前内容（Markdown）
  dirty: boolean                // 是否有未保存修改
  editorMode: EditorMode        // 当前编辑模式
  cursorPosition: CursorPosition // 光标位置
  scrollPosition: number        // 滚动位置
  lastModified: number          // 最后修改时间
}

/** 标签管理器接口 */
interface ITabManager {
  /** 获取所有标签 */
  getTabs(): TabState[]

  /** 获取当前活跃标签 */
  getActiveTab(): TabState | null

  /** 创建新标签（空白文件） */
  createTab(): TabState

  /** 打开文件到新标签（已打开则跳转） */
  openTab(filePath: string, content: string): TabState

  /** 关闭标签（dirty 时弹出确认对话框，用户取消则返回 false） */
  closeTab(tabId: string): Promise<boolean>

  /** 切换到指定标签 */
  switchTab(tabId: string): void

  /** 更新标签内容 */
  updateTabContent(tabId: string, content: string): void

  /** 标记标签为已保存 */
  markSaved(tabId: string, filePath: string): void

  /** 移动标签位置（拖拽排序） */
  moveTab(fromIndex: number, toIndex: number): void

  /** 关闭其他标签 */
  closeOtherTabs(tabId: string): void

  /** 关闭右侧标签 */
  closeTabsToRight(tabId: string): void

  /** 持久化标签状态 */
  saveSession(): void

  /** 恢复标签状态 */
  restoreSession(): void
}
```

### Rust 后端接口（Tauri Commands）

```rust
// src-tauri/src/commands/file.rs
// 依赖: encoding_rs (编码检测)

/// 读取文件内容
#[tauri::command]
async fn read_file(path: String) -> Result<FileContent, String>

/// 保存文件
#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String>

/// 保存图片（从 base64）
#[tauri::command]
async fn save_image(dir: String, image_data: String, filename: String) -> Result<String, String>

/// 获取文件元信息
#[tauri::command]
async fn get_file_info(path: String) -> Result<FileMeta, String>

struct FileContent {
    content: String,
    encoding: String,
    size: u64,
}

struct FileMeta {
    name: String,
    size: u64,
    last_modified: u64,
    is_readonly: bool,
}
```

```rust
// src-tauri/src/commands/window.rs

/// 获取窗口状态（位置、大小）
#[tauri::command]
fn get_window_state() -> Result<WindowState, String>

/// 保存窗口状态
#[tauri::command]
fn save_window_state(state: WindowState) -> Result<(), String>
```

```rust
// src-tauri/src/services/config.rs (通过 commands 暴露)

/// 读取配置文件 (%APPDATA%/boltmd/config.json)
#[tauri::command]
async fn read_config() -> Result<String, String>

/// 写入配置文件
#[tauri::command]
async fn write_config(config_json: String) -> Result<(), String>

// 首次启动时如果配置文件不存在，自动创建默认配置
```

## 数据流

### 打开文件的完整流程

```
用户双击 .md 文件
    │
    ▼
OS 启动 BoltMD，传入文件路径参数
    │
    ▼
Rust main.rs 接收参数，创建窗口
    │
    ▼
前端 App.vue 挂载，检测启动参数
    │
    ▼
FileService.openFilePath(path)
    │
    ▼
invoke('read_file', { path }) → Rust 读文件
    │
    ▼
返回 FileContent → 更新 fileStore
    │
    ▼
EditorManager 根据当前模式初始化编辑器
    │
    ├── WYSIWYG: WysiwygEditor.setContent(markdown)
    │              → Tiptap 解析 Markdown → 渲染 DOM
    │
    └── Source:   SourceEditor.setContent(markdown)
                   → CodeMirror 加载文本 → 语法高亮
```

### 编辑 → 保存的数据流

```
用户在编辑器中输入
    │
    ▼
编辑器内部更新（Tiptap/CM6 处理）
    │
    ▼
onContentChange 触发
    │
    ▼
标记 dirty 状态（fileStore.dirty = true）
通知状态栏更新字数统计（不更新 store 中的 content）
    │
    ▼
StatusBar 显示 "未保存" 标记
    │
    ▼
用户按 Ctrl+S（或自动保存触发）
    │
    ▼
从编辑器实例取最新 Markdown 内容
    ├── WYSIWYG: Tiptap → tiptap-markdown 序列化
    └── Source:   CodeMirror → 直接获取文本
    │
    ▼
FileService.saveFile(path, content)
    │
    ▼
invoke('save_file', { path, content }) → Rust 写文件
    │
    ▼
fileStore 标记 dirty = false
```

### 模式切换的数据流

```
用户按 Ctrl+/ 切换模式
    │
    ▼
EditorManager.switchMode(targetMode)
    │
    ▼
1. 从当前编辑器获取 Markdown 内容
   currentEditor.getContent() → markdown
    │
    ▼
2. 获取光标位置和滚动位置
   currentEditor.getCursorPosition() → position
   currentEditor.getScrollPosition() → scroll
    │
    ▼
3. 销毁当前编辑器视图（不销毁数据）
    │
    ▼
4. 初始化目标编辑器
   targetEditor.setContent(markdown)
    │
    ▼
5. 恢复光标位置和滚动位置
   targetEditor.setCursorPosition(position)
   targetEditor.setScrollPosition(scroll)
    │
    ▼
6. 聚焦
   targetEditor.focus()
```

## 性能策略

| 环节 | 策略 |
|------|------|
| 启动 | 最小化首屏：只加载编辑器核心，Toolbar/StatusBar 延迟渲染 |
| 首次渲染 | 先显示纯文本（<100ms），再异步应用 Markdown 格式（<300ms） |
| 大文件 | >1MB 自动切换源码模式 + 提示用户；CodeMirror 6 虚拟滚动 |
| 编辑响应 | Tiptap/CM6 增量更新，不做全量重渲染 |
| 自动保存 | 防抖 1 秒，不阻塞 UI 线程 |
| 图片 | 懒加载，仅在可视区域内加载图片 |
| 内存 | 编辑器切换模式时销毁上一个视图实例 |
| 内容同步 | 活跃标签内容不即时同步到 store，仅在切换/保存时同步 |
| 字数统计 | 通过 requestIdleCallback 延迟计算，不阻塞输入 |

### 模式切换优化策略

MVP 阶段使用"销毁重建"方案（实现简单），如果用户反馈切换延迟明显，v0.2 升级为"双实例缓存"方案：

```
MVP（销毁重建）:
  切换 WYSIWYG → Source:
    1. tiptap.getContent() → markdown
    2. tiptap.destroy()
    3. codemirror = new SourceEditor(markdown)

v0.2（双实例缓存，按需启用）:
  切换 WYSIWYG → Source:
    1. tiptap.getContent() → markdown
    2. tiptap.dom.style.display = 'none'
    3. codemirror.setContent(markdown)
    4. codemirror.dom.style.display = 'block'
```
