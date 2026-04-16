# BoltMD — 开发任务拆解 (MVP)

## 开发原则

1. **从内到外**：先核心引擎，再 UI 壳
2. **可独立验证**：每个阶段完成后可独立测试
3. **接口先行**：先定义 interface，再实现
4. **最小依赖**：core 层不依赖 Vue/Tauri，可单独测试
5. **样式变量先行**：所有颜色值从 Phase 0 开始使用 CSS 变量，避免后期主题适配返工

## 开发阶段

### Phase 0: 项目脚手架 + 样式基础（第 1-2 天）

**目标：** 项目跑起来，能看到一个空窗口，CSS 变量体系就位

**任务：**
```
P0-1: 初始化 Tauri 2.0 + Vue 3 + TypeScript 项目
      - pnpm create tauri-app boltmd --template vue-ts
      - 配置 TailwindCSS
      - 配置 ESLint + Prettier

P0-2: 配置 Tauri 窗口
      - tauri.conf.json: 窗口标题 "BoltMD"
      - 窗口默认大小 1200x800
      - 最小窗口 600x400
      - 无原生标题栏（用自定义标题栏）
      - 配置 capabilities/ 权限声明（fs、dialog、window、cli）

P0-3: 创建目录结构
      - 按架构文档创建 src/ 目录结构（含 core/events/）
      - 创建所有 interface 文件（空实现）
      - 创建 EventBus.ts 和事件常量
      - 创建 Rust 目录结构

P0-4: CSS 变量体系（原 Phase 7 的 P7-1 提前）
      - 定义 styles/themes/variables.css 主题变量:
        --bg-primary, --bg-secondary, --bg-editor
        --text-primary, --text-secondary, --text-muted
        --border-color, --border-active
        --accent-color, --accent-hover
        --code-bg, --code-text
        --heading-color, --link-color, --selection-bg
      - 创建 styles/themes/light.css（默认亮色值）
      - 创建 styles/themes/dark.css（暗色值，此阶段仅定义不实现切换）
      - 创建 styles/base.css（全局基础样式，引用 CSS 变量）
      ⚠ Phase 1-8 所有样式必须使用 CSS 变量，禁止硬编码颜色值

P0-5: 验证开发环境
      - pnpm tauri dev 能正常启动
      - 前端热更新正常
      - Rust 编译正常
```

**验收：** 运行 `pnpm tauri dev`，看到一个带自定义标题栏的空白窗口。手动切换 light.css/dark.css 后窗口背景色变化。

---

### Phase 1: 编辑器核心 — WYSIWYG（第 3-6 天）

**目标：** 能在窗口里用 WYSIWYG 模式编辑 Markdown

**任务：**
```
P1-1: 集成 Tiptap 编辑器
      依赖: @tiptap/vue-3, @tiptap/starter-kit, @tiptap/pm
      - 创建 WysiwygEditor.ts，实现 IEditor 接口（含 getScrollPosition/setScrollPosition）
      - 配置 Tiptap 扩展:
        - StarterKit (基础: bold, italic, heading, list, code, blockquote, hr)
        - @tiptap/extension-placeholder (占位符)
        - @tiptap/extension-task-list (任务列表)
        - @tiptap/extension-task-item
        - @tiptap/extension-table (表格)
        - @tiptap/extension-table-row
        - @tiptap/extension-table-cell
        - @tiptap/extension-table-header
        - @tiptap/extension-code-block-lowlight (代码块语法高亮)
        - @tiptap/extension-link (链接)
        - @tiptap/extension-image (图片)
        - @tiptap/extension-underline
        - @tiptap/extension-highlight

P1-2: 集成 tiptap-markdown
      依赖: tiptap-markdown
      - Markdown → Tiptap Document (导入)
      - Tiptap Document → Markdown (导出)
      - 测试: 导入→导出→导入 内容一致

P1-3: 创建 WysiwygView.vue
      - 挂载 Tiptap 编辑器到 DOM
      - 编辑器填满容器
      - 基础编辑器样式 (editor.css)，全部引用 CSS 变量
      - 光标样式、选区样式

P1-4: 编辑器样式调优
      - 标题样式 (h1-h6 字号/间距)
      - 代码块样式 (var(--code-bg)/圆角/语法高亮)
      - 引用块样式 (左边框/var(--bg-secondary))
      - 表格样式 (var(--border-color)/斑马纹)
      - 任务列表样式 (checkbox)
      - 链接样式 (var(--link-color)/下划线)
      - 图片样式 (居中/最大宽度/圆角)
```

