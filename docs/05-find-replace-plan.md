# BoltMD — Phase 10.1: 查找/替换功能开发计划

> 本文档由 Claude Code 于 2026-04 编写，基于与用户确认的方案 A（统一自定义 UI + 全功能）。
> 此功能作为发布前最后一项功能性工作，置于 Phase 10.1（介于性能优化与 CI 之间）。

## 目标

为三种编辑模式（WYSIWYG / Source / Split）提供**统一的查找/替换体验**，以悬浮面板形式呈现，支持大小写敏感、全字匹配、正则表达式、单个替换、全部替换。

## 设计原则

1. **统一 UI**：三种模式共用同一个 `FindReplacePanel` 组件
2. **接口下沉**：通过 `IEditor` 接口屏蔽 Tiptap/CodeMirror 差异
3. **主题一致**：使用 CSS 变量，暗/亮色自动跟随
4. **i18n 就绪**：所有文本通过 vue-i18n 管理

---

## 📦 新增依赖

无。Tiptap 官方没有提供 search-and-replace 扩展，社区第三方包（`@memfoldai/tiptap-search-and-replace` 等）供应链风险较高。因此在项目内**自实现**一个 Tiptap 3 搜索扩展，参考 sereneinserenade 的 MIT 思路，用 ProseMirror Decoration 高亮匹配项。

CodeMirror 侧复用已有的 `@codemirror/search`，无需新增。

---

## 🏗️ 代码变更清单

### 1. 扩展 IEditor 接口

**文件**：`src/core/editor/types.ts`

```typescript
export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface SearchState {
  total: number      // 匹配总数
  current: number    // 当前光标所在匹配项索引（1-based，0 = 无匹配）
}

export interface IEditor {
  // ... 现有方法保持不变
  search(query: string, options: SearchOptions): SearchState
  gotoNextMatch(): SearchState
  gotoPrevMatch(): SearchState
  replaceNext(replacement: string): SearchState
  replaceAll(replacement: string): number
  clearSearch(): void
}
```

### 2. WysiwygEditor 实现

**文件**：
- `src/core/editor/extensions/SearchAndReplace.ts`（新建，自实现的 Tiptap 扩展）
- `src/core/editor/WysiwygEditor.ts`（引入扩展并封装 6 个方法）

**扩展要点**：
- 使用 ProseMirror Plugin + DecorationSet 高亮匹配项
- 存储 `searchTerm`、`options`、`results`、`resultIndex` 在 PluginState 中
- 提供 commands：`setSearchTerm`、`nextSearchResult`、`prevSearchResult`、`replace`、`replaceAll`、`clearSearch`
- 支持选项：caseSensitive、wholeWord、regex
- 高亮 class 使用 CSS 变量驱动的 `.search-match` / `.search-match-current`

### 3. SourceEditor 实现

**文件**：`src/core/editor/SourceEditor.ts`

- 封装 CM6 的 `SearchQuery` + `setSearchQuery` + `findNext` / `findPrevious` / `replaceNext` / `replaceAll`
- 通过 Compartment 管理搜索状态，保证可清除
- **关键**：返回 `SearchState`（total/current），CM6 原生 API 不直接返回 total，需要遍历 `cursor.findAll()` 计算

### 4. EditorManager 代理

**文件**：`src/core/editor/EditorManager.ts`

把 6 个新方法透传给当前激活的 editor，SplitView 下路由到源码编辑器。

### 5. FindReplacePanel 组件（新建）

**文件**：`src/components/common/FindReplacePanel.vue`

**布局**：
```
┌────────────────────────────────────────────────────────┐
│ 🔍 [查找______________]  [↑] [↓]  1/5  [Aa][W][.*] [×] │
│ 🔁 [替换______________]  [替换]  [全部替换]            │
└────────────────────────────────────────────────────────┘
```

**功能**：
- `v-model` 双向绑定查找词/替换词
- 三个切换按钮：大小写 (Aa) / 全字 (W) / 正则 (.*)
- 实时搜索（debounce 200ms）
- 状态显示 `当前/总数`
- 正则语法错误时显示红色边框
- 快捷键：
  - `Enter` → 下一个
  - `Shift+Enter` → 上一个
  - `Esc` → 关闭面板
  - `Ctrl+Enter` → 替换当前
  - `Ctrl+Shift+Enter` → 全部替换

