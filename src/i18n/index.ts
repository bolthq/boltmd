import { createI18n, type I18n } from 'vue-i18n'
import en from './locales/en'
import zhCN from './locales/zh-CN'
import { configService } from '../core/services/ConfigService'

export type SupportedLocale = 'en' | 'zh-CN'

export const SUPPORTED_LOCALES: { value: SupportedLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let i18n: I18n<any, any, any, string, false>

/** 创建 i18n 实例（需在 initConfig 之后调用） */
export function setupI18n() {
  i18n = createI18n({
    legacy: false,
    locale: configService.get('language') || 'en',
    fallbackLocale: 'en',
    messages: {
      en,
      'zh-CN': zhCN,
    },
  })
  return i18n
}

/** 切换语言并持久化 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  ;(i18n.global.locale as unknown as { value: string }).value = locale
  await configService.set('language', locale)
}

/** 获取当前语言 */
export function getLocale(): SupportedLocale {
  return (i18n.global.locale as unknown as { value: string }).value as SupportedLocale
}

/** 在非组件上下文中使用翻译 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function t(key: string, params?: Record<string, any>): string {
  return i18n.global.t(key, params ?? {})
}