**验收：** 在窗口里可以打字，输入 `# Title` 变成标题，`**bold**` 变成加粗，所有基础 Markdown 语法正确渲染。

---

### Phase 2: 编辑器核心 — 源码模式（第 7-9 天）

**目标：** 源码编辑 + 预览分屏

**任务：**
```
P2-1: 集成 CodeMirror 6
      依赖: @codemirror/state, @codemirror/view, @codemirror/lang-markdown,
            @codemirror/language, @codemirror/language-data, @codemirror/commands,
            @codemirror/search
      - 创建 SourceEditor.ts，实现 IEditor 接口（含 getScrollPosition/setScrollPosition）
      - Markdown 语法高亮
      - 行号显示
      - 搜索替换
      - 自动缩进
      - 代码折叠 (按标题)

P2-2: 创建 SourceView.vue
      - 挂载 CodeMirror 编辑器
      - 基础样式适配（引用 CSS 变量）

P2-3: 创建分屏预览
      - SplitView.vue: 左右分屏布局
      - 左边: CodeMirror 源码编辑（内部持有 SourceEditor 实例，委托 IEditor 接口）
      - 右边: Tiptap 只读模式预览（editable: false）
        ⚠ 不使用 markdown-it，统一用 Tiptap 渲染，保证 WYSIWYG 和预览一致
      - 防抖更新 (200ms)

P2-4: 同步滚动
      - 源码区滚动 → 预览区同步滚动
      - 基于行号映射的滚动同步算法
```

**验收：** 源码模式可以编辑 Markdown 并看到语法高亮，分屏模式左编辑右预览且滚动同步，预览渲染与 WYSIWYG 模式一致。

---

### Phase 3: 模式切换 + EditorManager（第 10-11 天）

**目标：** 三种模式自由切换，内容不丢失

**任务：**
```
P3-1: 实现 EditorManager.ts
      - 管理当前活跃的编辑器实例
      - switchMode(mode): 切换模式
        1. 从当前编辑器获取 Markdown
        2. 保存 EditorSnapshot（content + cursor + scroll + mode）
        3. 销毁当前编辑器视图
        4. 创建目标编辑器
        5. 设置内容
        6. 恢复光标位置和滚动位置
      - 提供 saveSnapshot() / restoreFromSnapshot() 方法（供 TabManager 调用）
      - 模式状态管理

P3-2: 创建 EditorContainer.vue
      - 根据当前模式渲染对应编辑器组件
      - 模式切换动画 (简单 fade)

P3-3: 快捷键绑定
      - Ctrl+/ 循环切换模式
      - 模式切换时保存/恢复光标位置和滚动位置

P3-4: 测试模式切换
      - WYSIWYG → Source: Markdown 内容一致
      - Source → WYSIWYG: 格式正确渲染
      - Split → WYSIWYG: 内容一致
      - 快速连续切换不崩溃
      - 中文输入法状态下切换不出错
```

**验收：** Ctrl+/ 在三种模式间切换，内容完全一致，光标位置合理。

---

### Phase 4: 文件操作 + 基础配置（第 12-16 天）

**目标：** 完整的打开/保存/新建流程 + 配置持久化骨架

