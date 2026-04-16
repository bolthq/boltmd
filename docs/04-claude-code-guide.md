# BoltMD — Claude Code 开发指南

## 本文档的目的

这是给 AI 编码助手（Claude Code）的开发指南。包含项目上下文、技术约束、编码规范和常见陷阱。

## 项目概述

BoltMD 是一个基于 Tauri 2.0 的轻量 Markdown 编辑器。

- **仓库结构**: Tauri 标准结构，前端在 `src/`，Rust 后端在 `src-tauri/`
- **前端**: Vue 3 + TypeScript + Tiptap + CodeMirror 6 + TailwindCSS
- **后端**: Rust (Tauri 2.0)
- **包管理器**: pnpm
- **目标平台**: Windows (首发)

## 关键设计约束

### 性能第一

1. **启动时间目标 < 500ms**
   - 首屏只加载 App Shell + 编辑器核心
   - Toolbar、StatusBar、Settings 等用 `defineAsyncComponent` 懒加载
   - 不要在 main.ts 中 import 大型库
   - CSS 关键路径内联

2. **编辑响应 < 16ms（60fps）**
   - 不要在 Tiptap/CodeMirror 的更新回调中做耗时操作
   - 内容变更通知使用防抖 (debounce)
   - 状态栏字数统计使用 requestIdleCallback

3. **大文件策略**
   - >1MB 的文件，WYSIWYG 模式弹出提示建议切换源码模式
   - CodeMirror 6 默认开启虚拟滚动

### 架构规则

1. **core/ 不依赖 Vue**
   - `core/editor/` 和 `core/services/` 是纯 TypeScript
   - 不 import vue, @vue/*, pinia
   - 这样可以独立测试，未来可以换 UI 框架

2. **单向依赖**
   ```
   components/ → stores/ → services/ → core/
   ```
   composables/ 可选用于封装复杂逻辑，不作为必经层。禁止反向依赖。

3. **Tauri IPC 只在 services/ 中调用**
   - `invoke()` 和 Tauri API 只在 service 层使用
   - 组件通过 composable → store → service 间接调用
   - 方便测试和跨平台适配

### 编码规范

1. **TypeScript 严格模式**
   - `strict: true` in tsconfig.json
   - 不使用 `any`，必要时用 `unknown` + 类型守卫
   - 所有函数参数和返回值有类型注解

2. **Vue 组件规范**
   - 使用 `<script setup lang="ts">` 组合式 API
   - Props 使用 `defineProps<{...}>()` 类型声明
   - Emits 使用 `defineEmits<{...}>()`

3. **命名规范**
   - 文件: PascalCase.vue / camelCase.ts
   - 组件: PascalCase
   - composable: useCamelCase
   - 常量: UPPER_SNAKE_CASE
   - CSS 变量: --kebab-case

4. **Rust 规范**
   - 遵循 Rust 标准命名 (snake_case 函数/变量, PascalCase 类型)
   - 错误处理使用 Result<T, String>（MVP 阶段简化）
   - Tauri command 函数加 `#[tauri::command]` 宏

## 关键依赖版本

```json
{
  "@tauri-apps/api": "^2",
  "@tauri-apps/cli": "^2",
  "@tauri-apps/plugin-dialog": "^2",
  "@tauri-apps/plugin-fs": "^2",
  "@tauri-apps/plugin-cli": "^2",
  "vue": "^3.5",
  "@tiptap/vue-3": "^2",
  "@tiptap/starter-kit": "^2",
  "tiptap-markdown": "^0.8",
  "@codemirror/state": "^6",
  "@codemirror/view": "^6",
  "@codemirror/lang-markdown": "^6",
  "@codemirror/language-data": "^6",
  "tailwindcss": "^4",
  "pinia": "^2",
  "lucide-vue-next": "latest"
}
```

**注意：**
- **不使用 markdown-it。** 分屏预览使用 Tiptap 只读模式（`editable: false`），保证渲染结果与 WYSIWYG 模式一致。
- **core/ 层使用 `@tiptap/core`**，不使用 `@tiptap/vue-3`。Vue 绑定只在 components/ 层的 `.vue` 文件中使用。
- **Rust 文件 I/O 命令使用 `async`**，避免阻塞 Tauri 主线程。
- **Rust 编码检测依赖 `encoding_rs` crate。**

## 核心接口一览

所有编辑器实现必须遵循 `IEditor` 接口：

```typescript
interface IEditor {
  getContent(): string
  setContent(markdown: string): void
  focus(): void
  getCursorPosition(): CursorPosition
  setCursorPosition(pos: CursorPosition): void
  getScrollPosition(): number
  setScrollPosition(pos: number): void
  getSelection(): string
  insertText(text: string): void
  undo(): void
  redo(): void
  destroy(): void
  onContentChange(callback: (markdown: string) => void): void
  getWordCount(): WordCount
}
```

WYSIWYG 编辑器 (WysiwygEditor) 和源码编辑器 (SourceEditor) 都实现这个接口。EditorManager 通过接口操作编辑器，不关心具体实现。

## 关键设计规则

### 内容真相源

- **活跃标签**：真相源 = 编辑器实例（Tiptap/CM6 内部 state），store 里的 content 可能过时
- **非活跃标签**：真相源 = tabStore 中的快照
- **同步时机**：仅在切换标签、保存文件、模式切换、关闭标签时同步
- **不在每次按键时同步到 store**

### 错误处理

所有 `invoke()` 调用必须 catch 并通过 ErrorService 上报：
```typescript
try {
  const result = await invoke<T>('command', { ... })
} catch (e) {
  errorService.report({ level: ErrorLevel.Error, message: '用户可见信息', detail: String(e), source: 'ServiceName' })
  throw e
}
```

### 样式规则

**所有颜色值必须使用 CSS 变量**（Phase 0 已定义），禁止硬编码颜色值如 `#333`、`rgb(0,0,0)` 等。
```css
/* ✗ 错误 */
color: #333;
background: white;

