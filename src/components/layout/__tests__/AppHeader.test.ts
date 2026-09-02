// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AppHeader from '../AppHeader.vue'
import { useFileStore } from '../../../stores/file'
import { dialogState, resolveDialogRequest } from '../../../utils/dialog'

function mountHeader() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AppHeader, {
    global: {
      plugins: [pinia],
      stubs: { SyncPanel: true }
    }
  })
}

describe('AppHeader 插入对话框事件', () => {
  it('响应 editor:showLinkDialog 打开插入链接对话框', async () => {
    const wrapper = mountHeader()
    window.dispatchEvent(new Event('editor:showLinkDialog'))
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('插入链接')
    expect(document.body.querySelectorAll('.insert-dialog').length).toBeGreaterThan(0)
  })

  it('响应 editor:showImageDialog 打开插入图片对话框', async () => {
    const wrapper = mountHeader()
    window.dispatchEvent(new Event('editor:showImageDialog'))
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('插入图片')
    expect(document.body.querySelectorAll('.insert-dialog').length).toBeGreaterThan(0)
  })
})

describe('AppHeader 快速打开（Ctrl+P）', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    ;(window as { electronAPI?: unknown }).electronAPI = originalElectronAPI
    document.body.innerHTML = ''
    if (dialogState.visible) resolveDialogRequest(0)
  })

  it('Ctrl+P 打开快速打开面板并列出文件', async () => {
    ;(window as { electronAPI?: unknown }).electronAPI = {
      searchFiles: vi.fn(async () => ({
        success: true,
        data: [{ name: 'a.md', path: 'C:/ws/a.md' }]
      })),
      windowIsMaximized: vi.fn(async () => false),
      getVersion: vi.fn(async () => 'test'),
      onWindowMaximized: vi.fn(() => () => {}),
      onWindowUnmaximized: vi.fn(() => () => {})
    }
    const wrapper = mountHeader()
    const fileStore = useFileStore()
    fileStore.openedFolderPath = 'C:/ws'
    await wrapper.vm.$nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect((window.electronAPI as { searchFiles: ReturnType<typeof vi.fn> }).searchFiles).toHaveBeenCalledWith('C:/ws')
    expect(document.body.querySelectorAll('.quick-open-item').length).toBe(1)
  })

  it('未打开文件夹时 Ctrl+P 弹出提示', async () => {
    ;(window as { electronAPI?: unknown }).electronAPI = {
      searchFiles: vi.fn(),
      windowIsMaximized: vi.fn(async () => false),
      getVersion: vi.fn(async () => 'test'),
      onWindowMaximized: vi.fn(() => () => {}),
      onWindowUnmaximized: vi.fn(() => () => {})
    }
    const wrapper = mountHeader()
    await wrapper.vm.$nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(dialogState.visible).toBe(true)
    expect(dialogState.message).toContain('请先打开文件夹')
  })

  it('响应 markdown-plus:quick-open 事件打开面板', async () => {
    ;(window as { electronAPI?: unknown }).electronAPI = {
      searchFiles: vi.fn(async () => ({
        success: true,
        data: [{ name: 'a.md', path: 'C:/ws/a.md' }]
      })),
      windowIsMaximized: vi.fn(async () => false),
      getVersion: vi.fn(async () => 'test'),
      onWindowMaximized: vi.fn(() => () => {}),
      onWindowUnmaximized: vi.fn(() => () => {})
    }
    const wrapper = mountHeader()
    const fileStore = useFileStore()
    fileStore.openedFolderPath = 'C:/ws'
    await wrapper.vm.$nextTick()

    window.dispatchEvent(new Event('markdown-plus:quick-open'))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect((window.electronAPI as { searchFiles: ReturnType<typeof vi.fn> }).searchFiles).toHaveBeenCalledWith('C:/ws')
    expect(document.body.querySelectorAll('.quick-open-item').length).toBe(1)
  })
})
