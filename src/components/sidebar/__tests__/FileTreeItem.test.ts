// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import FileTreeItem from '../FileTreeItem.vue'
import { dialogState, resolveDialogRequest } from '../../../utils/dialog'
import type { FileTreeNode } from '../../../stores/file/types'

function makeDir(path: string, name: string, children: FileTreeNode[] = []): FileTreeNode {
  return { name, path, isDirectory: true, isExpanded: true, isLoading: false, children }
}

function makeFile(path: string, name: string): FileTreeNode {
  return { name, path, isDirectory: false, isExpanded: false, isLoading: false, children: [] }
}

async function dispatchDrag(wrapper: ReturnType<typeof mount>, path: string, type: string): Promise<void> {
  const el = wrapper.find(`[data-file-path="${path}"]`)
  el.element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
  await nextTick()
}

describe('FileTreeItem drag & drop', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountTree(onDropToFolder: ReturnType<typeof vi.fn> = vi.fn()) {
    const dragState = reactive<{ sourcePath: string | null; hoverPath: string | null }>({
      sourcePath: 'C:/docs/X.md',
      hoverPath: null
    })
    const wrapper = mount(FileTreeItem, {
      props: {
        node: makeDir('C:/docs/A', 'A', [
          makeFile('C:/docs/A/A-1.md', 'A-1.md'),
          makeDir('C:/docs/A/B', 'B')
        ])
      },
      global: {
        plugins: [createPinia()],
        provide: {
          fileTreeDragState: dragState,
          fileTreeOnDropToFolder: onDropToFolder
        }
      }
    })
    return { wrapper, dragState, onDropToFolder }
  }

  it('bubbles a drop on a child FILE up to the parent directory', async () => {
    const { wrapper, onDropToFolder } = mountTree()
    await dispatchDrag(wrapper, 'C:/docs/A/A-1.md', 'drop')
    expect(onDropToFolder).toHaveBeenCalledWith('C:/docs/A')
  })

  it('handles a drop directly on the directory row', async () => {
    const { wrapper, onDropToFolder } = mountTree()
    await dispatchDrag(wrapper, 'C:/docs/A', 'drop')
    expect(onDropToFolder).toHaveBeenCalledWith('C:/docs/A')
  })

  it('handles a drop on the expanded children area (tree-children node)', async () => {
    const { wrapper, onDropToFolder } = mountTree()
    const childrenArea = wrapper.find('.tree-children')
    expect(childrenArea.exists()).toBe(true)
    childrenArea.element.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }))
    expect(onDropToFolder).toHaveBeenCalledWith('C:/docs/A')
  })

  it('highlights a directory when dragging over its children area', async () => {
    const { wrapper } = mountTree()
    await dispatchDrag(wrapper, 'C:/docs/A/A-1.md', 'dragover')
    expect(wrapper.find('[data-file-path="C:/docs/A"]').classes()).toContain('is-drag-over')
  })

  it('stops dragover propagation so only the innermost directory is highlighted', async () => {
    const { wrapper } = mountTree()
    await dispatchDrag(wrapper, 'C:/docs/A/B', 'dragover')
    expect(wrapper.find('[data-file-path="C:/docs/A/B"]').classes()).toContain('is-drag-over')
    expect(wrapper.find('[data-file-path="C:/docs/A"]').classes()).not.toContain('is-drag-over')
  })

  it('only highlights the innermost directory, never its ancestors', async () => {
    const node = makeDir('C:/R', 'R', [makeDir('C:/R/A', 'A', [makeDir('C:/R/A/B', 'B')])])
    const dragState = reactive<{ sourcePath: string | null; hoverPath: string | null }>({
      sourcePath: 'C:/X.md',
      hoverPath: null
    })
    const onDropToFolder = vi.fn()
    const wrapper = mount(FileTreeItem, {
      props: { node },
      global: {
        plugins: [createPinia()],
        provide: {
          fileTreeDragState: dragState,
          fileTreeOnDropToFolder: onDropToFolder
        }
      }
    })
    await dispatchDrag(wrapper, 'C:/R/A/B', 'dragover')
    expect(wrapper.find('[data-file-path="C:/R/A/B"]').classes()).toContain('is-drag-over')
    expect(wrapper.find('[data-file-path="C:/R/A"]').classes()).not.toContain('is-drag-over')
    expect(wrapper.find('[data-file-path="C:/R"]').classes()).not.toContain('is-drag-over')
  })

  it('does not move when dropping onto the source parent directory (no-op)', async () => {
    const { wrapper, dragState, onDropToFolder } = mountTree()
    dragState.sourcePath = 'C:/docs/A/A-1.md'
    await dispatchDrag(wrapper, 'C:/docs/A', 'drop')
    expect(onDropToFolder).not.toHaveBeenCalled()
  })
})

describe('FileTreeItem click unsupported file', () => {
  const originalElectronAPI = (window as { electronAPI?: unknown }).electronAPI

  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    if (dialogState.visible) resolveDialogRequest(0)
    ;(window as { electronAPI?: unknown }).electronAPI = originalElectronAPI
  })

  function mountFileNode(node: FileTreeNode) {
    return mount(FileTreeItem, {
      props: { node },
      global: { plugins: [createPinia()] }
    })
  }

  function stubElectronAPI(electronAPI: unknown): void {
    ;(window as { electronAPI?: unknown }).electronAPI = electronAPI
  }

  it('shows a dialog when clicking a file the app cannot open', async () => {
    stubElectronAPI({
      openFile: vi.fn(async () => ({ success: false, error: '二进制文件无法在编辑器中打开' }))
    })

    const wrapper = mountFileNode(makeFile('C:/docs/app.exe', 'app.exe'))
    await wrapper.find('[data-file-path="C:/docs/app.exe"]').trigger('click')
    await nextTick()

    expect(dialogState.visible).toBe(true)
    expect(dialogState.title).toBe('无法打开文件')
    expect(dialogState.message).toBe('暂不支持 EXE 类型文件打开')
  })

  it('does not show a dialog for a normal successful open', async () => {
    stubElectronAPI({
      openFile: vi.fn(async () => ({
        success: true,
        data: {
          document: { metadata: { title: 'x' }, content: { text: '', assets: { images: [] } } },
          filePath: 'C:/docs/a.md',
          format: 'markdown',
          isNew: false
        }
      }))
    })

    const wrapper = mountFileNode(makeFile('C:/docs/a.md', 'a.md'))
    await wrapper.find('[data-file-path="C:/docs/a.md"]').trigger('click')
    await nextTick()

    expect(dialogState.visible).toBe(false)
  })

  it('does not show a dialog when clicking a directory', async () => {
    const wrapper = mountFileNode(makeDir('C:/docs/A', 'A'))
    await wrapper.find('[data-file-path="C:/docs/A"]').trigger('click')
    await nextTick()

    expect(dialogState.visible).toBe(false)
  })
})
