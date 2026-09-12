import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileStore } from '../file'
import type { FileTreeNode } from '../file/types'

function mockTree(): void {
  const electronAPI = {
    readFolder: vi.fn(async (dirPath: string) => {
      if (dirPath === 'C:/docs') {
        return {
          success: true,
          data: [
            { name: 'A', path: 'C:/docs/A', isDirectory: true },
            { name: 'a.md', path: 'C:/docs/a.md', isDirectory: false },
            { name: 'b.md', path: 'C:/docs/b.md', isDirectory: false }
          ]
        }
      }
      if (dirPath === 'C:/docs/A') {
        return {
          success: true,
          data: [{ name: 'x.md', path: 'C:/docs/A/x.md', isDirectory: false }]
        }
      }
      return { success: false }
    }),
    getRecentFiles: vi.fn(async () => ({ success: true, data: [] })),
    addRecentFile: vi.fn(async () => ({ success: true })),
    authorizeWorkspaceRoot: vi.fn(async () => ({ success: true }))
  }
  vi.stubGlobal('window', { electronAPI })
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  })
  vi.stubGlobal('navigator', { userAgent: 'Windows', clipboard: { writeText: vi.fn() } })
}

describe('file store selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockTree()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('selects a single node and clears others', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    store.selectOnly('C:/docs/b.md')
    expect(store.selectedPaths).toEqual(['C:/docs/b.md'])
    expect(store.isSelected('C:/docs/a.md')).toBe(false)
  })

  it('toggles nodes with ctrl-click semantics', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    store.toggleSelected('C:/docs/b.md')
    expect(store.selectedPaths).toEqual(['C:/docs/a.md', 'C:/docs/b.md'])
    store.toggleSelected('C:/docs/a.md')
    expect(store.selectedPaths).toEqual(['C:/docs/b.md'])
  })

  it('range-selects visible nodes from the anchor', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/A')
    store.selectRange('C:/docs/b.md')
    expect(store.selectedPaths).toEqual(['C:/docs/A', 'C:/docs/a.md', 'C:/docs/b.md'])
  })

  it('selects all visible nodes including expanded children', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    const nodeA = store.fileTree[0].children.find((c: FileTreeNode) => c.path === 'C:/docs/A')!
    await store.expandNode(nodeA)
    store.selectAllVisible()
    expect(store.selectedPaths).toContain('C:/docs/A/x.md')
  })

  it('selects all visible nodes under the root but excludes the opened root folder', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    const nodeA = store.fileTree[0].children.find((c: FileTreeNode) => c.path === 'C:/docs/A')!
    await store.expandNode(nodeA)
    store.selectAllVisible()
    expect(store.selectedPaths).not.toContain('C:/docs')
    expect(store.selectedPaths).toContain('C:/docs/A')
    expect(store.selectedPaths).toContain('C:/docs/A/x.md')
  })

  it('clears the selection', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    store.clearSelection()
    expect(store.selectedPaths).toEqual([])
  })

  it('clears the selection when switching to a different folder', async () => {
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.openFolderPath('C:/docs/A')
    expect(store.selectedPaths).toEqual([])
  })
})
