import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileStore } from '../file'
import type { FileTreeNode } from '../file/types'

function setupElectronAPI(overrides: Record<string, unknown> = {}) {
  const api = {
    openFile: vi.fn(),
    readFolder: vi.fn(async (dirPath: string) => {
      if (dirPath === 'C:/docs') {
        return {
          success: true,
          data: [
            { name: 'A', path: 'C:/docs/A', isDirectory: true },
            { name: 'a.md', path: 'C:/docs/a.md', isDirectory: false }
          ]
        }
      }
      if (dirPath === 'C:/docs/A') {
        return { success: true, data: [{ name: 'x.md', path: 'C:/docs/A/x.md', isDirectory: false }] }
      }
      return { success: false }
    }),
    getRecentFiles: vi.fn(async () => ({ success: true, data: [] })),
    addRecentFile: vi.fn(async () => ({ success: true })),
    authorizeWorkspaceRoot: vi.fn(async () => ({ success: true })),
    readClipboardFilePaths: vi.fn(async () => ({ success: true, data: [] })),
    writeClipboardFilePaths: vi.fn(async () => ({ success: true })),
    copyIntoFolder: vi.fn(async () => ({ success: true, data: { items: [], failed: [] } })),
    ...overrides
  } as unknown as Record<string, ReturnType<typeof vi.fn>>
  vi.stubGlobal('window', { electronAPI: api })
  return api
}

describe('file store clipboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
    vi.stubGlobal('navigator', { userAgent: 'Windows', clipboard: { writeText: vi.fn() } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('resolves a folder selection to itself and a file selection to its parent', async () => {
    setupElectronAPI()
    const store = useFileStore()
    await store.openFolderPath('C:/docs')

    store.selectOnly('C:/docs/A')
    expect(store.resolvePasteTargetDir()).toBe('C:/docs/A')

    store.selectOnly('C:/docs/a.md')
    expect(store.resolvePasteTargetDir()).toBe('C:/docs')
  })

  it('falls back to the opened folder when nothing is selected', async () => {
    setupElectronAPI()
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.clearSelection()
    expect(store.resolvePasteTargetDir()).toBe('C:/docs')
  })

  it('copies the selection to the system clipboard', async () => {
    const api = setupElectronAPI()
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')

    const ok = await store.copySelection('copy')

    expect(ok).toBe(true)
    expect(store.clipboardFiles).toEqual({ paths: ['C:/docs/a.md'], mode: 'copy' })
    expect(api.writeClipboardFilePaths).toHaveBeenCalledWith(['C:/docs/a.md'], 'copy')
  })

  it('pastes the internal clipboard into the resolved target', async () => {
    const api = setupElectronAPI()
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('copy')
    store.selectOnly('C:/docs/A')

    const ok = await store.pasteIntoSelection()

    expect(ok).toBe(true)
    expect(api.copyIntoFolder).toHaveBeenCalledWith(['C:/docs/a.md'], 'C:/docs/A', 'copy')
  })

  it('pastes system clipboard files as copy when the internal clipboard is empty', async () => {
    const api = setupElectronAPI({
      readClipboardFilePaths: vi.fn(async () => ({ success: true, data: ['C:/external/note.md'] }))
    })
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/A')

    const ok = await store.pasteIntoSelection()

    expect(ok).toBe(true)
    expect(api.copyIntoFolder).toHaveBeenCalledWith(['C:/external/note.md'], 'C:/docs/A', 'copy')
  })

  it('dedupes descendants of a selected folder when copying all visible nodes', async () => {
    setupElectronAPI()
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    const nodeA = store.fileTree[0].children.find((c: FileTreeNode) => c.path === 'C:/docs/A')!
    await store.expandNode(nodeA)

    store.selectAllVisible()
    await store.copySelection('copy')

    expect(store.clipboardFiles?.paths).not.toContain('C:/docs/A/x.md')
    expect(store.clipboardFiles?.paths).toContain('C:/docs/A')
  })

  it('pastes into an explicit target directory', async () => {
    const api = setupElectronAPI()
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('copy')

    const ok = await store.pasteInto('C:/docs/A')

    expect(ok).toBe(true)
    expect(api.copyIntoFolder).toHaveBeenCalledWith(['C:/docs/a.md'], 'C:/docs/A', 'copy')
  })

  it('passes a plain cloneable sources array to copyIntoFolder when pasting the internal clipboard', async () => {
    let cloneError: unknown = null
    const api = setupElectronAPI({
      copyIntoFolder: vi.fn(async (sources: string[]) => {
        try {
          structuredClone(sources)
        } catch (error) {
          cloneError = error
        }
        return { success: true, data: { items: [], failed: [] } }
      })
    })
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('copy')

    await store.pasteInto('C:/docs/A')

    expect(cloneError).toBeNull()
    expect(api.copyIntoFolder).toHaveBeenCalled()
  })

  it('prefers the system clipboard when it differs from the internal clipboard', async () => {
    const api = setupElectronAPI({
      readClipboardFilePaths: vi.fn(async () => ({ success: true, data: ['C:/external/note.md'] }))
    })
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('copy')

    const ok = await store.pasteInto('C:/docs/A')

    expect(ok).toBe(true)
    expect(api.copyIntoFolder).toHaveBeenCalledWith(['C:/external/note.md'], 'C:/docs/A', 'copy')
  })

  it('honors the internal cut mode when the system clipboard matches', async () => {
    const api = setupElectronAPI({
      readClipboardFilePaths: vi.fn(async () => ({ success: true, data: ['C:/docs/a.md'] }))
    })
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('cut')

    const ok = await store.pasteInto('C:/docs/A')

    expect(ok).toBe(true)
    expect(api.copyIntoFolder).toHaveBeenCalledWith(['C:/docs/a.md'], 'C:/docs/A', 'cut')
  })

  it('surfaces paste failures through the store error', async () => {
    setupElectronAPI({
      copyIntoFolder: vi.fn(async () => ({ success: false, error: '目标不是文件夹' }))
    })
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('copy')

    const ok = await store.pasteInto('C:/docs/A')

    expect(ok).toBe(false)
    expect(store.error).toBe('目标不是文件夹')
  })

  it('updates tab paths after a cut paste', async () => {
    const api = setupElectronAPI({
      copyIntoFolder: vi.fn(async () => ({
        success: true,
        data: { items: [{ source: 'C:/docs/a.md', target: 'C:/docs/A/a.md' }], failed: [] }
      }))
    })
    const store = useFileStore()
    await store.openFolderPath('C:/docs')
    const doc = { metadata: { title: 'a' }, content: '' }
    api.openFile.mockResolvedValue({
      success: true,
      data: { document: doc, filePath: 'C:/docs/a.md', format: 'mdx' }
    })
    await store.openFile('C:/docs/a.md')
    store.selectOnly('C:/docs/a.md')
    await store.copySelection('cut')
    store.selectOnly('C:/docs/A')

    await store.pasteIntoSelection()

    expect(store.tabs[0].fileInfo?.path).toBe('C:/docs/A/a.md')
  })
})