/* ✓ 正确 */
color: var(--text-primary);
background: var(--bg-primary);
```

## 常见陷阱

### Tiptap 相关

1. **tiptap-markdown 的导出可能丢失格式**
   - 特别是复杂的嵌套列表和表格
   - 需要测试: 导入 → 导出 → 再导入，内容应一致
   - 如果某些格式不支持，在文档中记录限制

2. **中文输入法 (IME)**
   - Tiptap 默认支持 IME，但自定义 inputRules 可能冲突
   - 测试时必须用中文输入法验证

3. **Tiptap 扩展顺序**
   - 某些扩展有依赖关系，注册顺序影响行为
   - StarterKit 要放在最前面

### CodeMirror 6 相关

1. **主题切换**
   - CM6 的主题不是 CSS 变量，而是 Extension
   - 切换主题需要 reconfigure，不能只改 CSS

2. **Markdown 语法高亮**
   - `@codemirror/lang-markdown` 需要配合 `@codemirror/language-data` 才能高亮代码块内的语法

### Tauri 相关

1. **WebView2 在 Windows 10 老版本可能没有**
   - 安装包需要包含 WebView2 引导安装程序
   - tauri.conf.json 中配置 `"webviewInstallMode": "downloadBootstrapper"`

2. **文件路径**
   - Windows 路径是 `\`，前端收到的路径需要处理
   - 使用 Tauri 的 path API，不要手动拼路径

3. **IPC 序列化**
   - Rust → JS 的数据传递经过 JSON 序列化
   - 不要传递大型二进制数据（图片用 base64 或临时文件路径）

4. **权限系统 (Tauri 2.0)**
   - Tauri 2.0 有权限系统，需要在 `capabilities/` 目录声明所需权限
   - 文件读写、对话框、窗口管理等都需要明确声明

## 开发顺序

严格按 `docs/03-development-plan.md` 的 Phase 0 → 10 顺序开发。每个 Phase 完成后提交一次，附带简要说明。

## 测试策略

MVP 阶段以手动测试为主，关键路径写单元测试：

1. **必须测试的**：
   - MarkdownSerializer: 导入导出一致性
   - EditorManager: 模式切换内容不丢失
   - FileService: 文件读写正确性

2. **手动测试**：
   - 所有 Markdown 语法在 WYSIWYG 中的渲染
   - 大文件（1MB+）的打开速度
   - 启动速度（用 performance.now() 测量）
   - 中文输入法兼容性

## 目录结构参考

详见 `docs/01-architecture.md` 的模块划分章节。

## ⚠️ 开发流程（必须严格遵守）

### 模型切换规则

不同 Phase 使用不同模型以平衡质量和成本：

| Phase | 模型 | 理由 |
|-------|------|------|
| Phase 0: 脚手架 | claude-sonnet-4-6 | 模板化操作，不需要深度推理 |
| Phase 1: WYSIWYG | **claude-opus-4-6-v1** | Tiptap 集成+IEditor 接口实现，架构关键期 |
| Phase 2: 源码模式 | claude-sonnet-4-6 | CodeMirror 集成相对标准 |
| Phase 3: 模式切换 | **claude-opus-4-6-v1** | EditorManager 核心逻辑+EditorSnapshot，需要仔细设计 |
| Phase 4: 文件操作+配置 | claude-sonnet-4-6 | Tauri 文件 API + 配置 CRUD，比较标准 |
| Phase 5: 多标签页 | **claude-opus-4-6-v1** | TabManager 与 EditorManager 协作，真相源规则，逻辑最复杂 |
| Phase 6: 图片 | claude-sonnet-4-6 | 相对独立的功能模块 |
| Phase 7: 主题 | claude-sonnet-4-6 | CSS 变量+主题切换，常规操作 |
| Phase 8: UI | claude-sonnet-4-6 | Vue 组件开发 |
| Phase 9: 配置对接 | claude-sonnet-4-6 | 查漏补缺 |
| Phase 10: 打包 | claude-sonnet-4-6 | Tauri 打包配置 |

**切换方法：** 在 Claude Code 中输入 `/model claude-opus-4-6-v1` 或 `/model claude-sonnet-4-6`

**原则：**
- 默认 claude-sonnet-4-6（快、便宜、日常编码够用）
- 架构关键期（Phase 1/3/5）用 claude-opus-4-6-v1（复杂推理、多模块协调）
- 遇到疑难 bug 随时临时切 claude-opus-4-6-v1

### Git 提交流程

**所有 git commit 和 push 都必须先给 Dio 确认！绝不允许自作主张提交或推送。**

1. 完成一个 Phase 或有意义的功能点后 → 运行 `git diff` 展示改动
2. 等 Dio 确认说 "ok" → 才能 `git commit`
3. commit 后 → 问 Dio "要不要 push？"
4. Dio 说 "ok" → 才能 `git push`
5. **无论改动多小，都走这个流程**

### 开发节奏

1. **严格按 Phase 顺序开发**（Phase 0 → 1 → 2 → ... → 10）
2. **每个 Phase 完成后**：
   - 在 `TASKS.md` 中把对应任务打 ✅
   - 确保能正常运行（`pnpm tauri dev` 不报错）
   - 手动测试验收标准中列出的所有条目
   - 展示 `git diff` 给 Dio 审查
3. **遇到问题时**：
   - 先自己查文档和搜索解决
   - 确实解决不了的，说明问题和已尝试的方案，等 Dio 决策
   - 不要自己做架构级的变更（比如换掉 Tiptap、改依赖方向等）
4. **不要超前开发**：
   - 不做当前 Phase 以外的功能
   - 不提前优化（"先让它跑起来，再让它跑得好"）

### 代码变更原则

- **新增文件**：可以自主创建
- **修改架构**：需要说明理由，等 Dio 确认
- **新增依赖**：需要说明为什么需要这个包，等 Dio 确认
- **删除功能**：禁止，除非 Dio 明确要求
- **变更接口定义**：需要说明理由和影响范围，等 Dio 确认
