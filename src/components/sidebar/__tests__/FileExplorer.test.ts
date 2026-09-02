// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import FileExplorer from '../FileExplorer.vue'
import { useFileStore } from '../../../stores/file'
import type { FileTreeNode } from '../../../stores/file/types'

function makeDir(path: string, name: string, children: FileTreeNode[] = []): FileTreeNode {
  return { name, path, isDirectory: true, isExpanded: true, isLoading: false, children }
}

function makeFile(path: string, name: string): FileTreeNode {
  return { name, path, isDirectory: false, isExpanded: false, isLoading: false, children: [] }
}

describe('FileExplorer 空白区右键菜单', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountExplorer() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const fileStore = useFileStore()
    fileStore.openedFolderPath = 'C:/ws'
    fileStore.fileTree = [makeDir('C:/ws', 'ws', [makeFile('C:/ws/a.md', 'a.md')])]
    return mount(FileExplorer, {
      global: { plugins: [pinia] }
    })
  }

  async function openEmptyAreaMenu(wrapper: ReturnType<typeof mount>): Promise<void> {
    await wrapper.find('.file-list').trigger('contextmenu', { clientX: 10, clientY: 10 })
    await nextTick()
  }

  it('offers a quick-open entry that dispatches the global event', async () => {
    const wrapper = mountExplorer()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    await openEmptyAreaMenu(wrapper)

    const items = Array.from(document.body.querySelectorAll('.context-menu-item'))
    const entry = items.find((el) => el.textContent?.trim() === '快速打开文件')
    expect(entry).toBeTruthy()

    entry!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    const dispatched = dispatchSpy.mock.calls.map((call) => (call[0] as Event).type)
    expect(dispatched).toContain('markdown-plus:quick-open')
  })

  it('does not offer quick-open when no folder is opened', async () => {
    const fileStore = useFileStore()
    fileStore.openedFolderPath = null
    fileStore.fileTree = []
    const wrapper = mount(FileExplorer, {
      global: { plugins: [createPinia()] }
    })
    await openEmptyAreaMenu(wrapper)

    const items = Array.from(document.body.querySelectorAll('.context-menu-item'))
    expect(items.some((el) => el.textContent?.trim() === '快速打开文件')).toBe(false)
  })
})