**位置**：固定在编辑器容器右上角，半透明背景（VSCode 风格）

**样式**：全部使用 CSS 变量

### 6. EditorContainer 集成

**文件**：`src/components/editor/EditorContainer.vue`

- 监听 `Ctrl+F` / `Ctrl+H` 快捷键
- 挂载 `FindReplacePanel`，传入 `editorManager` 引用
- 关闭面板时调用 `editor.clearSearch()`
- 切换模式时自动清空搜索状态

### 7. i18n 翻译

**文件**：`src/i18n/locales/en.ts`、`src/i18n/locales/zh-CN.ts`

新增 keys：
- `findReplace.find` / `findReplace.replace`
- `findReplace.caseSensitive` / `findReplace.wholeWord` / `findReplace.regex`
- `findReplace.replaceOne` / `findReplace.replaceAll`
- `findReplace.noMatches` / `findReplace.regexError`
- `findReplace.previous` / `findReplace.next` / `findReplace.close`

### 8. 菜单栏入口

**文件**：`src/components/layout/MenuBar.vue`

在 Edit 菜单下添加：
- Find (Ctrl+F)
- Replace (Ctrl+H)

---

## 🧪 验收标准

1. ✅ WYSIWYG 模式按 Ctrl+F 弹出面板，输入关键词能高亮、能循环跳转
2. ✅ 源码模式同样生效（不再使用 CM6 默认面板）
3. ✅ 三个选项（大小写/全字/正则）切换实时重新匹配
4. ✅ 替换/全部替换正确工作，且不破坏 Markdown 结构
5. ✅ 正则错误时显示提示而不崩溃
6. ✅ Esc 关闭面板并清除高亮
7. ✅ 切换模式时搜索状态正确清除
8. ✅ 主题切换时面板样式跟随
9. ✅ 暗色/亮色主题下视觉一致
10. ✅ `pnpm build` 通过，`cargo check` 通过

---

## ⚠️ 已知风险与缓解

| 风险 | 缓解方案 |
|------|---------|
| Tiptap 的 search-and-replace 扩展可能与 Markdown 的 `*bold*` 等标记交互异常 | 测试中特别关注 Markdown 导出后的内容是否仍然合法 |
| CM6 的 total 计数需要遍历，大文件性能 | 先遍历计数，若发现性能瓶颈再引入可视区优先策略 |
| 多标签切换时搜索状态污染 | TabManager 的 snapshot 包含搜索状态清空逻辑 |
| SplitView 下搜索应该作用在哪一侧 | 规则：只作用于 CodeMirror（左侧），右侧预览跟随 |

---

## 📊 预估工作量

| 步骤 | 预估 |
|------|------|
| 接口扩展 | 15 分钟 |
| WysiwygEditor 实现 | 30 分钟 |
| SourceEditor 实现 | 40 分钟 |
| FindReplacePanel 组件 | 60 分钟 |
| EditorContainer 集成 + 快捷键 | 20 分钟 |
| i18n + 菜单 | 10 分钟 |
| 验证 + 调试 | 30 分钟 |
| **总计** | **约 3~4 小时** |

---

## 🚫 本次不做的事

- 不做查找结果的独立面板（仅弹出式）
- 不做跨文件搜索
- 不做搜索历史记录
- 不做 "Find in selection"
- Tiptap 的 search 扩展依赖它自己的 decorations，不尝试与 ProseMirror 原生选择集成

---

## 💾 提交策略

按**逻辑单元**做多个小 commit，每次提交前征求用户同意。推荐的 commit 拆分：

1. `feat(editor): extend IEditor interface with search/replace methods`
2. `feat(editor): implement search in WysiwygEditor via tiptap extension`
3. `feat(editor): implement search in SourceEditor via CM6 SearchQuery`
4. `feat(ui): add FindReplacePanel component with regex/case/word options`
5. `feat(editor): wire Ctrl+F/Ctrl+H to FindReplacePanel and menu entry`
6. `i18n: add findReplace translations for en/zh-CN`

或合并成 1~2 个更粗粒度的 commit，由用户在实现完成后决定。
