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

- [x] P2-1: 集成 CodeMirror 6 + Markdown 语法高亮 + @codemirror/language-data
- [x] P2-2: 创建 SourceView.vue
- [x] P2-3: 创建 SplitView.vue（分屏：CodeMirror + Tiptap 只读预览）
- [x] P2-4: 同步滚动

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

- [x] P10-4: GitHub Actions CI 自动构建
- [x] P10-5: README.md（截图 + benchmark + 安装说明）
- [x] P10-6: 首个 GitHub Release

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

### P0 — 预计提速 40-60%

- [x] P12-1: config 一次读取 — Rust setup hook 读取 config 后通过 emit 传给前端，避免 initConfig() 二次 IPC
- [x] P12-2: 会话恢复并行化 — restoreSession() 改 Promise.allSettled 并行读取多标签文件
- [x] P12-3: Vite manualChunks 代码分割 — tiptap/codemirror/lowlight/vue 分包，主 bundle 从 1.3MB 降至 300-500KB
- [x] P12-4: 编辑器异步加载 + 骨架屏 — 先渲染 UI 壳（标题栏/菜单/标签栏），编辑器组件 defineAsyncComponent 延迟加载

> **结论**: 应用层代码启动总耗时 ~230ms，剩余 ~2.7s 为 WebView2 冷启动固定开销，
> 属平台限制无法在代码层面进一步优化。Phase 12 完成。

## Backlog: Bug & Feature

- [ ] **[Bug/P1] 外部文件变更检测** — 已打开的文件被外部程序修改后，编辑器应检测到变更并提示/自动更新内容。需要 Rust 侧 fs watch（推荐 notify crate）+ 前端冲突处理（无本地修改→自动刷新，有本地修改→提示用户选择）
- [ ] **[Bug/P2] README badge 换行** — `<div align="center">` 内的 inline badge 图片被 Tiptap 渲染为多行，GitHub 正常。需排查 Tiptap 对 HTML block 内 inline image 的处理逻辑

---

## Phase 13: 核心体验补全

> Backlog Bug（外部文件变更检测）优先于本 Phase 所有任务
> 高频刚需：用户日常编辑直接受益的功能

### P13-A: 文件打开历史
- [ ] P13-1: ConfigService 扩展 recentFiles 数据结构（路径+时间+频率，上限 30 条）
- [ ] P13-2: Rust 侧每次打开文件时记录到 recentFiles
- [ ] P13-3: 菜单栏 File → Recent Files 子菜单
- [ ] P13-4: 欢迎页显示最近文件列表（按最近打开时间排序，可点击直接打开）
- [ ] P13-5: 历史记录搜索（文件名+路径关键词匹配）
- [ ] P13-6: 清除全部/单条历史 + 文件不存在时灰显提示

### P13-B: 文档结构树（Outline + 标题跳转）
- [ ] P13-7: 侧栏文档结构面板组件（根据 Markdown 标题 H1-H6 自动生成树形结构）
- [ ] P13-8: 点击标题节点快速跳转到对应位置（WYSIWYG + Source 两种模式都支持）
- [ ] P13-9: 高亮当前所在章节（滚动时实时更新）
- [ ] P13-10: 树节点可折叠/展开（按标题层级嵌套）
- [ ] P13-11: 面板可显示/隐藏（快捷键 + 设置）+ 宽度可拖拽
- [ ] P13-12: 编辑内容变化时结构树实时更新（防抖 300ms）
- [ ] P13-13: Ctrl+Shift+O 快速跳转面板（类似命令面板，模糊搜索标题，回车跳转）
- [ ] P13-14: 面包屑导航（状态栏显示当前所在标题路径 H1 > H2 > H3）

### P13-C: 智能粘贴
- [ ] P13-15: 粘贴 URL → 自动获取网页标题，转为 `[标题](url)`（获取失败则保留裸链接）
- [ ] P13-16: 粘贴 HTML（从网页复制）→ 自动转 Markdown
- [ ] P13-17: 粘贴表格数据（从 Excel / Google Sheets）→ 自动转 Markdown 表格
- [ ] P13-18: 粘贴代码 → 自动检测语言并包裹代码块

### P13-D: 多文件批量打开
- [ ] P13-19: 从资源管理器拖入多个文件 → 全部打开为标签页
- [ ] P13-20: Ctrl+O 文件对话框支持多选
- [ ] P13-21: 命令行支持多参数：`boltmd a.md b.md c.md`

