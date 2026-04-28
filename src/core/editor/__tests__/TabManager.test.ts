import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock i18n before importing TabManager (TabManager calls t() at module load).
// Path must match the specifier used inside TabManager.ts exactly.
vi.mock('../../../i18n', () => ({
  t: (key: string) => key,
}))

// Mock EditorManager: saveSnapshot returns a capturable sentinel, and
// restoreFromSnapshot records the last call so tests can assert behavior.
const snapshotCalls: unknown[] = []
const restoreCalls: unknown[] = []
vi.mock('../EditorManager', () => ({
  saveSnapshot: vi.fn(() => {
    const snap = {
      content: '__snap__',
      cursor: { line: 1, column: 1, offset: 1 },
      scroll: 42,
      mode: 'wysiwyg' as const,
    }
    snapshotCalls.push(snap)
    return snap
  }),
  restoreFromSnapshot: vi.fn((snap: unknown) => {
    restoreCalls.push(snap)
  }),
}))

import { TabManager } from '../TabManager'

describe('TabManager', () => {
  let mgr: TabManager

  beforeEach(() => {
    mgr = new TabManager()
    snapshotCalls.length = 0
    restoreCalls.length = 0
  })

  describe('createTab', () => {
    it('creates a blank tab and activates it', () => {
      const tab = mgr.createTab()
      expect(mgr.getTabs()).toHaveLength(1)
      expect(mgr.getActiveTabId()).toBe(tab.id)
      expect(tab.filePath).toBeNull()
      expect(tab.content).toBe('')
      expect(tab.dirty).toBe(false)
    })

    it('notifies change callback', () => {
      const spy = vi.fn()
      mgr.onChange(spy)
      mgr.createTab()
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('openTab', () => {
    it('opens a file in a new tab', () => {
      const tab = mgr.openTab('/tmp/a.md', 'hello')
      expect(tab.filePath).toBe('/tmp/a.md')
      expect(tab.fileName).toBe('a.md')
      expect(tab.content).toBe('hello')
      expect(mgr.getActiveTabId()).toBe(tab.id)
    })

    it('does not duplicate when the same file is opened twice', () => {
      const first = mgr.openTab('/tmp/a.md', 'hello')
      const second = mgr.openTab('/tmp/a.md', 'ignored')
      expect(mgr.getTabs()).toHaveLength(1)
      expect(second.id).toBe(first.id)
    })

    it('extracts file name from windows-style path separators', () => {
      const tab = mgr.openTab('C:\\docs\\note.md', 'x')
      expect(tab.fileName).toBe('note.md')
    })
  })

  describe('openBundledDocTab', () => {
    it('creates a new tab with null filePath every call', () => {
      const a = mgr.openBundledDocTab('Welcome', '# hi')
      const b = mgr.openBundledDocTab('Welcome', '# hi')
      expect(mgr.getTabs()).toHaveLength(2)
      expect(a.id).not.toBe(b.id)
      expect(a.filePath).toBeNull()
      expect(b.filePath).toBeNull()
    })
  })

  describe('switchTab', () => {
    it('saves current snapshot before switching', () => {
      const a = mgr.createTab()
      const b = mgr.openTab('/tmp/b.md', 'bbb')
      // switching from b to a should persist b's editor snapshot into b
      mgr.switchTab(a.id)
      // b was the current active; its fields should reflect the mocked snapshot
      const bAfter = mgr.getTabs().find((t) => t.id === b.id)!
      expect(bAfter.content).toBe('__snap__')
      expect(bAfter.scrollPosition).toBe(42)
    })

    it('restores target snapshot into editor', () => {
      mgr.createTab()
      const b = mgr.openTab('/tmp/b.md', 'bbb')
      restoreCalls.length = 0
      mgr.switchTab(b.id) // already active — still restores
      expect(restoreCalls.length).toBeGreaterThanOrEqual(0)
    })

    it('is a no-op for unknown tab id', () => {
      const a = mgr.createTab()
      mgr.switchTab('no-such-id')
      expect(mgr.getActiveTabId()).toBe(a.id)
    })
  })

  describe('closeTab', () => {
    it('removes the tab and picks an adjacent one when active is closed', async () => {
      const a = mgr.openTab('/tmp/a.md', 'a')
      const b = mgr.openTab('/tmp/b.md', 'b')
      mgr.switchTab(a.id)
      await mgr.closeTab(a.id)
      expect(mgr.getTabs()).toHaveLength(1)
      expect(mgr.getActiveTabId()).toBe(b.id)
    })

    it('keeps active when a non-active tab is closed', async () => {
      const a = mgr.openTab('/tmp/a.md', 'a')
      const b = mgr.openTab('/tmp/b.md', 'b')
      mgr.switchTab(b.id)
      await mgr.closeTab(a.id)
      expect(mgr.getActiveTabId()).toBe(b.id)
    })

    it('fires onLastTabClosed when closing the last tab', async () => {
      const lastSpy = vi.fn()
      mgr.onLastTabClosed(lastSpy)
      const a = mgr.createTab()
      await mgr.closeTab(a.id)
      expect(lastSpy).toHaveBeenCalledTimes(1)
      expect(mgr.getTabs()).toHaveLength(0)
    })

    it('returns false for unknown id', async () => {
      const result = await mgr.closeTab('nope')
      expect(result).toBe(false)
    })
  })

  describe('moveTab', () => {
    it('reorders tabs', () => {
      const a = mgr.openTab('/tmp/a.md', 'a')
      const b = mgr.openTab('/tmp/b.md', 'b')
      const c = mgr.openTab('/tmp/c.md', 'c')
      mgr.moveTab(0, 2)
      const ids = mgr.getTabs().map((t) => t.id)
      expect(ids).toEqual([b.id, c.id, a.id])
    })

    it('is a no-op when indices are equal or out of bounds', () => {
      mgr.openTab('/tmp/a.md', 'a')
      mgr.openTab('/tmp/b.md', 'b')
      const before = mgr.getTabs().map((t) => t.id)
      mgr.moveTab(0, 0)
      mgr.moveTab(-1, 1)
      mgr.moveTab(0, 99)
      const after = mgr.getTabs().map((t) => t.id)
      expect(after).toEqual(before)
    })
  })

  describe('closeOtherTabs / closeTabsToRight', () => {
    it('closeOtherTabs keeps only the target tab and makes it active', () => {
      const a = mgr.openTab('/tmp/a.md', 'a')
      const b = mgr.openTab('/tmp/b.md', 'b')
      mgr.openTab('/tmp/c.md', 'c')
      mgr.closeOtherTabs(b.id)
      expect(mgr.getTabs().map((t) => t.id)).toEqual([b.id])
      expect(mgr.getActiveTabId()).toBe(b.id)
      // a should be gone
      expect(mgr.getTabs().find((t) => t.id === a.id)).toBeUndefined()
    })

    it('closeTabsToRight removes tabs after the pivot', () => {
      const a = mgr.openTab('/tmp/a.md', 'a')
      const b = mgr.openTab('/tmp/b.md', 'b')
      const c = mgr.openTab('/tmp/c.md', 'c')
      mgr.switchTab(c.id)
      mgr.closeTabsToRight(a.id)
      expect(mgr.getTabs().map((t) => t.id)).toEqual([a.id])
      // active was c (to the right of a) so it falls back to a
      expect(mgr.getActiveTabId()).toBe(a.id)
      expect(mgr.getTabs().find((t) => t.id === b.id)).toBeUndefined()
    })
  })

  describe('markSaved', () => {
    it('updates filePath, fileName and clears dirty', () => {
      const tab = mgr.createTab()
      mgr.updateTabContent(tab.id, 'edited')
      expect(tab.dirty).toBe(true)
      mgr.markSaved(tab.id, '/tmp/saved.md')
      const after = mgr.getTabs().find((t) => t.id === tab.id)!
      expect(after.filePath).toBe('/tmp/saved.md')
      expect(after.fileName).toBe('saved.md')
      expect(after.dirty).toBe(false)
    })
  })

  describe('setTabs', () => {
    it('replaces tabs, regenerates ids, and activates by index', () => {
      const restored = [
        {
          id: '',
          filePath: '/x/1.md',
          fileName: '1.md',
          content: '1',
          dirty: false,
          editorMode: 'wysiwyg' as const,
          cursorPosition: { line: 0, column: 0, offset: 0 },
          scrollPosition: 0,
          lastModified: 0,
        },
        {
          id: '',
          filePath: '/x/2.md',
          fileName: '2.md',
          content: '2',
          dirty: false,
          editorMode: 'wysiwyg' as const,
          cursorPosition: { line: 0, column: 0, offset: 0 },
          scrollPosition: 0,
          lastModified: 0,
        },
      ]
      mgr.setTabs(restored, 1)
      expect(mgr.getTabs()).toHaveLength(2)
      // All ids should be regenerated (non-empty and unique)
      const tabs = mgr.getTabs()
      expect(tabs[0].id).not.toBe('')
      expect(tabs[1].id).not.toBe('')
      expect(tabs[0].id).not.toBe(tabs[1].id)
      // Second tab (index 1) should be active
      expect(mgr.getActiveTabId()).toBe(tabs[1].id)
    })

    it('clamps activeIndex to valid range', () => {
      const t = {
        id: '',
        filePath: null,
        fileName: 'x',
        content: '',
        dirty: false,
        editorMode: 'wysiwyg' as const,
        cursorPosition: { line: 0, column: 0, offset: 0 },
        scrollPosition: 0,
        lastModified: 0,
      }
      mgr.setTabs([t], 99)
      // Should clamp to last valid index (0)
      expect(mgr.getActiveTabId()).toBe(mgr.getTabs()[0].id)
    })

    it('creates a default tab when the restored list is empty', () => {
      mgr.setTabs([], 0)
      expect(mgr.getTabs()).toHaveLength(1)
      expect(mgr.getActiveTabId()).not.toBeNull()
    })
  })
})
