/**
 * SearchAndReplace Tiptap 3 扩展
 *
 * 功能：
 * - 在文档中查找文本（支持大小写敏感、全字匹配、正则）
 * - 高亮所有匹配项，当前匹配项使用强调色
 * - 跳转上/下一个匹配项
 * - 替换当前匹配 / 替换全部
 *
 * 实现思路：
 * - 用 ProseMirror Plugin 维护搜索状态
 * - DecorationSet 渲染匹配项高亮
 * - 每次文档变更或搜索参数变化时重新计算匹配项
 *
 * 参考：sereneinserenade/tiptap-search-and-replace (MIT)
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface SearchAndReplaceOptions {
  searchResultClass: string
  searchCurrentClass: string
}

export interface SearchQueryOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface MatchRange {
  from: number
  to: number
}

export interface SearchPluginState {
  searchTerm: string
  options: SearchQueryOptions
  results: MatchRange[]
  currentIndex: number // 0-based，-1 = 无匹配
  decorations: DecorationSet
  error: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string, options: SearchQueryOptions) => ReturnType
      nextSearchResult: () => ReturnType
      prevSearchResult: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAllMatches: (replacement: string) => ReturnType
      clearSearch: () => ReturnType
    }
  }
}

export const searchPluginKey = new PluginKey<SearchPluginState>('searchAndReplace')

/** 转义字符串中的正则元字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 构建 RegExp；失败时返回 null 并把错误写入 error 参数 */
function buildRegex(term: string, options: SearchQueryOptions): { regex: RegExp | null; error: string | null } {
  if (!term) return { regex: null, error: null }

  try {
    let pattern: string
    if (options.regex) {
      pattern = term
    } else {
      pattern = escapeRegex(term)
    }
    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`
    }
    const flags = options.caseSensitive ? 'g' : 'gi'
    return { regex: new RegExp(pattern, flags), error: null }
  } catch (e) {
    return { regex: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 遍历文档收集所有匹配项
 * ProseMirror 用的是 absolute position；对每个 text node 搜索后把 offset 加上 node 的起始位置
 */
function findMatches(doc: PMNode, regex: RegExp | null): MatchRange[] {
  if (!regex) return []
  const results: MatchRange[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    // reset lastIndex 以免正则被之前的搜索污染
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        // 防止零宽匹配导致死循环
        regex.lastIndex++
        continue
      }
      const from = pos + match.index
      const to = from + match[0].length
      results.push({ from, to })
    }
  })

  return results
}

/** 根据匹配结果构建 DecorationSet */
function buildDecorations(
  doc: PMNode,
  results: MatchRange[],
  currentIndex: number,
  options: SearchAndReplaceOptions,
): DecorationSet {
  const decorations: Decoration[] = results.map((range, idx) => {
    const cls = idx === currentIndex
      ? `${options.searchResultClass} ${options.searchCurrentClass}`
      : options.searchResultClass
    return Decoration.inline(range.from, range.to, { class: cls })
  })
  return DecorationSet.create(doc, decorations)
}

/** 给定光标位置，找到最靠后（>= pos）的匹配项索引；若无则返回 0 */
function findIndexFromPos(results: MatchRange[], pos: number): number {
  if (results.length === 0) return -1
  for (let i = 0; i < results.length; i++) {
    if (results[i].from >= pos) return i
  }
  return 0 // 循环回到首项
}

export const SearchAndReplace = Extension.create<SearchAndReplaceOptions>({
  name: 'searchAndReplace',

  addOptions() {
    return {
      searchResultClass: 'search-match',
      searchCurrentClass: 'search-match-current',
    }
  },

  addCommands() {
    return {
      setSearchTerm:
        (term, options) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { type: 'setSearch', term, options })
            dispatch(tr)
          }
          return true
        },

      nextSearchResult:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { type: 'next' })
            dispatch(tr)
          }
          return true
        },

      prevSearchResult:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { type: 'prev' })
            dispatch(tr)
          }
          return true
        },

      replaceCurrent:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const pluginState = searchPluginKey.getState(state)
          if (!pluginState || pluginState.currentIndex < 0) return false
          const range = pluginState.results[pluginState.currentIndex]
          if (!range) return false
          if (dispatch) {
            tr.insertText(replacement, range.from, range.to)
            tr.setMeta(searchPluginKey, { type: 'rerun' })
            dispatch(tr)
          }
          return true
        },

      replaceAllMatches:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const pluginState = searchPluginKey.getState(state)
          if (!pluginState || pluginState.results.length === 0) return false
          if (dispatch) {
            // 从后往前替换，避免位置偏移问题
            const sorted = [...pluginState.results].sort((a, b) => b.from - a.from)
            for (const range of sorted) {
              tr.insertText(replacement, range.from, range.to)
            }
            tr.setMeta(searchPluginKey, { type: 'rerun' })
            dispatch(tr)
          }
          return true
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { type: 'clear' })
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,

        state: {
          init(): SearchPluginState {
            return {
              searchTerm: '',
              options: { caseSensitive: false, wholeWord: false, regex: false },
              results: [],
              currentIndex: -1,
              decorations: DecorationSet.empty,
              error: null,
            }
          },

          apply(tr: Transaction, prev: SearchPluginState, _oldState: EditorState, newState: EditorState): SearchPluginState {
            const meta = tr.getMeta(searchPluginKey) as
              | { type: 'setSearch'; term: string; options: SearchQueryOptions }
              | { type: 'next' }
              | { type: 'prev' }
              | { type: 'rerun' }
              | { type: 'clear' }
              | undefined

            // 无 meta 时，如果文档变更了，跟随映射；否则保持
            if (!meta) {
              if (tr.docChanged && prev.searchTerm) {
                // 文档变了，重新计算
                const { regex, error } = buildRegex(prev.searchTerm, prev.options)
                const results = findMatches(newState.doc, regex)
                const selPos = newState.selection.from
                const currentIndex = findIndexFromPos(results, selPos)
                return {
                  ...prev,
                  results,
                  currentIndex,
                  error,
                  decorations: buildDecorations(newState.doc, results, currentIndex, options),
                }
              }
              if (tr.docChanged) {
                return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) }
              }
              return prev
            }

            if (meta.type === 'clear') {
              return {
                searchTerm: '',
                options: prev.options,
                results: [],
                currentIndex: -1,
                decorations: DecorationSet.empty,
                error: null,
              }
            }

            if (meta.type === 'setSearch') {
              const { regex, error } = buildRegex(meta.term, meta.options)
              const results = findMatches(newState.doc, regex)
              const selPos = newState.selection.from
              const currentIndex = findIndexFromPos(results, selPos)
              return {
                searchTerm: meta.term,
                options: meta.options,
                results,
                currentIndex,
                error,
                decorations: buildDecorations(newState.doc, results, currentIndex, options),
              }
            }

            if (meta.type === 'next') {
              if (prev.results.length === 0) return prev
              const nextIndex = (prev.currentIndex + 1) % prev.results.length
              return {
                ...prev,
                currentIndex: nextIndex,
                decorations: buildDecorations(newState.doc, prev.results, nextIndex, options),
              }
            }

            if (meta.type === 'prev') {
              if (prev.results.length === 0) return prev
              const prevIndex = prev.currentIndex <= 0 ? prev.results.length - 1 : prev.currentIndex - 1
              return {
                ...prev,
                currentIndex: prevIndex,
                decorations: buildDecorations(newState.doc, prev.results, prevIndex, options),
              }
            }

            if (meta.type === 'rerun') {
              const { regex, error } = buildRegex(prev.searchTerm, prev.options)
              const results = findMatches(newState.doc, regex)
              const selPos = newState.selection.from
              const currentIndex = findIndexFromPos(results, selPos)
              return {
                ...prev,
                results,
                currentIndex,
                error,
                decorations: buildDecorations(newState.doc, results, currentIndex, options),
              }
            }

            return prev
          },
        },

        props: {
          decorations(state) {
            return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
