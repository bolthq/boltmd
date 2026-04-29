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
