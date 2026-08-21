import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileStore } from '../../../stores/file'
import { createExecutionSnapshot, applyDocumentOperation } from '../workspace-context'
import { hashDocumentContent } from '../document-revision'

describe('workspace context', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
  })

  describe('createExecutionSnapshot', () => {
    it('uses the active tab content/title/path/format/revision/hash', () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', '正文内容', 'mdx')

      const snap = createExecutionSnapshot(store)

      expect(snap.activeDocument).not.toBeNull()
      expect(snap.activeDocument!.id).toBe(tab.id)
      expect(snap.activeDocument!.title).toBe('标题')
      expect(snap.activeDocument!.content).toBe('正文内容')
      expect(snap.activeDocument!.format).toBe('mdx')
      expect(snap.activeDocument!.revision).toBe(0)
      expect(snap.activeDocument!.contentHash).toBe(hashDocumentContent('正文内容'))
      expect(snap.activeDocument!.modified).toBe(true)
      expect(snap.activeDocument!.path).toBe('')
      expect(Object.keys(snap).sort()).toEqual([
        'activeDocument',
        'conversationId',
        'cursor',
        'selection',
        'workspaceFiles'
      ])
      expect(snap.selection).toBeNull()
      expect(snap.cursor).toBeNull()
    })

    it('reports null document/selection/cursor when there is no active tab', () => {
      const store = useFileStore()
      const snap = createExecutionSnapshot(store)

      expect(snap.activeDocument).toBeNull()
      expect(snap.selection).toBeNull()
      expect(snap.cursor).toBeNull()
    })

    it('collects workspace files from opened tabs and the file tree', () => {
      const store = useFileStore()
      // opened tab with a real path
      store.tabs.push({
        id: 'tab-a',
        fileInfo: { path: '/docs/notes.md', name: 'notes.md', modified: false, format: 'markdown' },
        document: null,
        content: '',
        revision: 0
      })
      // file tree entry
      store.fileTree = [
        {
          name: 'docs',
          path: '/docs',
          isDirectory: true,
          isExpanded: true,
          isLoading: false,
          children: [
            { name: 'report.md', path: '/docs/report.md', isDirectory: false, isExpanded: false, isLoading: false, children: [] },
            { name: 'draft.mdx', path: '/docs/draft.mdx', isDirectory: false, isExpanded: false, isLoading: false, children: [] }
          ]
        }
      ]

      const snap = createExecutionSnapshot(store)

      expect(snap.workspaceFiles).toEqual([
        { name: 'notes.md', path: '/docs/notes.md', isOpen: true, parentDirs: [] },
        { name: 'docs', path: '/docs', isOpen: false, isDirectory: true, parentDirs: [] },
        { name: 'report.md', path: '/docs/report.md', isOpen: false, parentDirs: ['docs'] },
        { name: 'draft.mdx', path: '/docs/draft.mdx', isOpen: false, parentDirs: ['docs'] }
      ])
    })

    it('marks a tab file as open when it also appears in the file tree', () => {
      const store = useFileStore()
      store.tabs.push({
        id: 'tab-a',
        fileInfo: { path: '/docs/notes.md', name: 'notes.md', modified: false, format: 'markdown' },
        document: null,
        content: '',
        revision: 0
      })
      store.fileTree = [
        { name: 'notes.md', path: '/docs/notes.md', isDirectory: false, isExpanded: false, isLoading: false, children: [] }
      ]

      const snap = createExecutionSnapshot(store)

      expect(snap.workspaceFiles).toHaveLength(1)
      expect(snap.workspaceFiles![0].isOpen).toBe(true)
    })

    it('skips tabs without a file path', () => {
      const store = useFileStore()
      store.tabs.push({
        id: 'tab-unsaved',
        fileInfo: { path: '', name: '未命名.mdx', modified: true, format: 'mdx' },
        document: null,
        content: '',
        revision: 0
      })

      const snap = createExecutionSnapshot(store)

      expect(snap.workspaceFiles).toEqual([])
    })

    it('uses the injected complete file index when provided', () => {
      const store = useFileStore()
      store.fileTree = []
      const injected = [
        { name: 'newben-guide.mdx', path: 'D:/ws/云/newben-guide.mdx', isOpen: false, parentDirs: ['云'] },
        { name: 'k8s.md', path: 'D:/ws/docs/k8s.md', isOpen: false, parentDirs: ['docs'] }
      ]

      const snap = createExecutionSnapshot(store, injected)

      expect(snap.workspaceFiles).toEqual(injected)
    })

    it('falls back to the file tree when no index is injected', () => {
      const store = useFileStore()
      store.fileTree = [
        {
          name: 'docs',
          path: '/docs',
          isDirectory: true,
          isExpanded: true,
          isLoading: false,
          children: [
            { name: 'report.md', path: '/docs/report.md', isDirectory: false, isExpanded: false, isLoading: false, children: [] }
          ]
        }
      ]

      const snap = createExecutionSnapshot(store)

      expect(snap.workspaceFiles).toHaveLength(2)
      expect(snap.workspaceFiles![0].name).toBe('docs')
      expect(snap.workspaceFiles![1].name).toBe('report.md')
    })

    it('maps the editor selection to markdown offsets and text', () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'Hello world', 'markdown')
      store.updateEditorSelection({ tabId: tab.id, from: 0, to: 5, cursor: 5, text: 'Hello' })

      const snap = createExecutionSnapshot(store)

      expect(snap.selection).toEqual({ text: 'Hello', from: 0, to: 5, cursor: 5 })
      expect(snap.cursor).toBe(5)
    })

    it.each([
      ['another tab', { tabId: 'stale', from: 0, to: 5, cursor: 5, text: 'Hello' }],
      ['out-of-bounds range', { tabId: '', from: 0, to: 99, cursor: 5, text: 'Hello' }],
      ['reversed range', { tabId: '', from: 5, to: 0, cursor: 5, text: 'Hello' }],
      ['out-of-bounds cursor', { tabId: '', from: 0, to: 5, cursor: 99, text: 'Hello' }],
      ['mismatched text', { tabId: '', from: 0, to: 5, cursor: 5, text: 'wrong' }]
    ])('fails closed for a stale or invalid editor selection: %s', (_label, invalid) => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'Hello world', 'markdown')
      store.updateEditorSelection({ ...invalid, tabId: invalid.tabId || tab.id })

      const snap = createExecutionSnapshot(store)

      expect(snap.selection).toBeNull()
      expect(snap.cursor).toBeNull()
    })
  })

  describe('applyDocumentOperation: replace-document', () => {
    it('replaces only the target tab and marks it modified', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'old content', 'markdown')
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'replace-document',
        target: snap.activeDocument!,
        content: 'new content',
        reason: ''
      })

      expect(result.status).toBe('applied')
      expect(tab.content).toBe('new content')
      expect(tab.document!.content).toBe('new content')
      expect(tab.revision).toBe(1)
      expect(tab.fileInfo!.modified).toBe(true)
    })

    it('returns conflict when the target tab no longer exists', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'content', 'markdown')
      const snap = createExecutionSnapshot(store)
      // Remove the tab without going through the store's normal close flow.
      const idx = store.tabs.findIndex((t) => t.id === tab.id)
      store.tabs.splice(idx, 1)

      const result = await applyDocumentOperation(store, {
        type: 'replace-document',
        target: snap.activeDocument!,
        content: 'new',
        reason: ''
      })

      expect(result.status).toBe('conflict')
    })

    it('returns conflict when revision differs', async () => {
      const store = useFileStore()
      store.createGeneratedDocument('标题', 'content', 'markdown')
      const snap = createExecutionSnapshot(store)
      store.updateContent('content edited')

      const result = await applyDocumentOperation(store, {
        type: 'replace-document',
        target: snap.activeDocument!,
        content: 'new',
        reason: ''
      })

      expect(result.status).toBe('conflict')
    })

    it('returns conflict when content hash differs', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'content', 'markdown')
      const snap = createExecutionSnapshot(store)
      tab.content = 'tampered'

      const result = await applyDocumentOperation(store, {
        type: 'replace-document',
        target: snap.activeDocument!,
        content: 'new',
        reason: ''
      })

      expect(result.status).toBe('conflict')
    })
  })

  describe('applyDocumentOperation: insert-document', () => {
    it('inserts at start', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'world', 'markdown')
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: 'hello ',
        position: 'start',
        selection: null,
        cursor: null,
        reason: ''
      })

      expect(result.status).toBe('applied')
      expect(tab.content).toBe('hello world')
    })

    it('inserts at end', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'hello', 'markdown')
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: ' world',
        position: 'end',
        selection: null,
        cursor: null,
        reason: ''
      })

      expect(result.status).toBe('applied')
      expect(tab.content).toBe('hello world')
    })

    it('inserts at selection, replacing the selected range', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'hello world', 'markdown')
      store.updateEditorSelection({ tabId: tab.id, from: 6, to: 11, cursor: 11, text: 'world' })
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: 'there',
        position: 'selection',
        selection: snap.selection,
        cursor: snap.cursor,
        reason: ''
      })

      expect(result.status).toBe('applied')
      expect(tab.content).toBe('hello there')
    })

    it('inserts at cursor', async () => {
      const store = useFileStore()
      const tab = store.createGeneratedDocument('标题', 'hello', 'markdown')
      store.updateEditorSelection({ tabId: tab.id, from: 5, to: 5, cursor: 5, text: '' })
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: ' world',
        position: 'cursor',
        selection: null,
        cursor: snap.cursor,
        reason: ''
      })

      expect(result.status).toBe('applied')
      expect(tab.content).toBe('hello world')
    })

    it('returns conflict for selection position without a selection', async () => {
      const store = useFileStore()
      store.createGeneratedDocument('标题', 'hello', 'markdown')
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: 'x',
        position: 'selection',
        selection: null,
        cursor: null,
        reason: ''
      })

      expect(result.status).toBe('conflict')
    })

    it('returns conflict for cursor position without a cursor', async () => {
      const store = useFileStore()
      store.createGeneratedDocument('标题', 'hello', 'markdown')
      const snap = createExecutionSnapshot(store)

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: 'x',
        position: 'cursor',
        selection: null,
        cursor: null,
        reason: ''
      })

      expect(result.status).toBe('conflict')
    })

    it('returns conflict when revision has changed', async () => {
      const store = useFileStore()
      store.createGeneratedDocument('标题', 'hello', 'markdown')
      const snap = createExecutionSnapshot(store)
      store.updateContent('hello edited')

      const result = await applyDocumentOperation(store, {
        type: 'insert-document',
        target: snap.activeDocument!,
        content: 'x',
        position: 'end',
        selection: null,
        cursor: null,
        reason: ''
      })

      expect(result.status).toBe('conflict')
    })
  })

  describe('applyDocumentOperation: create-document', () => {
    it('creates and activates a new unsaved tab with the requested title/content/format', async () => {
      const store = useFileStore()

      const result = await applyDocumentOperation(store, {
        type: 'create-document',
        title: '新文档',
        content: '新内容',
        format: 'markdown',
        reason: ''
      })

      expect(result.status).toBe('applied')
      const tabId = (result.data as { tabId: string }).tabId
      const tab = store.tabs.find((t) => t.id === tabId)
      expect(tab).toBeDefined()
      expect(tab!.content).toBe('新内容')
      expect(tab!.document!.metadata.title).toBe('新文档')
      expect(tab!.fileInfo!.format).toBe('markdown')
      expect(tab!.fileInfo!.modified).toBe(true)
      expect(tab!.fileInfo!.path).toBe('')
      expect(store.activeTabId).toBe(tabId)
    })

    it('notifies the caller to reveal a generated document', async () => {
      const store = useFileStore()
      const revealDocument = vi.fn()

      await applyDocumentOperation(store, {
        type: 'create-document',
        title: '新文档',
        content: '新内容',
        format: 'markdown',
        reason: ''
      }, revealDocument)

      expect(revealDocument).toHaveBeenCalledTimes(1)
    })
  })
})
