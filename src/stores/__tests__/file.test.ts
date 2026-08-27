import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMdxDocument } from '../../types/mdx'
import type { MdxDocument } from '../../types/mdx'
import { useFileStore } from '../file'
import { requestDialog } from '../../utils/dialog'

vi.mock('../../utils/dialog', () => ({
  dialogState: { visible: false, title: '', message: '', detail: '', buttons: [] },
  requestDialog: vi.fn(async () => 0),
  resolveDialogRequest: vi.fn()
}))

vi.mock('../../utils/pdf-export', () => ({
  pdfSource: { value: null },
  pdfHtml: { value: '' },
  preparePdfView: vi.fn(async () => {}),
  clearPdfView: vi.fn()
}))

function makeDoc(title = 'Document', content = ''): MdxDocument {
  return createMdxDocument(title, content)
}

function createMockElectronAPI(overrides: Record<string, unknown> = {}) {
  return {
    newFile: vi.fn(),
    openFile: vi.fn(),
    saveFile: vi.fn(),
    saveAsFile: vi.fn(),
    closeFile: vi.fn(async () => ({ success: true })),
    getRecentFiles: vi.fn(async () => ({ success: true, data: [] })),
    addRecentFile: vi.fn(async () => ({ success: true })),
    removeRecentFile: vi.fn(async () => ({ success: true })),
    clearRecentFiles: vi.fn(async () => ({ success: true })),
    readFolder: vi.fn(async () => ({ success: false })),
    writeRecovery: vi.fn(async () => ({ success: true })),
    clearRecovery: vi.fn(async () => ({ success: true })),
    recoveryStatus: vi.fn(async () => ({ success: true, data: { available: false } })),
    ...overrides
  }
}

