import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export type ThemeType = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: ThemeType
  followSystem: boolean
}

const THEME_STORAGE_KEY = 'markdown-plus-theme'

/**
 * 主题状态管理 Store
 */
export const useThemeStore = defineStore('theme', () => {
  // State
  const theme = ref<ThemeType>('system')
  const followSystem = ref(true)

  // Getters
  const currentTheme = computed(() => {
    if (followSystem.value || theme.value === 'system') {
      return getSystemTheme()
    }
    return theme.value
  })

  const isDark = computed(() => currentTheme.value === 'dark')
  const isLight = computed(() => currentTheme.value === 'light')

  // Actions
  /**
   * 获取系统主题偏好
   */
  function getSystemTheme(): 'light' | 'dark' {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }

  /**
   * 设置主题
   */
  function setTheme(newTheme: ThemeType): void {
    theme.value = newTheme
    followSystem.value = newTheme === 'system'
    saveTheme()
  }

  /**
   * 切换浅色/深色主题
   */
  function toggleTheme(): void {
    if (currentTheme.value === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  /**
   * 从 localStorage 加载主题设置
   */
  function loadTheme(): void {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY)
      if (saved) {
        const parsed: ThemeState = JSON.parse(saved)
        theme.value = parsed.theme
        followSystem.value = parsed.followSystem
      }
    } catch {
      // 忽略解析错误
    }
  }

  /**
   * 保存主题设置到 localStorage
   */
  function saveTheme(): void {
    try {
      const state: ThemeState = {
        theme: theme.value,
        followSystem: followSystem.value
      }
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 忽略存储错误
    }
  }

  /**
   * 初始化主题
   */
  function initTheme(): void {
    loadTheme()
    // 监听系统主题变化
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        if (followSystem.value) {
          // 触发响应式更新
          theme.value = theme.value
        }
      })
    }
  }

  return {
    theme,
    followSystem,
    currentTheme,
    isDark,
    isLight,
    setTheme,
    toggleTheme,
    initTheme
  }
})