**任务：**
```
P4-1: Rust 文件命令
      - read_file: 读取文件，自动检测编码
      - save_file: 保存文件
      - save_image: 保存图片到指定目录
      - get_file_info: 获取文件元信息

P4-2: Rust 配置命令（原 Phase 9 的 P9-2 提前）
      - read_config: 读取 %APPDATA%/boltmd/config.json
      - write_config: 写入配置文件
      - 首次启动创建默认配置

P4-3: ConfigService.ts 基础实现（原 Phase 9 的 P9-1 提前）
      - get/set/getAll（强类型 keyof AppConfig）
      - onChange 监听
      - 配置变更自动防抖保存
      ⚠ 后续 Phase 的主题、窗口状态、标签会话等直接使用 ConfigService

P4-4: ErrorService.ts 实现
      - report(error) 方法
      - UI 层展示通知（简单 toast 即可）
      - 所有 invoke 调用统一错误处理模式

P4-5: FileService.ts 实现
      - openFile(): 调用 Tauri 文件对话框 → invoke read_file
      - openFilePath(path): 直接读取路径
      - saveFile(): 保存
      - saveFileAs(): 另存为
      - newFile(): 新建
      ⚠ 接口设计已兼容多标签：返回 FileInfo，不内部持有"当前文件"概念

P4-6: 文件状态管理 (fileStore)
      - 当前文件路径
      - 文件是否修改 (dirty)
      - 文件编码
      - 最后保存时间

P4-7: 未保存提醒
      - 关闭窗口时如果 dirty，弹出确认对话框
      - 标题栏显示文件名 + ● (未保存标记)

P4-7.5: 自动保存
      - 可配置开关（默认关闭）
      - 防抖延迟可配置（默认 3 秒）
      - 通过 ConfigService 读取自动保存设置

P4-8: 命令行启动参数
      - Rust 接收 CLI 参数: boltmd file.md
      - 前端通过 Tauri event 接收文件路径
      - 拖拽文件到窗口打开

P4-9: 文件类型关联
      - Tauri 打包配置: 注册 .md / .markdown 文件关联
      - Windows 注册表: 右键菜单 "用 BoltMD 打开"
      - 配置 NSIS installer 的文件关联
```

**验收：** 完整的文件操作流程正常，双击 .md 文件可以用 BoltMD 打开。ConfigService 可读写配置并持久化。

---

### Phase 5: 多标签页（第 17-20 天）

**目标：** 多文件同时编辑，标签页切换

**任务：**
```
P5-1: TabManager.ts 实现
      - 实现 ITabManager 接口（closeTab 为 async）
      - 标签的增删改查
      - 同一文件防重复打开（已打开则跳转）
      - 标签页状态管理（content/dirty/mode/cursor/scroll）
      - 与 EditorManager 协作：
        切换标签时调用 EditorManager.saveSnapshot() → 保存到旧标签
        → EditorManager.restoreFromSnapshot(新标签数据) → 重建编辑器

P5-2: tabStore (Pinia)
      - tabs: TabState[]
      - activeTabId: string
      - 所有标签操作通过 store 暴露给组件
      ⚠ 内容真相源规则：活跃标签内容在编辑器实例中，非活跃标签内容在 store 中

P5-3: TabBar.vue 组件
      - 标签栏 UI（文件名 + 关闭按钮 + 未保存标记●）
      - 点击切换标签
      - 中键点击关闭标签
      - 拖拽排序（HTML5 Drag and Drop）
      - 右键菜单（关闭/关闭其他/关闭右侧/复制路径）
      - 标签溢出时左右滚动

P5-4: 编辑器与标签页联动
      - 切换标签时：EditorManager.saveSnapshot() → TabManager.switchTab() → EditorManager.restoreFromSnapshot()
      - 每个标签独立维护编辑模式、光标位置、滚动位置
      - 非活跃标签销毁编辑器实例（只保留数据），切回时重建

P5-5: 文件操作对接标签页
      - Ctrl+N → 新建标签
      - Ctrl+O → 在新标签打开文件
      - Ctrl+W → 关闭当前标签（dirty 时弹出异步确认对话框）
      - Ctrl+Tab / Ctrl+Shift+Tab → 切换标签
      - Ctrl+1~9 → 跳转到第N个标签
      - 关闭最后一个标签时：保留窗口，显示欢迎页/空白页

P5-6: 标签会话持久化
      - 通过 ConfigService 持久化标签列表
      - 重启时恢复上次的标签状态
      - 只恢复文件路径和编辑模式，内容从文件重新读取
```