describe('file store', () => {
  let electronAPI: ReturnType<typeof createMockElectronAPI>

  beforeEach(() => {
    setActivePinia(createPinia())
    electronAPI = createMockElectronAPI()
    vi.stubGlobal('window', { electronAPI })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
    vi.stubGlobal('navigator', { userAgent: 'Windows', clipboard: { writeText: vi.fn() } })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('newFile', () => {
    it('creates and activates a tab from the main process document', async () => {
      const doc = makeDoc('New Doc', '# hello')
      electronAPI.newFile.mockResolvedValue({ success: true, data: { document: doc, isNew: true } })

      const store = useFileStore()
      const ok = await store.newFile()

      expect(ok).toBe(true)
      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(store.tabs[0].id)
      expect(store.fileContent).toBe('# hello')
      expect(store.document?.metadata.title).toBe('New Doc')
    })

    it('marks a brand-new file as dirty (no path yet)', async () => {
      const doc = makeDoc('New Doc')
      electronAPI.newFile.mockResolvedValue({ success: true, data: { document: doc, isNew: true } })

      const store = useFileStore()
      await store.newFile()

      expect(store.isDirty).toBe(true)
      expect(store.hasFile).toBe(true)
    })
  })

  describe('openFile', () => {
    it('creates a tab with the resolved path and format', async () => {
      const doc = makeDoc('Opened', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/opened.mdx', format: 'mdx' }
      })

      const store = useFileStore()
      const ok = await store.openFile('C:/docs/opened.mdx')

      expect(ok).toBe(true)
      expect(store.tabs).toHaveLength(1)
      expect(store.currentFile?.path).toBe('C:/docs/opened.mdx')
      expect(store.currentFile?.format).toBe('mdx')
      expect(store.currentFile?.modified).toBe(false)
      expect(store.isDirty).toBe(false)
    })

    it('reuses the existing tab for an already-open path', async () => {
      const doc = makeDoc('Opened', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/opened.mdx', format: 'mdx' }
      })

      const store = useFileStore()
      await store.openFile('C:/docs/opened.mdx')
      await store.openFile('C:/docs/opened.mdx')

      expect(store.tabs).toHaveLength(1)
      expect(electronAPI.openFile).toHaveBeenCalledTimes(1)
    })

    it('does not create a tab when the user cancels', async () => {
      electronAPI.openFile.mockResolvedValue({ success: false, error: '用户取消' })

      const store = useFileStore()
      const ok = await store.openFile()

      expect(ok).toBe(false)
      expect(store.tabs).toHaveLength(0)
    })

    it('passes addToRecent:false through to the main process', async () => {
      const doc = makeDoc('Opened', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/opened.mdx', format: 'mdx' }
      })

      const store = useFileStore()
      await store.openFile('C:/docs/opened.mdx', { addToRecent: false })

      expect(electronAPI.openFile).toHaveBeenCalledWith('C:/docs/opened.mdx', false)
    })
  })

  describe('openFolderPath', () => {
    it('records opened folders in the recent list with type folder', async () => {
      electronAPI = createMockElectronAPI({
        readFolder: vi.fn(async () => ({ success: true, data: [] }))
      })
      vi.stubGlobal('window', { electronAPI })

      const store = useFileStore()
      const ok = await store.openFolderPath('C:/docs')

      expect(ok).toBe(true)
      expect(electronAPI.addRecentFile).toHaveBeenCalledWith('C:/docs', 'folder')
    })

    it('does not record the folder when opening fails', async () => {
      electronAPI = createMockElectronAPI({
        readFolder: vi.fn(async () => ({ success: false }))
      })
      vi.stubGlobal('window', { electronAPI })

      const store = useFileStore()
      const ok = await store.openFolderPath('C:/docs')

      expect(ok).toBe(false)
      expect(electronAPI.addRecentFile).not.toHaveBeenCalled()
    })

    it('refreshes the recent files list immediately after opening a folder', async () => {
      electronAPI = createMockElectronAPI({
        readFolder: vi.fn(async () => ({ success: true, data: [] })),
        getRecentFiles: vi.fn(async () => ({
          success: true,
          data: [{ path: 'C:/docs', type: 'folder' }]
        }))
      })
      vi.stubGlobal('window', { electronAPI })

      const store = useFileStore()
      const ok = await store.openFolderPath('C:/docs')

      expect(ok).toBe(true)
      expect(store.recentFiles).toEqual([{ path: 'C:/docs', type: 'folder' }])
    })
  })

  describe('restoreSession', () => {
    it('restores open tabs without recording them as recent files', async () => {
      const doc = makeDoc('Doc', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/a.md', format: 'markdown' }
      })

      const session = {
        openedFolderPath: null,
        openFilePaths: ['C:/docs/a.md'],
        activeFilePath: null,
        sidebarCollapsed: false,
        editorMode: 'ir',
        aiPanelOpen: false,
        aiActiveConversationId: null
      }
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(session))

      const store = useFileStore()
      await store.restoreSession()

      expect(electronAPI.openFile).toHaveBeenCalledWith('C:/docs/a.md', false)
    })
  })

  describe('content editing', () => {
    it('updateContent updates content and marks the tab modified', async () => {
      const doc = makeDoc('Doc', 'before')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/doc.mdx', format: 'mdx' }
      })

      const store = useFileStore()
      await store.openFile('C:/docs/doc.mdx')

      store.updateContent('after')

      expect(store.fileContent).toBe('after')
      expect(store.isModified).toBe(true)
      expect(store.isDirty).toBe(true)
    })

    it('setContent syncs content without marking the tab modified', async () => {
      const doc = makeDoc('Doc', 'before')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/doc.mdx', format: 'mdx' }
      })

      const store = useFileStore()
      await store.openFile('C:/docs/doc.mdx')

      store.setContent('synced')

      expect(store.fileContent).toBe('synced')
      expect(store.isModified).toBe(false)
    })
  })

  describe('saveFile', () => {
    it('clears the modified flag after a successful save', async () => {
      const doc = makeDoc('Doc', 'before')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/doc.mdx', format: 'mdx' }
      })
      electronAPI.saveFile.mockResolvedValue({ success: true, data: 'C:/docs/doc.mdx' })

      const store = useFileStore()
      await store.openFile('C:/docs/doc.mdx')
      store.updateContent('edited')
      expect(store.isModified).toBe(true)

      const ok = await store.saveFile()

      expect(ok).toBe(true)
      expect(store.isModified).toBe(false)
      expect(electronAPI.saveFile).toHaveBeenCalledWith('edited', 'Doc', 'C:/docs/doc.mdx')
    })

    it('falls back to saveAsFile when the file has no path (NEW_FILE)', async () => {
      const doc = makeDoc('Doc', 'content')
      electronAPI.newFile.mockResolvedValue({ success: true, data: { document: doc, isNew: true } })
      electronAPI.saveFile.mockResolvedValue({ success: false, error: 'NEW_FILE' })
      electronAPI.saveAsFile.mockResolvedValue({ success: true, data: 'C:/docs/saved.mdx' })

      const store = useFileStore()
      await store.newFile()

      const ok = await store.saveFile()

      expect(ok).toBe(true)
      expect(electronAPI.saveAsFile).toHaveBeenCalled()
      expect(store.currentFile?.path).toBe('C:/docs/saved.mdx')
    })
  })

  describe('saveAsFile', () => {
    it('updates fileInfo path, name and format after saving as', async () => {
      const doc = makeDoc('Doc', 'content')
      electronAPI.newFile.mockResolvedValue({ success: true, data: { document: doc, isNew: true } })
      electronAPI.saveAsFile.mockResolvedValue({ success: true, data: 'C:/docs/renamed.md' })

      const store = useFileStore()
      await store.newFile()

      const ok = await store.saveAsFile()

      expect(ok).toBe(true)
      expect(store.currentFile?.path).toBe('C:/docs/renamed.md')
      expect(store.currentFile?.name).toBe('renamed.md')
      expect(store.currentFile?.format).toBe('markdown')
    })
  })

  describe('closeTab', () => {
    it('closes a clean tab without prompting', async () => {
      const doc = makeDoc('Doc', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/doc.mdx', format: 'mdx' }
      })

      const store = useFileStore()
      await store.openFile('C:/docs/doc.mdx')
      const tabId = store.activeTabId!

      const closed = await store.closeTab(tabId)

      expect(closed).toBe(true)
      expect(store.tabs).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
      expect(requestDialog).not.toHaveBeenCalled()
    })

    it('keeps the tab when the user cancels the save prompt', async () => {
      const doc = makeDoc('Doc', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/doc.mdx', format: 'mdx' }
      })
      vi.mocked(requestDialog).mockResolvedValueOnce(2) // cancel

      const store = useFileStore()
      await store.openFile('C:/docs/doc.mdx')
      store.updateContent('dirty')
      const tabId = store.activeTabId!

      const closed = await store.closeTab(tabId)

      expect(closed).toBe(false)
      expect(store.tabs).toHaveLength(1)
    })

    it('closes the tab after the user chooses to discard', async () => {
      const doc = makeDoc('Doc', 'content')
      electronAPI.openFile.mockResolvedValue({
        success: true,
        data: { document: doc, filePath: 'C:/docs/doc.mdx', format: 'mdx' }
      })
      vi.mocked(requestDialog).mockResolvedValueOnce(1) // discard

      const store = useFileStore()
      await store.openFile('C:/docs/doc.mdx')
      store.updateContent('dirty')
      const tabId = store.activeTabId!

      const closed = await store.closeTab(tabId)

      expect(closed).toBe(true)
      expect(store.tabs).toHaveLength(0)
    })
  })

  describe('multiple tabs', () => {
    async function openTwoTabs(store: ReturnType<typeof useFileStore>): Promise<void> {
      electronAPI.openFile
        .mockResolvedValueOnce({
          success: true,
          data: { document: makeDoc('First', 'one'), filePath: 'C:/docs/first.mdx', format: 'mdx' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: { document: makeDoc('Second', 'two'), filePath: 'C:/docs/second.mdx', format: 'mdx' }
        })
      await store.openFile('C:/docs/first.mdx')
      await store.openFile('C:/docs/second.mdx')
    }

    it('opens multiple tabs and activates the latest', async () => {
      const store = useFileStore()
      await openTwoTabs(store)

      expect(store.tabs).toHaveLength(2)
      expect(store.hasMultipleTabs).toBe(true)
      expect(store.fileContent).toBe('two')
    })

    it('switches the active tab via setActiveTab', async () => {
      const store = useFileStore()
      await openTwoTabs(store)
      const firstTabId = store.tabs[0].id

      await store.setActiveTab(firstTabId)

      expect(store.activeTabId).toBe(firstTabId)
      expect(store.fileContent).toBe('one')
    })

    it('closeOtherTabs keeps only the specified tab', async () => {
      const store = useFileStore()
      await openTwoTabs(store)
      const keepId = store.tabs[1].id

      await store.closeOtherTabs(keepId)

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0].id).toBe(keepId)
    })

    it('closeAllTabs empties the tab list', async () => {
      const store = useFileStore()
      await openTwoTabs(store)

      await store.closeAllTabs()

      expect(store.tabs).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
    })
  })

  describe('getters', () => {
    it('computes fileName from the document title', async () => {
      const doc = makeDoc('My Title', 'content')
      electronAPI.newFile.mockResolvedValue({ success: true, data: { document: doc, isNew: true } })

      const store = useFileStore()
      await store.newFile()

      expect(store.fileName).toBe('My Title.mdx')
    })

    it('falls back to 未命名.mdx when there is no active tab', () => {
      const store = useFileStore()
      expect(store.fileName).toBe('未命名.mdx')
    })
  })
})
