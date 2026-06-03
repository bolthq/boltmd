# BoltMD — TASKS.md

本文件是开发任务追踪文件。Claude Code 每完成一个任务，在对应项前打 ✅。

## Phase 0: 项目脚手架 + 样式基础

- [x] P0-1: 初始化 Tauri 2.0 + Vue 3 + TypeScript 项目，配置 TailwindCSS + ESLint + Prettier
- [x] P0-2: 配置 Tauri 窗口（标题、大小、无原生标题栏、capabilities 权限声明）
- [x] P0-3: 创建完整目录结构、所有 interface 文件、EventBus + 事件常量
- [x] P0-4: CSS 变量体系（light.css + dark.css + base.css），禁止后续硬编码颜色值
- [x] P0-5: 验证 `pnpm tauri dev` 正常启动

## Phase 1: WYSIWYG 编辑器

- [x] P1-1: 集成 Tiptap + 所有必要扩展
- [x] P1-2: 集成 tiptap-markdown（Markdown 导入导出）
- [x] P1-3: 创建 WysiwygView.vue，编辑器填满容器
- [x] P1-4: 编辑器样式（标题/代码块/引用/表格/列表/链接/图片），全部使用 CSS 变量

## Phase 2: 源码编辑器

- [x] ~~P2-1: 集成 CodeMirror 6 + Markdown 语法高亮 + @codemirror/language-data~~
- [x] ~~P2-2: 创建 SourceView.vue~~
- [x] ~~P2-3: 创建 SplitView.vue（分屏：CodeMirror + Tiptap 只读预览）~~
- [x] ~~P2-4: 同步滚动~~

> **Note**: Phase 2 was originally implemented with CodeMirror 6, then replaced by
> PMSourceEditor (ProseMirror plain-text codeBlock schema) in the unified-editor refactor.
> CM6 and all multi-cursor features have been removed.

## Phase 3: 模式切换

- [x] P3-1: 实现 EditorManager.ts（模式切换 + EditorSnapshot 保存恢复）
- [x] P3-2: 创建 EditorContainer.vue（根据模式渲染编辑器）
- [x] P3-3: Ctrl+/ 快捷键切换模式
- [x] P3-4: 模式切换测试（内容一致性、光标恢复、滚动位置恢复）

## Phase 4: 文件操作 + 基础配置

- [x] P4-1: Rust 文件命令（read_file, save_file, save_image, get_file_info）
- [x] P4-2: Rust 配置命令（read_config, write_config）
- [x] P4-3: ConfigService.ts 基础实现（强类型 get/set/onChange）
- [x] P4-4: ErrorService.ts 实现（错误上报 + toast 通知）
- [x] P4-5: FileService.ts 实现（兼容多标签设计）
- [x] P4-6: fileStore 文件状态管理
- [x] P4-7: 未保存提醒（关闭确认 + 标题栏标记）
- [x] P4-7.5: 自动保存（可配置开关 + 防抖延迟 + ConfigService 对接）
- [x] P4-8: 命令行启动参数 + 拖拽打开
- [x] P4-9: 文件类型关联（.md/.markdown）

## Phase 5: 多标签页

- [x] P5-1: TabManager.ts 实现（ITabManager 接口，async closeTab，与 EditorManager 协作）
- [x] P5-2: tabStore (Pinia) 标签页状态管理（含内容真相源规则）
- [x] P5-3: TabBar.vue 组件（UI + 拖拽排序 + 右键菜单）
- [x] P5-4: 编辑器与标签页联动（saveSnapshot → switchTab → restoreFromSnapshot）
- [x] P5-5: 文件操作对接标签页（Ctrl+N/O/W/Tab/1~9）
- [x] P5-6: 标签会话持久化（通过 ConfigService）

## Phase 6: 图片支持

- [x] P6-1: ImageService.ts 实现（含 ErrorService 错误上报）
- [x] P6-2: Tiptap 图片粘贴钩子
- [x] P6-3: 拖拽图片支持
- [x] P6-4: CodeMirror 图片粘贴支持

## Phase 7: 主题系统

- [x] P7-1: ThemeService.ts 实现（切换 + ConfigService 持久化 + EventBus 广播）
- [x] P7-2: 编辑器主题适配（Tiptap CSS 变量验证 + CM6 reconfigure Extension）
- [x] P7-3: 跟随系统主题

## Phase 8: UI 壳