---

## Phase 14: 编辑增强

> 提升专业度和写作体验的功能

### P14-A: Zen Mode（专注模式）
- [ ] P14-1: 快捷键 F11 进入/退出专注模式（隐藏标题栏/标签栏/工具栏/状态栏，全屏纯编辑区）
- [ ] P14-2: 打字机模式（可选：当前行始终居中）
- [ ] P14-3: 专注模式下鼠标移到顶部/底部边缘时临时显示工具栏/状态栏

### P14-B: Markdown 格式化
- [ ] P14-4: 一键格式化（Ctrl+Shift+F）：统一空行、标题间距、列表缩进规范化
- [ ] P14-5: 表格自动对齐（列宽补齐，对齐标记符统一）
- [ ] P14-6: 可配置格式化规则（compact vs spacious 风格偏好）
- [ ] P14-7: 保存时自动格式化（可选开关，默认关闭）

### P14-C: 多光标编辑（源码模式）
- [ ] P14-8: Ctrl+D 选中下一个相同文本
- [ ] P14-9: Alt+Click 添加多个光标
- [ ] P14-10: CodeMirror 6 多光标配置（原生支持，需启用+快捷键绑定）
> 注：仅源码模式，WYSIWYG 模式 Tiptap 暂不支持多光标

### P14-D: 导出 PDF
- [ ] P14-11: 菜单 File → Export PDF（调用系统打印 API，Ctrl+Shift+E）
- [ ] P14-12: 打印预览 / 页边距配置
- [ ] P14-13: 导出时主题选择（亮色/暗色/跟随当前）
- [ ] P14-14: 导出 HTML 文件（内联样式，完整 HTML 文档）

### P14-E: 自动更新检测
- [ ] P14-15: 启动后延迟 30 秒异步查询 GitHub Release API（不阻塞任何 UI）
- [ ] P14-16: 有新版时状态栏显示不打扰的提示（小圆点+点击查看更新说明）
- [ ] P14-17: 可配置关闭更新检测（设置面板开关）

### P14-X: 用户反馈入口（待定）
> 备注：降低非 GitHub 用户反馈门槛。方案候选：应用内表单+轻量后端（Cloudflare Workers）收集，或先跳转外部问卷过渡。待 Dio 决定是否上。

---

## Phase 15: 插件系统

> 核心原则：除了基础编辑体验，能走插件的都走插件
> 先建好插件架构，后续版本控制/云同步等作为官方插件验证架构

### P15-A: 插件架构
- [ ] P15-1: 设计插件 API 文档（PluginContext：编辑器操作、文件系统、配置、UI 扩展点、事件总线）
- [ ] P15-2: 插件加载机制（`%APPDATA%/boltmd/plugins/` 目录，每个插件一个文件夹+manifest.json）
- [ ] P15-3: 插件生命周期（activate/deactivate/dispose）+ 依赖声明
- [ ] P15-4: UI 扩展点：侧栏面板、工具栏按钮、右键菜单、状态栏、快捷键、编辑器 Markdown 扩展
- [ ] P15-5: 插件配置 UI（设置面板 → 插件页签：列表/启用/禁用/卸载/配置）
- [ ] P15-6: 插件沙箱（文件系统访问限制在工作区+插件目录、网络请求需声明）
- [ ] P15-7: 内置插件脚手架工具（`boltmd create-plugin <name>`）

### P15-B: 插件市场
- [ ] P15-8: 插件仓库索引（GitHub repo，JSON manifest 列表）
- [ ] P15-9: 应用内搜索/浏览/安装/更新插件
- [ ] P15-10: 插件版本管理 + 自动更新提示

---

## Phase 16: 本地版本控制（官方插件）

> 作为第一个官方插件实现，验证插件架构设计

### P16-A: 本地版本历史插件
- [ ] P16-1: 设计版本存储方案（`%APPDATA%/boltmd/history/{fileHash}/` 目录，增量 diff 存储）
- [ ] P16-2: 每次保存时自动创建版本快照（仅存 diff，节省空间）
- [ ] P16-3: 版本列表 UI 面板（时间线视图：时间 + 文件大小变化 + 摘要）
- [ ] P16-4: 版本对比（diff 视图，左旧右新，高亮变更行）
- [ ] P16-5: 恢复历史版本（选中 → 恢复到当前 / 另存为新文件）
- [ ] P16-6: 版本清理策略（可配置：保留 N 天 / 保留最近 N 个版本 / 手动清理）
- [ ] P16-7: 快捷键打开版本历史面板（Ctrl+Shift+H）