**验收：** 可以同时打开多个文件，标签切换流畅，关闭时正确提示保存，重启恢复标签。

---

### Phase 6: 图片支持（第 21-22 天）

**目标：** 粘贴/拖拽图片自动保存并插入

**任务：**
```
P6-1: ImageService.ts 实现
      - handlePasteImage(blob):
        1. 生成文件名: boltmd-{timestamp}.png
        2. 创建 assets/ 目录（如不存在）
        3. invoke('save_image', { dir, imageData, filename })
        4. 返回相对路径 ./assets/boltmd-xxx.png
      - 错误通过 ErrorService 上报

P6-2: Tiptap 图片粘贴钩子
      - 监听 paste 事件
      - 检测是否有图片数据
      - 调用 ImageService → 获取路径 → 插入 Markdown 图片语法

P6-3: 拖拽图片支持
      - 监听 drop 事件
      - 同 P6-2 流程

P6-4: CodeMirror 图片支持
      - 源码模式下粘贴图片 → 插入 ![](./assets/xxx.png)
```

**验收：** WYSIWYG 和源码模式下，粘贴截图自动保存并插入。

---

### Phase 7: 主题系统（第 23-24 天）

**目标：** 亮色/暗色主题动态切换

**说明：** CSS 变量已在 Phase 0 定义，亮色/暗色变量值已就位。本阶段只需实现切换逻辑和编辑器主题适配。

**任务：**
```
P7-1: ThemeService.ts 实现
      - getCurrentTheme / setTheme / followSystem
      - 切换时切换 document.documentElement 的 data-theme 属性
      - 通过 ConfigService 持久化主题选择
      - 通过 EventBus 广播 ThemeChange 事件

P7-2: 编辑器主题适配
      - Tiptap 编辑器跟随 CSS 变量（已在 Phase 1 使用变量，此处验证）
      - CodeMirror 主题适配（CM6 需要 reconfigure Extension，不能只改 CSS）
        - 创建 light/dark EditorTheme Extension
        - ThemeChange 事件触发时 reconfigure
      - 代码块语法高亮配色适配

P7-3: 跟随系统
      - 监听 prefers-color-scheme 变化
      - 自动切换
```

**验收：** 亮/暗主题切换，编辑器/UI/代码高亮全部正确适配。

---

### Phase 8: UI 壳（第 25-28 天）

**目标：** 完整的应用 UI

**任务：**
```
P8-1: 自定义标题栏 (TitleBar.vue)
      - 文件名显示 (未保存时带 ●)
      - 最小化/最大化/关闭按钮
      - 窗口拖拽移动
      - 双击最大化
      ⚠ Toolbar/StatusBar/SettingsPanel/CommandPalette 使用 defineAsyncComponent 懒加载

P8-2: 状态栏 (StatusBar.vue)
      - 左侧: 文件编码 | 行数/字数
      - 右侧: 光标位置 | 编辑模式切换 | 主题切换
      - 字数统计用 requestIdleCallback 延迟计算

P8-3: 工具栏 (Toolbar.vue)
      - WYSIWYG 模式专用格式化按钮
      - 按钮图标 (使用 lucide-icons)
      - Ctrl+Shift+T 显示/隐藏
      - 工具栏紧凑模式

P8-4: 设置面板 (SettingsPanel.vue)
      - 编辑器: 字体/字号/行高/Tab大小/自动换行
      - 文件: 自动保存开关/延迟/编码
      - 外观: 主题选择
      - 快捷键参考
      - 所有设置通过 ConfigService 持久化

P8-5: 命令面板 (CommandPalette.vue)
      - Ctrl+Shift+P 打开
      - 搜索并执行命令
      - 列表: 所有可执行的功能

P8-6: 窗口状态记忆
      - 通过 ConfigService 保存/恢复窗口大小和位置
```