- [x] P8-1: 自定义标题栏 TitleBar.vue
- [x] P8-2: 状态栏 StatusBar.vue（requestIdleCallback 字数统计）
- [x] P8-3: 工具栏 Toolbar.vue
- [x] P8-4: 设置面板 SettingsPanel.vue（通过 ConfigService 持久化）
- [x] P8-5: 命令面板 CommandPalette.vue
- [x] P8-6: 窗口状态记忆（通过 ConfigService）

## Phase 9: 配置全面对接

- [x] P9-1: 所有组件对接 ConfigService（查漏补缺）
- [x] P9-2: 配置迁移与防御（版本号 + 损坏回退）

## Phase 10: 打包发布

- [x] P10-1: 应用图标设计与配置
- [x] P10-2: NSIS 安装包配置 + 文件关联
- [x] P10-3: 启动性能优化（目标 <500ms）
- [x] P10-4: GitHub Actions CI 自动构建
- [x] P10-5: README.md（截图 + benchmark + 安装说明）
- [x] P10-6: 首个 GitHub Release

## Phase 10.1: 查找/替换功能

> 详细方案见 [docs/05-find-replace-plan.md](docs/05-find-replace-plan.md)

- [x] P10.1-1: 扩展 IEditor 接口，新增 search/replace 相关方法和类型
- [x] P10.1-2: WysiwygEditor 实现（集成 Tiptap 搜索扩展）
- [x] P10.1-3: SourceEditor 实现（封装 CM6 SearchQuery，含 total 计数）
- [x] P10.1-4: EditorManager 代理查找/替换方法
- [x] P10.1-5: FindReplacePanel.vue 组件（大小写/全字/正则/替换/全部替换）
- [x] P10.1-6: EditorContainer 集成快捷键（Ctrl+F / Ctrl+H / Esc / Enter）
- [x] P10.1-7: i18n 翻译（en + zh-CN）
- [x] P10.1-8: MenuBar Edit 菜单添加 Find / Replace 入口
- [x] P10.1-9: 验证（build + 主题适配 + Markdown 结构完整性）

## Phase 11: v0.1.0 安装测试问题修复

> v0.1.0 安装后发现的 bug 和体验问题，按优先级排列

- [x] P11-1: [Bug/P0] 会话恢复 tab ID 为空 — setTabs 未重新生成 ID，导致所有标签激活状态异常
- [x] P11-2: [Bug/P0] 标签关闭按钮关错标签 — handleClose 未 await 异步 closeTab，竞态条件
- [x] P11-3: [Feature/P1] 单实例模式 — 集成 tauri-plugin-single-instance，文件关联打开时复用已有窗口
- [x] P11-4: [Feature/P1] 首次启动欢迎页 — 检测 firstLaunch 标志，自动打开 welcome + markdown-guide
- [x] P11-5: [Config/P2] NSIS 安装器图标 — 配置 installerIcon 使安装 exe 显示自定义图标
- [x] P11-6: [UX/P2] 更新检查加载反馈 — 点击后立即显示 loading/checking 状态
- [x] P11-7: [Perf/P3] 文件打开卡顿优化 — 添加 loading 指示器，优化 IPC + 编码检测 + Tiptap 初始化
- [x] P11-8: [Bug/P0] 重装后欢迎页不显示 — NSIS sentinel 文件 + Rust 侧重置 session/firstLaunch
- [x] P11-9: [Bug/P0] 窗口位置跳动 — 窗口 visible:false 启动，Rust setup hook 同步恢复物理像素位置后 show
- [x] P11-10: [Bug/P1] 版本升级检测 — appVersion 字段跟踪版本变化，重置 firstLaunch
- [x] P11-11: [Bug/P2] md 文件图标 — NSIS hook 注册 DefaultIcon + 打包 md.ico 资源
- [x] P11-12: [Fix/P2] bootstrap 异常兜底 — main.ts 捕获 fatal bootstrap error

## Phase 12: 启动性能优化

> 当前双击 .md 文件到可编辑约 2-3s，目标降至 < 1s。
> 瓶颈分析：串行阻塞链路长、主 bundle 1.3MB、缺少渐进式加载。

