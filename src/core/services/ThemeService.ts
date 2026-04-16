import type { ThemeName } from '../types/config'

export interface IThemeService {
  getCurrentTheme(): ThemeName
  setTheme(theme: ThemeName): void
  followSystem(): void
}