**验收：** 完整的应用外观，所有 UI 组件功能正常。

---

### Phase 9: 配置全面对接（第 29 天）

**目标：** 所有组件完整对接 ConfigService，确保设置一致性

**说明：** ConfigService 骨架和 Rust 命令已在 Phase 4 完成。本阶段做查漏补缺和全面验证。

**任务：**
```
P9-1: 全面对接检查
      - 主题选择 → ConfigService ✓（Phase 7 已对接）
      - 窗口状态 → ConfigService ✓（Phase 8 已对接）
      - 标签会话 → ConfigService ✓（Phase 5 已对接）
      - 编辑器参数（字体/字号/行高/Tab大小/自动换行）→ 对接
      - 默认编辑模式 → 对接
      - 自动保存开关和延迟 → 对接
      - 图片存储路径偏好 → 对接

P9-2: 配置迁移与防御
      - 配置文件版本号
      - 旧版本配置自动迁移
      - 配置文件损坏时回退到默认值
```

**验收：** 修改任意设置后重启应用，所有设置保持。配置文件损坏时不崩溃。

---

### Phase 10: 打包与发布（第 30-33 天）

**目标：** 可安装的 Windows 应用

**任务：**
```
P10-1: 应用图标
       - 设计 BoltMD 图标 (闪电 + 文档)
       - 生成各尺寸 icon (16/32/48/64/128/256)
       - 配置到 tauri.conf.json

P10-2: 打包配置
       - NSIS installer 配置
       - 文件类型关联 (.md, .markdown)
       - 开始菜单快捷方式
       - 卸载程序

P10-3: 启动性能优化
       - 首屏最小化: 去掉不必要的首次加载
       - 编辑器懒加载: 需要时才初始化
       - CSS 内联关键路径样式
       - 测量并记录启动时间

P10-4: 应用签名 (可选)
       - Windows 代码签名证书

P10-5: GitHub Release
       - 自动构建 CI (GitHub Actions)
       - 生成 .msi 和 .exe 安装包
       - 编写 Release Notes

P10-6: README.md
       - 产品截图/GIF
       - 启动速度对比 benchmark
       - 功能特性列表
       - 安装说明
       - 构建说明
```

**验收：** Windows 用户下载安装包，安装后双击 .md 文件可以打开编辑。

---

## 开发时间表

| 阶段 | 天数 | 累计 | 里程碑 |
|------|------|------|--------|
| Phase 0: 脚手架+样式基础 | 2天 | 2天 | 空窗口 + CSS 变量体系 |
| Phase 1: WYSIWYG | 4天 | 6天 | 可以编辑 Markdown |
| Phase 2: 源码模式 | 3天 | 9天 | 双模式编辑 |
| Phase 3: 模式切换 | 2天 | 11天 | **三模式切换 (首个可视化里程碑)** |
| Phase 4: 文件操作+基础配置 | 5天 | 16天 | **完整文件流程 (首个可用里程碑)** |
| Phase 5: 多标签页 | 4天 | 20天 | 多文件编辑 |
| Phase 6: 图片 | 2天 | 22天 | 图片粘贴 |
| Phase 7: 主题 | 2天 | 24天 | 亮暗主题切换 |
| Phase 8: UI | 4天 | 28天 | **完整界面 (可展示里程碑)** |
| Phase 9: 配置对接 | 1天 | 29天 | 设置持久化 |
| Phase 10: 打包发布 | 4天 | 33天 | **可发布 MVP** |

**总计：33 个工作日（约 7 周）**

## 里程碑可视化

```
Phase 0-1 (6天)  → 窗口里能写 Markdown，有格式渲染
Phase 0-3 (11天) → 三种编辑模式可切换，像个编辑器了
Phase 0-4 (16天) → 能打开/保存真实文件，可以日常使用 ★ 内部可用
Phase 0-8 (28天) → 标题栏+状态栏+工具栏+标签页，看起来像正式产品 ★ 可展示
Phase 0-10(33天) → 安装包+文件关联，可以发布 ★ 正式发布
```
