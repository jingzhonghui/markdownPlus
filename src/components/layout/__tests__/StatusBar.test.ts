// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StatusBar from '../StatusBar.vue'
import { useFileStore } from '../../../stores/file'
import { createMdxDocument } from '../../../types/mdx'

describe('StatusBar 文档统计', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    window.electronAPI = originalElectronAPI
    document.body.innerHTML = ''
  })

  it('不显示文件名，打开文件后显示正确字数', async () => {
    setActivePinia(createPinia())
    window.electronAPI = {
      openFile: vi.fn(async (filePath: string) => ({
        success: true,
        data: {
          document: createMdxDocument('Note', '# heading\n\nbody'),
          filePath,
          format: 'markdown'
        }
      })),
      getVersion: vi.fn(async () => 'test')
    } as unknown as typeof window.electronAPI

    const store = useFileStore()
    await store.openFile('C:/ws/note.md')
    const wrapper = mount(StatusBar)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('note.md')
    expect(wrapper.text()).toContain('字数: 12')
  })
})
