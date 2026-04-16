import type { AppConfig } from '../types/config'

export interface IConfigService {
  get<K extends keyof AppConfig>(key: K): AppConfig[K]
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>
  getAll(): AppConfig
  onChange<K extends keyof AppConfig>(key: K, handler: (value: AppConfig[K]) => void): void
}
