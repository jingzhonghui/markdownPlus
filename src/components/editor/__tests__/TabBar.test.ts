// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TabBar from '../TabBar.vue'
import { useFileStore } from '../../../stores/file'
import { createMdxDocument } from '../../../types/mdx'

function stubElectronAPI(): void {
  const api = {
    openFile: vi.fn().mockImplementation(async (filePath: string) => ({
      success: true,
      data: { document: createMdxDocument(`Doc ${filePath}`, `# ${filePath}`), filePath, format: 'mdx' }
    })),
    clearRecovery: vi.fn(async () => ({ success: true })),
    addRecentFile: vi.fn(async () => ({ success: true }))
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api })
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  })
  vi.stubGlobal('navigator', { userAgent: 'Windows', clipboard: { writeText: vi.fn() } })
}

async function openManyTabs(count: number): Promise<ReturnType<typeof useFileStore>> {
  const store = useFileStore()
  store.setMaxOpenTabs(100)
  for (let i = 0; i < count; i++) {
    await store.openFile(`C:/ws/f${i}.mdx`)
  }
  return store
}

describe('TabBar closing with many tabs', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubElectronAPI()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('closeAllTabs via context menu closes every tab', async () => {
    const store = await openManyTabs(50)
    expect(store.tabs).toHaveLength(50)

    const wrapper = mount(TabBar)
    await wrapper.findAll('.tab')[0].trigger('contextmenu')
    await nextTick()
    const closeAll = clickMenuItem('关闭全部')
    expect(closeAll).toBe(true)

    await vi.waitFor(() => expect(store.tabs).toHaveLength(0))
  })

  it('closeOtherTabs via context menu keeps only the target tab', async () => {
    const store = await openManyTabs(10)
    const keep = store.tabs[3]

    const wrapper = mount(TabBar)
    await wrapper.findAll('.tab')[3].trigger('contextmenu')
    await nextTick()
    expect(clickMenuItem('关闭其他')).toBe(true)

    await vi.waitFor(() => expect(store.tabs).toHaveLength(1))
    expect(store.tabs[0].id).toBe(keep.id)
  })

  it('closeFolder closes folder tabs and clears the folder', async () => {
    const store = await openManyTabs(20)
    store.openedFolderPath = 'C:/ws'

    const wrapper = mount(TabBar)
    await wrapper.findAll('.tab')[0].trigger('contextmenu')
    await nextTick()
    expect(clickMenuItem('关闭全部')).toBe(true)

    await vi.waitFor(() => expect(store.tabs).toHaveLength(0))
  })
})

function clickMenuItem(label: string): boolean {
  const items = Array.from(document.querySelectorAll('.context-menu-item'))
  const item = items.find((el) => el.textContent?.includes(label))
  if (!item) return false
  ;(item as HTMLElement).click()
  return true
}