- [x] P12-1: config 一次读取 — Rust setup hook 读取 config 后通过 emit 传给前端，避免 initConfig() 二次 IPC
- [x] P12-2: 会话恢复并行化 — restoreSession() 改 Promise.allSettled 并行读取多标签文件
- [x] P12-3: Vite manualChunks 代码分割 — tiptap/codemirror/lowlight/vue 分包，主 bundle 从 1.3MB 降至 300-500KB
- [x] P12-4: 编辑器异步加载 + 骨架屏 — 先渲染 UI 壳（标题栏/菜单/标签栏），编辑器组件 defineAsyncComponent 延迟加载

> **结论**: 应用层代码启动总耗时 ~230ms，剩余 ~2.7s 为 WebView2 冷启动固定开销，
> 属平台限制无法在代码层面进一步优化。Phase 12 完成。

## Backlog: Bug & Feature

- [x] **[Bug/P1] 外部文件变更检测** — 已打开的文件被外部程序修改后，编辑器应检测到变更并提示/自动更新内容。需要 Rust 侧 fs watch（推荐 notify crate）+ 前端冲突处理（无本地修改→自动刷新，有本地修改→提示用户选择）
- [x] **[Bug/P2] README badge 换行** — `<div align="center">` 内的 inline badge 图片被 Tiptap 渲染为多行，GitHub 正常。需自定义 HtmlBlock 原子节点保留原始 HTML 渲染
- [x] **[Bug/P2] 代码块首次打开无语法高亮** — 打开含代码块的文件时高亮不生效，需编辑后才触发。可能是 lowlight 懒加载完成前编辑器已渲染，需在 lowlight ready 后重新触发高亮
- [x] **[Bug/P2] 复制代码块单行自动包裹 ``` ** — 在 WYSIWYG 模式复制代码块中的某一行，粘贴时内容被额外包裹为代码块。需排查 tiptap-markdown 的 transformCopiedText 逻辑
- [x] **[Bug/P3] Ctrl+R 刷新后新打开的文件丢失** — WebView 刷新导致前端状态重置，新打开但未保存到 session 的标签被丢弃
- [x] **[UX/P3] Cross-mode undo granularity** — Unified undo stack via canonical Tiptap editor; source mode edits dispatch to canonical history, undo/redo syncs back. Mode switch no longer clears undo history.
- [x] **[Bug/P2] Timer memory leak in WysiwygEditor** — setTimeout calls in jumpToHeading/flashCursorLine were not tracked; added pendingTimers array cleared on destroy
- [x] **[Bug/P2] Source mode search navigation stubs** — gotoNextMatch/gotoPrevMatch/replaceAll were unimplemented; added cached search state with proper circular navigation
- [x] **[Bug/P3] Incorrect line count in status bar** — getWordCount used doc.childCount (top-level blocks) instead of text.split('\n').length (actual lines)

---

## Phase 13: 核心体验补全

> Backlog Bug（外部文件变更检测）优先于本 Phase 所有任务
> 高频刚需：用户日常编辑直接受益的功能

### 13.1 文件打开历史
- [x] P13-1: ConfigService 扩展 recentFiles 数据结构（路径+时间+频率，上限 30 条）
- [x] P13-2: 每次打开文件时记录到 recentFiles（前端 fileStore 实现）
- [x] P13-3: 菜单栏 File → Recent Files 子菜单
- [x] P13-4: 清除全部历史
- [x] P13-5: 单条删除（hover 叉号）
- [x] P13-6: 文件不存在时灰显提示
- [x] P13-7: 历史记录搜索（命令面板 Ctrl+R 模式，文件名+路径关键词匹配）

### 13.2 文档结构树（Outline + 标题跳转）
- [x] P13-8: 侧栏文档结构面板组件（根据 Markdown 标题 H1-H6 自动生成树形结构）
- [x] P13-9: 点击标题节点快速跳转到对应位置（WYSIWYG + Source 两种模式都支持）
- [x] P13-10: 高亮当前所在章节（滚动时实时更新）
- [x] P13-11: 树节点可折叠/展开（按标题层级嵌套）
- [x] P13-12: 面板可显示/隐藏（快捷键 + 设置）+ 宽度可拖拽
- [x] P13-13: 编辑内容变化时结构树实时更新（防抖 300ms）
- [x] P13-14: Ctrl+Shift+O 快速跳转面板（类似命令面板，模糊搜索标题，回车跳转）
- [x] P13-15: 面包屑导航（状态栏显示当前所在标题路径 H1 > H2 > H3）

### 13.3 智能粘贴
- [x] P13-16: 粘贴 URL → 自动获取网页标题，转为 `[标题](url)`（获取失败则保留裸链接）
- [x] P13-17: 粘贴 HTML（从网页复制）→ 自动转 Markdown
- [x] P13-18: 粘贴表格数据（从 Excel / Google Sheets）→ 自动转 Markdown 表格
- [x] P13-19: 粘贴代码 → 自动检测语言并包裹代码块

### 13.4 多文件批量打开
- [x] P13-20: 从资源管理器拖入多个文件 → 全部打开为标签页
- [x] P13-21: Ctrl+O 文件对话框支持多选
- [x] P13-22: 命令行支持多参数：`boltmd a.md b.md c.md`

---

## Phase 14: 编辑增强

> 提升专业度和写作体验的功能

### 14.1 Zen Mode（专注模式）
- [x] P14-1: 快捷键 F11 进入/退出专注模式（隐藏标题栏/标签栏/工具栏/状态栏，全屏纯编辑区）
- [x] P14-2: 打字机模式（可选：当前行始终居中）
- [x] P14-3: 专注模式下鼠标移到顶部/底部边缘时临时显示工具栏/状态栏

### ~~14.2 Markdown 格式化~~ (Dropped — no meaningful value after researching competing editors)

### ~~14.3 多光标编辑（源码模式）~~ (Removed — CM6 replaced by PMSourceEditor)
- [x] ~~P14-8: Ctrl+D 选中下一个相同文本~~
- [x] ~~P14-9: Alt+Click 添加多个光标~~
- [x] ~~P14-10: CodeMirror 6 多光标配置（原生支持，需启用+快捷键绑定）~~
> Note: Multi-cursor was removed when CM6 was replaced by PMSourceEditor in the unified-editor refactor.

### 14.4 导出 PDF / HTML
- [x] P14-11: 菜单 File → Export PDF / Export HTML（Ctrl+P 触发 PDF 导出）
- [x] P14-14: 导出 HTML 文件（内联样式，完整 HTML 文档）

### 14.5 自动更新检测
- [x] P14-15: 启动后延迟 30 秒异步查询 GitHub Release API（不阻塞任何 UI）
- [x] P14-16: 有新版时状态栏显示不打扰的提示（小圆点+点击查看更新说明）
- [x] P14-17: 可配置关闭更新检测（设置面板开关）

### 14.6 用户反馈入口（待定）
> 备注：降低非 GitHub 用户反馈门槛。方案候选：应用内表单+轻量后端（Cloudflare Workers）收集，或先跳转外部问卷过渡。待 Dio 决定是否上。

---

## Phase 15: 插件系统

> 核心原则：除了基础编辑体验，能走插件的都走插件
> 先建好插件架构，后续版本控制/云同步等作为官方插件验证架构
> 详细设计与拆分理由见 [docs/07-plugin-system.md](docs/07-plugin-system.md)

### 15.1 插件架构

开发顺序按代码依赖链排列，每步独立通过构建验证后提交：

- [x] P15-1: 类型定义 — `types.ts` + `index.ts`（PluginManifest, PluginContext, 所有子 API 接口；不含 toolbar 权限）
- [x] P15-2: Rust 插件目录扫描 — `plugin.rs` 中 `scan_plugins_dir` + ID 校验辅助函数
- [x] P15-3: PluginLoader — 调用 Rust 扫描、解析并校验 manifest（依赖 P15-1, P15-2）
- [x] P15-4: PluginManager — 响应式注册表（commands/statusbar/sidebar/shortcuts）+ 插件实例状态存储 + register/unregister 函数 + shortcut→commandId 映射表；不含激活编排逻辑（依赖 P15-1）
- [x] P15-5: Rust 插件配置 + 沙盒 FS — config 读写 + 文件系统 6 个命令 + 路径穿越防护（依赖 P15-2）
- [x] P15-6: PluginContext — 上下文工厂 + 权限检查 + 各子 API 委托实现 + 内部维护 disposer 列表（deactivate 时自动释放所有未清理的订阅）；需修改 EditorManager.ts 添加 getEditorMode() 导出（依赖 P15-1, P15-4, P15-5）
- [x] P15-7: App.vue 集成 — 启动加载 + 激活编排（创建 context → 传入 Manager，activation 异常标记 state=error）+ 关闭注销 + config 添加 disabledPlugins 字段 + handleKeydown 查询 shortcut 注册表执行插件命令 + 插件命令执行 wrap try-catch（依赖 P15-3, P15-4, P15-6）
- [x] P15-8: UI 扩展点：命令面板接入插件命令 + 内置 "Reload All Plugins" 命令（依赖 P15-7）
- [x] P15-9: UI 扩展点：状态栏接入插件项（依赖 P15-7）
- [x] P15-10: 插件配置 UI — 设置面板插件页签（列表/启用/禁用/错误状态显示）（依赖 P15-7）
- [x] P15-补充: 事件接线（eventBus → 插件桥接）+ 侧边栏面板渲染组件
- [x] P15-补充: 安全加固（超时保护 + 权限白名单 + 路径校验 + 事件去重）
- [x] P15-补充: 插件管理面板（Help 菜单入口 + 已安装/可用插件列表 + i18n）

### 15.2 插件市场（推迟）

> 当前无用户基数，插件市场暂不实现。官方插件通过内置管理面板展示，
> 未来有需求时再从硬编码列表升级为远程 JSON + 下载安装。

- [ ] ~~P15-11: 插件仓库索引（GitHub repo，JSON manifest 列表）~~
- [ ] ~~P15-12: 应用内搜索/浏览/安装/更新插件~~
- [ ] ~~P15-13: 插件版本管理 + 自动更新提示~~

---

## Phase 16: 本地版本控制（官方插件）

> 作为第一个官方插件实现，验证插件架构设计
> 实现为 `plugins/local-history/` 官方插件，使用文件系统存储完整快照。

- [x] P16-1: 设计版本存储方案（`{pluginData}/history/{pathHash}/` 目录，完整快照存储 + meta.json 索引）
- [x] P16-2: 每次保存时自动创建版本快照（内容变更检测，仅在实际修改时创建）
- [x] P16-3: 版本列表 UI 面板（时间线视图：时间 + 文件大小变化 + 摘要）
- [x] P16-4: 版本对比（diff 视图，逐行高亮变更：增/删/改）
- [x] P16-5: 恢复历史版本（选中 → 恢复到当前编辑器）
- [x] P16-6: 版本清理策略（自动：maxVersionsPerFile=50 + maxAgeDays=30，每次保存时 applyRetention；手动：单版本删除）
- [x] P16-7: 快捷键打开版本历史面板（Ctrl+Shift+H）

---

## Phase 17: 云端同步（WebDAV 插件）

> 基于 WebDAV 标准协议实现文件同步。用户可自建服务（Docker/Nginx/NAS）
> 或直接使用现有 WebDAV 服务（坚果云、NextCloud、群晖等）。
> 单人多设备场景，不做实时协作。

- [ ] P17-1: WebDAV 客户端封装（PROPFIND/GET/PUT/DELETE，支持 Basic Auth + Token）
- [ ] P17-2: 同步引擎（文件 hash + mtime 比对，变更检测，增量推拉）
- [ ] P17-3: 插件设置面板（服务器地址、认证方式、同步间隔、同步目录）
- [ ] P17-4: 自动同步策略（保存时推送 + 定时轮询拉取 + 启动时全量校验）
- [ ] P17-5: 状态栏同步指示器（未同步/同步中/已同步/冲突/离线）
- [ ] P17-6: 冲突处理 UI（时间戳对比 + 覆盖本地/保留本地/两者都保留）
- [ ] P17-7: 开源参考服务端（Docker 一键部署，极简 WebDAV server）
- [ ] P17-8: 多设备版本历史同步（配合 P16 本地版本控制）

---

## Phase 18: AI 辅助写作插件

> 差异化核心功能，支持多 LLM 后端

- [ ] P18-1: 插件架构设计（Provider 抽象层：OpenAI / Claude / 本地 Ollama）
- [ ] P18-2: 插件设置面板（API Key 配置、模型选择、自定义 endpoint）
- [ ] P18-3: 选中文本 → 右键菜单 / 快捷键调用 AI（润色/翻译/续写/总结/解释）
- [ ] P18-4: 内联 AI 建议（流式输出，接受/拒绝/编辑）
- [ ] P18-5: 自定义 Prompt 模板（用户可添加常用指令）
- [ ] P18-6: Token 用量统计 + 费用预估显示

---

## Phase 19: 插件生态扩展

> 以下功能全部以插件形式实现

### 19.1 .mdz 打包格式插件
- [ ] P19-1: 定义 .mdz 格式规范（ZIP 内含 index.md + assets/ 图片 + meta.json）
- [ ] P19-2: 导出 .mdz（将当前 md + 关联图片打包为单文件）
- [ ] P19-3: 导入/打开 .mdz（解压到临时目录，编辑后可重新打包）
- [ ] P19-4: 文件关联注册（.mdz 双击用 BoltMD 打开）

### 19.2 Minimap 代码地图插件
- [ ] P19-5: 编辑器右侧缩略图渲染（canvas 绘制文档结构）
- [ ] P19-6: 点击/拖拽快速跳转
- [ ] P19-7: 高亮当前视口区域

### 19.3 Agent MD Sync 插件（付费）
- [ ] P19-8: Agent 文件语义理解（MEMORY.md 按条目展示、SOUL.md 高亮人格）
- [ ] P19-9: 智能 diff（忽略时间戳，只看实质变更）
- [ ] P19-10: 一键配置 Agent workspace 路径
- [ ] P19-11: Agent 文件专属 UI 优化（高亮关键字段、折叠非核心区块）
- [ ] P19-12: License 验证 + 付费购买流程

### 19.4 主题市场插件
- [ ] P19-13: 社区主题格式规范（CSS 变量覆盖 + 预览图）
- [ ] P19-14: 主题浏览/安装/切换 UI

---

## Phase 20: 跨平台

> macOS 优先（用户群大、付费意愿强）

- [ ] P20-1: macOS 构建（.dmg + 代码签名 + Notarization + 原生菜单栏）
- [ ] P20-2: Linux 构建（AppImage/.deb + WebKitGTK 适配 + 文件关联）
- [ ] P20-3: CI 三平台自动构建
- [ ] P20-4: Web 端（Tiptap 核心复用，浏览器无需安装，PWA 离线）
- [ ] P20-5: 手机端（技术选型：Tauri Mobile / Flutter / RN）

---

## Phase 21: 高级功能

> 大工程，视产品发展方向决定优先级

### 21.1 文件树 / 工作区视图

> 备忘：全局搜索依赖此功能。当前定位为轻量单文件编辑器，
> 暂不实施，待产品方向明确后再决定。

- [ ] P21-1: "打开文件夹"入口（菜单 + 拖拽文件夹）
- [ ] P21-2: 侧栏文件树组件（递归目录展示，仅显示 .md 文件或全部文件可配置）
- [ ] P21-3: 单击文件打开到标签页，双击固定标签
- [ ] P21-4: 文件树右键菜单（新建/重命名/删除/在资源管理器中打开）
- [ ] P21-5: 文件树实时监听目录变更（复用 notify crate）
- [ ] P21-6: 工作区记忆（记住上次打开的文件夹，下次启动恢复）

### 21.2 全局搜索（依赖文件树）
- [ ] P21-7: 跨文件搜索替换（Rust ripgrep 集成）
- [ ] P21-8: 搜索结果面板 + 点击跳转

### 21.3 多标签拆分 + 窗口分离
- [ ] P21-9: 标签页拖拽到窗口外 → 创建独立窗口（Tauri multiwindow）
- [ ] P21-10: 窗口间文件状态共享（同一文件多窗口编辑时同步）
- [ ] P21-11: 拖回主窗口合并标签
- [ ] P21-12: 多窗口会话持久化

---

## 发版计划

```
v0.2.0  ~ v1.0.0   已发布（核心编辑 + 插件架构 + 内置扩展）
v1.1.0              本地版本控制插件
v1.2.0              云端同步（WebDAV）插件
v1.3.0              AI 辅助写作插件
v1.4.0              .mdz 打包 + Minimap
v2.0.0              macOS + Linux 跨平台
```

节奏：每完成一个版本的功能集即发布，预计 2-4 周一个 minor 版本。

---

## 开发路线总览

```
Phase 16 ✓  本地版本控制（第一个官方插件，验证架构，防数据丢失）
Phase 17    云端同步（WebDAV 协议，多设备同步，自建/坚果云/NAS 兼容）
Phase 18    AI 辅助写作（差异化卖点，多 LLM 后端支持）
Phase 19    插件生态（.mdz / Minimap / Agent Sync / 主题市场）
Phase 20    跨平台（macOS → Linux → Web → Mobile）
Phase 21    高级功能（文件树 / 全局搜索 / 多窗口拆分）
```

**核心原则：** 基础编辑体验内置，扩展能力走插件。优先做用户日常直接受益的功能。
