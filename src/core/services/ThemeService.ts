import type { ThemeName } from '../types/config'
import { configService } from './ConfigService'
import { eventBus } from '../events/EventBus'
import { AppEvent } from '../events/events'

export interface IThemeService {
  getCurrentTheme(): ThemeName
  setTheme(theme: ThemeName): void
  followSystem(): void
}

/** 解析实际应用的主题（system → light/dark） */
function resolveTheme(theme: ThemeName): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

/** 将主题应用到 DOM */
function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

class ThemeServiceImpl implements IThemeService {
  private currentTheme: ThemeName = 'light'
  private mediaQuery: MediaQueryList | null = null
  private mediaHandler: ((e: MediaQueryListEvent) => void) | null = null

  /** 初始化：从配置读取主题并应用 */
  init(): void {
    this.currentTheme = configService.get('theme')
    applyTheme(resolveTheme(this.currentTheme))

    // 如果是 system 模式，开始监听系统主题变化
    if (this.currentTheme === 'system') {
      this.startSystemWatch()
    }
  }

  getCurrentTheme(): ThemeName {
    return this.currentTheme
  }

  setTheme(theme: ThemeName): void {
    // 停止旧的系统监听
    this.stopSystemWatch()

    this.currentTheme = theme
    const resolved = resolveTheme(theme)
    applyTheme(resolved)

    // 持久化
    configService.set('theme', theme)

    // 广播事件（传递实际应用的 light/dark）
    eventBus.emit(AppEvent.ThemeChange, resolved)

    // 如果是 system 模式，开始监听
    if (theme === 'system') {
      this.startSystemWatch()
    }
  }

  followSystem(): void {
    this.setTheme('system')
  }

  /** 获取当前解析后的主题（light/dark） */
  getResolvedTheme(): 'light' | 'dark' {
    return resolveTheme(this.currentTheme)
  }

  private startSystemWatch(): void {
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.mediaHandler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? 'dark' : 'light'
      applyTheme(resolved)
      eventBus.emit(AppEvent.ThemeChange, resolved)
    }
    this.mediaQuery.addEventListener('change', this.mediaHandler)
  }

  private stopSystemWatch(): void {
    if (this.mediaQuery && this.mediaHandler) {
      this.mediaQuery.removeEventListener('change', this.mediaHandler)
      this.mediaQuery = null
      this.mediaHandler = null
    }
  }
}

export const themeService = new ThemeServiceImpl()