---

## Phase 17: 插件生态扩展

> 以下功能全部以插件形式实现，验证插件系统能力

### P17-A: .mdz 打包格式插件
- [ ] P17-1: 定义 .mdz 格式规范（ZIP 内含 index.md + assets/ 图片 + meta.json）
- [ ] P17-2: 导出 .mdz（将当前 md + 关联图片打包为单文件）
- [ ] P17-3: 导入/打开 .mdz（解压到临时目录，编辑后可重新打包）
- [ ] P17-4: 文件关联注册（.mdz 双击用 BoltMD 打开）

### P17-B: 云端同步插件
- [ ] P17-5: 同步协议设计（文件级增量同步、冲突策略：最后写入胜出+冲突备份）
- [ ] P17-6: 插件设置面板（服务器地址、账号、同步开关、同步间隔）
- [ ] P17-7: 同步引擎实现（文件 hash 比对 + delta 传输）
- [ ] P17-8: 状态栏同步指示器（未同步/同步中/已同步/冲突）
- [ ] P17-9: 冲突 UI（本地/远程/合并三选一）
- [ ] P17-10: 开源自部署服务端（Docker 一键部署）

### P17-C: Agent MD Sync 插件（$9.9 付费）
- [ ] P17-11: Agent 文件语义理解（MEMORY.md 按条目展示、SOUL.md 高亮人格）
- [ ] P17-12: 智能 diff（忽略时间戳，只看实质变更）
- [ ] P17-13: 一键配置 Agent workspace 路径
- [ ] P17-14: Agent 文件专属 UI 优化（高亮关键字段、折叠非核心区块）
- [ ] P17-15: License 验证 + 付费购买流程

### P17-D: 其他官方插件
- [ ] P17-16: KaTeX 数学公式插件（行内$...$、块级$$...$$）
- [ ] P17-17: YAML Frontmatter 插件（折叠渲染+YAML语法高亮）
- [ ] P17-18: Minimap 代码地图插件
- [ ] P17-19: 主题市场插件（社区主题安装/切换）
- [ ] P17-20: AI 辅助写作插件（接 OpenAI/Claude/本地LLM，润色/翻译/续写）
- [ ] P17-21: 全局搜索插件（跨文件搜索替换，Rust ripgrep 集成）

---

## Phase 18: 高级功能

> 多标签拆分、跨平台等大工程

### P18-A: 多标签拆分 + 窗口分离
- [ ] P18-1: 标签页拖拽到窗口外 → 创建独立窗口（Tauri multiwindow）
- [ ] P18-2: 窗口间文件状态共享（同一文件多窗口编辑时同步）
- [ ] P18-3: 拖回主窗口合并标签
- [ ] P18-4: 多窗口会话持久化

### P18-B: 跨平台
- [ ] P18-5: Linux 构建（AppImage/.deb + WebKitGTK 适配 + 文件关联）
- [ ] P18-6: macOS 构建（.dmg + 代码签名 + Notarization + 原生菜单栏）
- [ ] P18-7: CI 三平台自动构建
- [ ] P18-8: Web 端（Tiptap 核心复用，浏览器无需安装，PWA 离线）
- [ ] P18-9: 手机端（技术选型：Tauri Mobile / Flutter / RN）

### P18-C: 网络版本同步（依赖云端同步插件）
- [ ] P18-10: 多设备版本历史同步
- [ ] P18-11: 协作冲突三方合并 UI
- [ ] P18-12: 可选 Git 集成（读取 git log，展示 commit diff）

---

## 开发路线总览

```
Backlog     Bug修复（外部文件变更检测 + badge渲染）← 最高优先级
Phase 13    核心体验补全（文件历史 → 结构树+跳转 → 智能粘贴 → 多文件批量）
Phase 14    编辑增强（Zen Mode → 格式化 → 多光标 → 导出PDF → 更新检测）
Phase 15    插件系统（架构 + 市场）
Phase 16    本地版本控制（第一个官方插件，验证架构）
Phase 17    插件生态（.mdz / 云同步 / Agent Sync / KaTeX / AI 等）
Phase 18    高级功能（多窗口拆分 / 跨平台 / 网络版本同步）
```

**核心原则：** 基础编辑体验内置，其他能力走插件扩展。
