import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useThemeStore } from '../theme'

describe('theme DOM synchronization', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('document', {
      documentElement: { dataset: {} }
    })
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: false,
        addEventListener: vi.fn()
      }),
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn()
      }
    })
  })

  it('applies the initialized theme to the document root', () => {
    const store = useThemeStore()

    store.initTheme()

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('updates the document root when the theme changes', () => {
    const store = useThemeStore()
    store.initTheme()

    store.setTheme('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
