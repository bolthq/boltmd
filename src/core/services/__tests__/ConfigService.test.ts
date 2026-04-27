import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the Tauri core bridge. invokeMock is reassignable per-test so we can
// control what `read_config` returns and observe `write_config` payloads.
const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

// Import after the mock is registered. We re-import inside beforeEach to get
// a fresh singleton for every test.
async function freshModule() {
  vi.resetModules()
  return await import('../ConfigService')
}

describe('ConfigService', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('load', () => {
    it('merges Rust-provided fields over DEFAULT_CONFIG', async () => {
      invokeMock.mockResolvedValueOnce({
        theme: 'dark',
        fontSize: 18,
        configVersion: 1,
      })
      const { configService } = await freshModule()
      await configService.load()
      expect(configService.get('theme')).toBe('dark')
      expect(configService.get('fontSize')).toBe(18)
      // Untouched field stays on its default value
      expect(configService.get('wordWrap')).toBe(true)
    })

    it('falls back to DEFAULT_CONFIG when invoke fails', async () => {
      invokeMock.mockRejectedValueOnce(new Error('ipc boom'))
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { configService } = await freshModule()
      await configService.load()
      expect(configService.get('theme')).toBe('light')
      expect(configService.get('language')).toBe('en')
      warn.mockRestore()
    })

    it('falls back to DEFAULT_CONFIG when the returned value is not an object', async () => {
      invokeMock.mockResolvedValueOnce(null)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { configService } = await freshModule()
      await configService.load()
      expect(configService.get('fontSize')).toBe(15)
      warn.mockRestore()
    })

    it('keeps configVersion stable when the loaded config is already current', async () => {
      invokeMock.mockResolvedValueOnce({ theme: 'dark' }) // configVersion missing, filled by DEFAULT_CONFIG
      const { configService } = await freshModule()
      await configService.load()
      expect(configService.get('configVersion')).toBe(1)
      // Since merged version equals CONFIG_VERSION, migrate should not persist.
      expect(invokeMock).toHaveBeenCalledTimes(1)
      expect(invokeMock).toHaveBeenCalledWith('read_config')
    })
  })

  describe('get / getAll', () => {
    it('get returns the value for a key', async () => {
      invokeMock.mockResolvedValueOnce({ fontSize: 20, configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()
      expect(configService.get('fontSize')).toBe(20)
    })

    it('getAll returns a clone so callers cannot mutate internal state', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()
      const snap = configService.getAll()
      snap.fontSize = 999
      expect(configService.get('fontSize')).not.toBe(999)
    })
  })

  describe('set', () => {
    it('updates the value synchronously and debounces persist', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()
      invokeMock.mockClear()
      invokeMock.mockResolvedValue(undefined)

      await configService.set('theme', 'dark')
      expect(configService.get('theme')).toBe('dark')
      // persist has not fired yet
      expect(invokeMock).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      expect(invokeMock).toHaveBeenCalledTimes(1)
      expect(invokeMock).toHaveBeenCalledWith(
        'write_config',
        expect.objectContaining({ config: expect.objectContaining({ theme: 'dark' }) }),
      )
    })

    it('coalesces multiple rapid sets into a single persist', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()
      invokeMock.mockClear()
      invokeMock.mockResolvedValue(undefined)

      await configService.set('fontSize', 16)
      vi.advanceTimersByTime(200)
      await configService.set('fontSize', 17)
      vi.advanceTimersByTime(200)
      await configService.set('fontSize', 18)
      // Still within debounce window of the latest set
      expect(invokeMock).not.toHaveBeenCalled()
      vi.advanceTimersByTime(500)
      expect(invokeMock).toHaveBeenCalledTimes(1)
      const call = invokeMock.mock.calls[0]
      expect(call[1].config.fontSize).toBe(18)
    })
  })

  describe('onChange', () => {
    it('invokes registered handlers on set', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()

      const handler = vi.fn()
      configService.onChange('theme', handler)
      await configService.set('theme', 'dark')
      expect(handler).toHaveBeenCalledWith('dark')
    })

    it('does not fire handlers for unrelated keys', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()

      const themeHandler = vi.fn()
      const fontHandler = vi.fn()
      configService.onChange('theme', themeHandler)
      configService.onChange('fontSize', fontHandler)
      await configService.set('fontSize', 19)
      expect(fontHandler).toHaveBeenCalledWith(19)
      expect(themeHandler).not.toHaveBeenCalled()
    })

    it('supports multiple handlers per key', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { configService } = await freshModule()
      await configService.load()

      const h1 = vi.fn()
      const h2 = vi.fn()
      configService.onChange('language', h1)
      configService.onChange('language', h2)
      await configService.set('language', 'zh-CN')
      expect(h1).toHaveBeenCalledWith('zh-CN')
      expect(h2).toHaveBeenCalledWith('zh-CN')
    })
  })

  describe('initConfig', () => {
    it('calls load() on the singleton', async () => {
      invokeMock.mockResolvedValueOnce({ configVersion: 1 })
      const { initConfig, configService } = await freshModule()
      const spy = vi.spyOn(configService, 'get')
      await initConfig()
      expect(configService.get('configVersion')).toBe(1)
      spy.mockRestore()
    })
  })
})
