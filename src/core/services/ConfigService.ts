import { invoke } from '@tauri-apps/api/core'
import type { AppConfig } from '../types/config'
import { DEFAULT_CONFIG, CONFIG_VERSION } from '../types/config'

export interface IConfigService {
  get<K extends keyof AppConfig>(key: K): AppConfig[K]
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>
  getAll(): AppConfig
  onChange<K extends keyof AppConfig>(key: K, handler: (value: AppConfig[K]) => void): void
}

type ChangeHandlers = {
  [K in keyof AppConfig]?: Array<(value: AppConfig[K]) => void>
}

class ConfigServiceImpl implements IConfigService {
  private config: AppConfig = { ...DEFAULT_CONFIG }
  private handlers: ChangeHandlers = {}
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private readonly DEBOUNCE_MS = 500

  /** 从 Rust 加载配置（应用启动时调用一次） */
  async load(): Promise<void> {
    try {
      const raw = await invoke<Record<string, unknown>>('read_config')
      // 基础类型验证：必须是对象
      if (!raw || typeof raw !== 'object') {
        throw new Error('Config is not a valid object')
      }
      // 合并：以 DEFAULT_CONFIG 为基础，覆盖 Rust 返回的字段
      this.config = { ...DEFAULT_CONFIG, ...(raw as Partial<AppConfig>) }
      // 版本迁移
      this.migrate()
    } catch (e) {
      console.warn('[ConfigService] Failed to load config, using defaults:', e)
      this.config = { ...DEFAULT_CONFIG }
    }
  }

  /** 配置版本迁移 */
  private migrate(): void {
    const version = this.config.configVersion ?? 0

    // 无版本号的旧配置 → v1：补全新字段（已由 DEFAULT_CONFIG spread 处理）
    if (version < 1) {
      // 未来版本迁移逻辑放这里
      // e.g. if (version < 2) { migrate v1 → v2 }
    }

    // 更新到当前版本
    if (version !== CONFIG_VERSION) {
      this.config.configVersion = CONFIG_VERSION
      this.persist()
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  getAll(): AppConfig {
    return { ...this.config }
  }

  async set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    this.config[key] = value

    // 通知监听者
    const list = this.handlers[key] as Array<(v: AppConfig[K]) => void> | undefined
    list?.forEach((fn) => fn(value))

    // 防抖保存
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.persist()
      this.saveTimer = null
    }, this.DEBOUNCE_MS)
  }

  onChange<K extends keyof AppConfig>(key: K, handler: (value: AppConfig[K]) => void): void {
    if (!this.handlers[key]) {
      this.handlers[key] = [] as ChangeHandlers[K]
    }
    ;(this.handlers[key] as Array<(v: AppConfig[K]) => void>).push(handler)
  }

  private persist(): void {
    invoke('write_config', { config: this.config }).catch((e) => {
      console.error('[ConfigService] Failed to persist config:', e)
    })
  }
}

export const configService = new ConfigServiceImpl()

/** 应用启动时调用，完成配置初始化 */
export async function initConfig(): Promise<void> {
  await configService.load()
}
