import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { MdxDocument, MdxImageAsset, DocumentFormat } from '../types/mdx'
import { loadSessionState, saveSessionState } from './session'
import { requestDialog } from '../utils/dialog'

export type EditorMode = 'split' | 'source' | 'ir'

export interface FileInfo {
  path: string
  name: string
  modified: boolean
  format: DocumentFormat
}

export interface FolderItem {
  name: string
  path: string
  isDirectory: boolean
}

/** 文件树节点 */
export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  isExpanded: boolean
  isLoading: boolean
  children: FileTreeNode[]
}

export interface TabInfo {
  id: string
  fileInfo: FileInfo | null
  document: MdxDocument | null
  content: string
}

/**
 * 文件状态管理 Store
 * 支持多标签页：tabs 数组管理所有打开的标签，activeTabId 指向当前激活标签
 * 保留 currentFile / document / fileContent 作为向后兼容的 computed 代理
 */
export const useFileStore = defineStore('file', () => {
  // ====== Tab 多标签状态 ======
  const tabs = ref<TabInfo[]>([])
  const activeTabId = ref<string | null>(null)
  let tabIdCounter = 0

  // 向后兼容的代理 computed（从 activeTab 读取）
  // 注意：Vue computed 对对象引用做缓存，直接修改 tab 属性不会触发下游更新。
  // 使用 stateVersion 强制在属性变更时重新计算。
  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null)
  const stateVersion = ref(0)
  const currentFile = computed<FileInfo | null>(() => {
    stateVersion.value
    return activeTab.value?.fileInfo ?? null
  })
  const document = computed<MdxDocument | null>(() => {
    stateVersion.value
    return activeTab.value?.document ?? null
  })
  const fileContent = computed<string>(() => {
    stateVersion.value
    return activeTab.value?.content ?? ''
  })

  // 编辑器状态
  const DEFAULT_SIDEBAR_WIDTH = 220
  const MIN_SIDEBAR_WIDTH = 180
  const MAX_SIDEBAR_WIDTH = 420
  const clampSidebarWidth = (width: number): number => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))

  const editorMode = ref<EditorMode>('ir')
  const sessionEditorMode = loadSessionState()?.editorMode
  if (sessionEditorMode === 'ir' || sessionEditorMode === 'source' || sessionEditorMode === 'split') {
    editorMode.value = sessionEditorMode
  }
  const sidebarCollapsed = ref(false)
  const savedSidebarWidth = loadSessionState()?.sidebarWidth
  const sidebarWidth = ref(
    typeof savedSidebarWidth === 'number' && Number.isFinite(savedSidebarWidth)
      ? clampSidebarWidth(savedSidebarWidth)
      : DEFAULT_SIDEBAR_WIDTH
  )
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const recentFiles = ref<string[]>([])
  const wordCount = ref(0)
  const cursorLine = ref(1)
  const cursorColumn = ref(1)
  const editorResetVersion = ref(0)
  const autoSaveEnabled = ref(true)
  const autoSaveInterval = ref(30)
  const isAutoSaving = ref(false)
  const lastAutoSaveAt = ref<string | null>(null)
  const autoSaveError = ref<string | null>(null)
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null
  let recoveryWriteTimer: ReturnType<typeof setTimeout> | null = null
  let recoveryWriteInProgress = false
  let recoveryWritePending = false

  // 文件夹浏览状态
  const openedFolderPath = ref<string | null>(null)
  const folderItems = ref<FolderItem[]>([]) // 保留兼容
  const folderHistory = ref<string[]>([]) // 保留兼容
  const fileTree = ref<FileTreeNode[]>([]) // 树形结构

  // Getters
  const hasFile = computed(() => {
    stateVersion.value
    return activeTab.value !== null && activeTab.value.document !== null
  })
  const isModified = computed(() => {
    stateVersion.value
    return activeTab.value?.fileInfo?.modified ?? false
  })
  const isDirty = computed(() => {
    stateVersion.value
    if (!activeTab.value?.document) return false
    return (activeTab.value?.fileInfo?.modified ?? false) || !activeTab.value?.fileInfo?.path
  })
  const fileName = computed(() => {
    stateVersion.value
    const tab = activeTab.value
    if (!tab) return '未命名.mdx'
    if (tab.fileInfo?.format !== 'markdown' && tab.document?.metadata.title && tab.document.metadata.title !== '未命名文档') {
      return `${tab.document.metadata.title}.mdx`
    }
    return tab.fileInfo?.name ?? '未命名.mdx'
  })
  const displayTitle = computed(() => {
    stateVersion.value
    const name = fileName.value.replace('.mdx', '')
    return isModified.value ? `${name} *` : name
  })
  const imageAssets = computed(() => {
    stateVersion.value
    return activeTab.value?.document?.assets.images || []
  })
  const hasMultipleTabs = computed(() => tabs.value.length > 1)

  // ================ Tab 管理操作 ================

  function createTabId(): string {
    return `tab_${++tabIdCounter}`
  }

  /** 创建新 tab（不自动激活） */
  function createTab(): TabInfo {
    const id = createTabId()
    const tab: TabInfo = { id, fileInfo: null, document: null, content: '' }
    tabs.value.push(tab)
    return tab
  }

  /** 激活指定 tab */
  async function setActiveTab(tabId: string): Promise<void> {
    activeTabId.value = tabId
    const filePath = tabs.value.find((tab) => tab.id === tabId)?.fileInfo?.path
    if (filePath) await revealFileInTree(filePath)
    persistSession()
  }

  /** 展开文件所在的所有父目录，支持按需加载尚未展开的目录。 */
  async function revealFileInTree(filePath: string): Promise<void> {
    const normalize = (value: string): string => value.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
    const target = normalize(filePath)

    async function visit(nodes: FileTreeNode[]): Promise<boolean> {
      for (const node of nodes) {
        const nodePath = normalize(node.path)
        if (!node.isDirectory) {
          if (nodePath === target) return true
          continue
        }

        if (target !== nodePath && !target.startsWith(`${nodePath}/`)) continue
        if (!node.isExpanded || node.children.length === 0) await expandNode(node)
        if (await visit(node.children)) return true
      }
      return false
    }

    await visit(fileTree.value)
  }

  /** 查找已打开文件的 tab */
  function findTabByPath(filePath: string): TabInfo | undefined {
    return tabs.value.find((t) => t.fileInfo?.path === filePath)
  }

  /** 对指定 tab 执行保存确认 */
  async function confirmSaveForTab(tab: TabInfo): Promise<'save' | 'discard' | 'cancel'> {
    const isTabDirty = tab.document && ((tab.fileInfo?.modified ?? false) || !tab.fileInfo?.path)
    if (!isTabDirty) return 'discard'

    const title = tab.document?.metadata.title || '未命名文档'

    const choice = await requestDialog({
      title: '保存更改',
      message: `是否将更改保存到"${title}"？`,
      detail: '如果不保存，你的更改将会丢失。',
      buttons: [
        { label: '取消', value: 2 },
        { label: '不保存', value: 1 },
        { label: '保存', value: 0, primary: true }
      ]
    })
    return choice === 0 ? 'save' : choice === 1 ? 'discard' : 'cancel'
  }

  /** 关闭指定 tab */
  async function closeTab(tabId: string): Promise<boolean> {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return true
    const tab = tabs.value[index]

    // 检查是否需要保存
    const isTabDirty = tab.document && ((tab.fileInfo?.modified ?? false) || !tab.fileInfo?.path)
    if (isTabDirty) {
      const choice = await confirmSaveForTab(tab)
      if (choice === 'cancel') return false
      if (choice === 'save') {
        // 切换到该 tab 并保存
        activeTabId.value = tabId
        const saved = await saveFile()
        if (!saved) return false
      }
    }

    // 从 tabs 中移除
    tabs.value.splice(index, 1)
    persistSession()
    await writeRecoverySnapshot()

    // 如果关闭的是当前激活的 tab，切换到邻居
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const nextIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[nextIndex].id
      } else {
        activeTabId.value = null
      }
      stateVersion.value++
      editorResetVersion.value++
    }

    return true
  }

  /** 关闭其他所有 tab，保留指定 tab */
  async function closeOtherTabs(keepTabId: string): Promise<void> {
    const otherTabs = tabs.value.filter((t) => t.id !== keepTabId)
    for (const tab of otherTabs) {
      const result = await closeTab(tab.id)
      if (!result) return
    }
  }

  /** 关闭所有 tab */
  async function closeAllTabs(): Promise<void> {
    while (tabs.value.length > 0) {
      const result = await closeTab(tabs.value[0].id)
      if (!result) return
    }
  }

  /** 在系统文件管理器中打开文件所在位置 */
  async function revealInExplorer(filePath: string): Promise<void> {
    if (window.electronAPI?.revealInExplorer) {
      await window.electronAPI.revealInExplorer(filePath)
    }
  }

  // ================ 向后兼容的写入操作（代理到 activeTab） ================

  function setFile(file: FileInfo | null): void {
    const tab = activeTab.value
    if (!tab) return
    tab.fileInfo = file
    if (!file) tab.content = ''
    stateVersion.value++
    error.value = null
  }

  function setDocument(doc: MdxDocument | null, path?: string): void {
    const tab = activeTab.value
    if (!tab) return
    tab.document = doc
    if (doc) {
      tab.content = doc.content
      if (path) {
        tab.fileInfo = {
          path,
          name: path.split(/[/\\]/).pop() || '未命名.mdx',
          modified: false,
          format: path.toLowerCase().endsWith('.md') ? 'markdown' : 'mdx'
        }
      }
      stateVersion.value++
      updateWordCount()
    } else {
      tab.content = ''
      tab.fileInfo = null
      stateVersion.value++
    }
  }

  function setContent(content: string): void {
    const tab = activeTab.value
    if (!tab) return
    tab.content = content
    if (tab.document) {
      tab.document.content = content
    }
    stateVersion.value++
    updateWordCount()
    scheduleRecoverySnapshot()
  }

  function updateContent(content: string): void {
    const tab = activeTab.value
    if (!tab) return
    tab.content = content
    if (tab.document) {
      tab.document.content = content
    }
    if (tab.fileInfo) {
      tab.fileInfo.modified = true
    }
    stateVersion.value++
    updateWordCount()
    scheduleRecoverySnapshot()
  }

  function markSaved(): void {
    const tab = activeTab.value
    if (tab?.fileInfo) {
      tab.fileInfo.modified = false
    }
    stateVersion.value++
    scheduleRecoverySnapshot()
  }

  async function saveTabDirect(tab: TabInfo): Promise<boolean> {
    if (!tab.document || !tab.fileInfo?.path || !tab.fileInfo.modified || !window.electronAPI) return false
    const savedContent = tab.content
    const result = await window.electronAPI.saveFile(savedContent, tab.document.metadata.title, tab.fileInfo.path)
    if (!result.success) return false
    if (tab.content === savedContent) tab.fileInfo.modified = false
    stateVersion.value++
    return true
  }

  async function writeRecoverySnapshot(): Promise<void> {
    if (!window.electronAPI) return
    if (recoveryWriteInProgress) {
      recoveryWritePending = true
      return
    }
    recoveryWriteInProgress = true
    const dirtyTabs = tabs.value.filter((tab) => tab.document && ((tab.fileInfo?.modified ?? false) || !tab.fileInfo?.path))
    try {
      if (dirtyTabs.length === 0) {
        const result = await window.electronAPI.clearRecovery()
        if (!result.success) throw new Error(result.error || '清理恢复快照失败')
      } else {
        const result = await window.electronAPI.writeRecovery({
          version: 1,
          createdAt: new Date().toISOString(),
          activeTabId: activeTabId.value,
          tabs: dirtyTabs.map((tab) => ({
            id: tab.id,
            filePath: tab.fileInfo?.path || null,
            fileName: tab.fileInfo?.name || '未命名.mdx',
            format: tab.fileInfo?.format || 'mdx',
            content: tab.content,
            document: tab.document,
            modifiedAt: new Date().toISOString()
          }))
        })
        if (!result.success) throw new Error(result.error || '写入恢复快照失败')
      }
    } finally {
      recoveryWriteInProgress = false
      if (recoveryWritePending) {
        recoveryWritePending = false
        void writeRecoverySnapshot().catch((err) => {
          autoSaveError.value = err instanceof Error ? err.message : '写入恢复快照失败'
        })
      }
    }
  }

  function scheduleRecoverySnapshot(): void {
    if (recoveryWriteTimer) clearTimeout(recoveryWriteTimer)
    recoveryWriteTimer = setTimeout(() => {
      recoveryWriteTimer = null
      void writeRecoverySnapshot().catch((err) => {
        autoSaveError.value = err instanceof Error ? err.message : '写入恢复快照失败'
      })
    }, 1000)
  }

  async function autoSave(): Promise<void> {
    if (!autoSaveEnabled.value || isAutoSaving.value || tabs.value.length === 0) return
    isAutoSaving.value = true
    autoSaveError.value = null
    try {
      const dirtyTabs = tabs.value.filter((tab) => tab.document && tab.fileInfo?.path && tab.fileInfo.modified && tab.document.settings.auto_save !== false)
      let savedCount = 0
      let failedCount = 0
      for (const tab of dirtyTabs) {
        if (await saveTabDirect(tab)) savedCount++
        else failedCount++
      }
      await writeRecoverySnapshot()
      if (savedCount > 0) lastAutoSaveAt.value = new Date().toISOString()
      if (failedCount > 0) autoSaveError.value = `${failedCount} 个文档自动保存失败`
    } catch (error) {
      autoSaveError.value = error instanceof Error ? error.message : '自动保存失败'
      await writeRecoverySnapshot()
    } finally {
      isAutoSaving.value = false
    }
  }

  function stopAutoSave(): void {
    if (autoSaveTimer) clearInterval(autoSaveTimer)
    autoSaveTimer = null
    if (recoveryWriteTimer) clearTimeout(recoveryWriteTimer)
    recoveryWriteTimer = null
  }

  function startAutoSave(): void {
    stopAutoSave()
    if (typeof window === 'undefined' || !autoSaveEnabled.value) return
    autoSaveTimer = setInterval(() => { void autoSave() }, autoSaveInterval.value * 1000)
  }

  async function restoreRecovery(): Promise<void> {
    if (!window.electronAPI) return
    const status = await window.electronAPI.recoveryStatus()
    if (!status.success || !status.data?.available) return
    const result = await window.electronAPI.readRecovery()
    const snapshot = result.data as { activeTabId: string | null; tabs: Array<{ id: string; filePath: string | null; content: string; document: MdxDocument; fileName: string; format: DocumentFormat; assetData?: Record<string, string> }> } | undefined
    if (!snapshot?.tabs?.length) {
      await window.electronAPI.clearRecovery()
      return
    }

    const choice = await requestDialog({
      title: '恢复未保存内容',
      message: `检测到上次异常退出时有 ${snapshot.tabs.length} 个文档未保存。是否恢复？`,
      buttons: [
        { label: '放弃', value: 1 },
        { label: '恢复', value: 0, primary: true }
      ]
    })
    if (choice !== 0) {
      await window.electronAPI.clearRecovery()
      return
    }

    let recoveredActiveTabId: string | null = null
    for (const recovered of snapshot.tabs) {
      const existing = recovered.filePath ? findTabByPath(recovered.filePath) : undefined
      if (existing) {
        existing.content = recovered.content
        existing.document = recovered.document
        existing.document.content = recovered.content
        if (existing.fileInfo) existing.fileInfo.modified = true
        if (recovered.assetData && recovered.filePath) {
          const restoreResult = await window.electronAPI.restoreRecoveryAssets(recovered.filePath, recovered.document, recovered.assetData)
          if (!restoreResult.success) autoSaveError.value = restoreResult.error || '恢复资源失败'
        }
        if (recovered.id === snapshot.activeTabId) recoveredActiveTabId = existing.id
        continue
      }
      const tab = createTab()
      tab.document = recovered.document
      tab.content = recovered.content
      tab.fileInfo = {
        path: '',
        name: `恢复-${recovered.fileName}`,
        modified: true,
        format: recovered.format
      }
      if (recovered.id === snapshot.activeTabId) recoveredActiveTabId = tab.id
    }
    if (recoveredActiveTabId) activeTabId.value = recoveredActiveTabId
    else if (!activeTabId.value && tabs.value.length > 0) activeTabId.value = tabs.value[tabs.value.length - 1].id
    stateVersion.value++
    updateWordCount()
    await window.electronAPI.clearRecovery()
  }

  // ================ 其余状态操作 ================

  function setEditorMode(mode: EditorMode): void {
    editorMode.value = mode
    persistSession()
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
    persistSession()
  }

  function setSidebarWidth(width: number, persist = true): void {
    if (!Number.isFinite(width)) return
    sidebarWidth.value = clampSidebarWidth(width)
    if (persist) persistSession()
  }

  // ================ 会话持久化 ================

  function persistSession(): void {
    saveSessionState({
      openedFolderPath: openedFolderPath.value,
      openFilePaths: tabs.value.map((t) => t.fileInfo?.path).filter((p): p is string => !!p),
      activeFilePath: activeTab.value?.fileInfo?.path ?? null,
      sidebarCollapsed: sidebarCollapsed.value,
      sidebarWidth: sidebarWidth.value,
      editorMode: editorMode.value
    })
  }

  async function restoreSession(): Promise<void> {
    const state = loadSessionState()
    if (!state) return

    if (state.editorMode === 'ir' || state.editorMode === 'source' || state.editorMode === 'split') {
      editorMode.value = state.editorMode
    }
    sidebarCollapsed.value = state.sidebarCollapsed === true
    if (typeof state.sidebarWidth === 'number' && Number.isFinite(state.sidebarWidth)) {
      sidebarWidth.value = clampSidebarWidth(state.sidebarWidth)
    }

    if (state.openedFolderPath) {
      const success = await readFolder(state.openedFolderPath)
      if (success) {
        const folderName = state.openedFolderPath.split(/[/\\]/).pop() || state.openedFolderPath
        fileTree.value = [
          {
            name: folderName,
            path: state.openedFolderPath,
            isDirectory: true,
            isExpanded: true,
            isLoading: false,
            children: folderItems.value.map((item) => ({
              name: item.name,
              path: item.path,
              isDirectory: item.isDirectory,
              isExpanded: false,
              isLoading: false,
              children: []
            }))
          }
        ]
      }
    }

    for (const filePath of state.openFilePaths) {
      await openFile(filePath)
    }

    if (state.activeFilePath) {
      const tab = findTabByPath(state.activeFilePath)
      if (tab) {
        activeTabId.value = tab.id
        await revealFileInTree(state.activeFilePath)
      }
    }
  }

  function setCursorPosition(line: number, column: number): void {
    cursorLine.value = line
    cursorColumn.value = column
  }

  function updateWordCount(): void {
    const text = fileContent.value
    wordCount.value = text.replace(/\s/g, '').length
  }

  // ================ 最近文件 ================

  async function loadRecentFiles(): Promise<void> {
    try {
      if (window.electronAPI?.getRecentFiles) {
        const result = await window.electronAPI.getRecentFiles()
        if (result.success && result.data) {
          recentFiles.value = result.data
        }
      }
    } catch {
      recentFiles.value = []
    }
  }

  async function removeRecent(filePath: string): Promise<void> {
    recentFiles.value = recentFiles.value.filter((p) => p !== filePath)
    if (window.electronAPI?.removeRecentFile) {
      await window.electronAPI.removeRecentFile(filePath)
    }
  }

  async function clearRecent(): Promise<void> {
    recentFiles.value = []
    if (window.electronAPI?.clearRecentFiles) {
      await window.electronAPI.clearRecentFiles()
    }
  }

  // ================ 新建 / 打开 / 保存 / 关闭 ================

  async function init(): Promise<void> {
    await loadRecentFiles()
    await restoreSession()
    await restoreRecovery()
    startAutoSave()
  }

  async function newFile(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const tab = createTab()

      if (window.electronAPI) {
        const result = await window.electronAPI.newFile()
        if (result.success && result.data) {
          const doc = result.data.document as MdxDocument
          tab.document = doc
          tab.content = doc.content
          tab.fileInfo = {
          path: '',
          name: '未命名.mdx',
          modified: false,
          format: 'mdx'
          }
          activeTabId.value = tab.id
          return true
        }
      }

      // Fallback: 本地创建
      const { createMdxDocument } = await import('../types/mdx')
      tab.document = createMdxDocument('未命名文档', '')
      tab.content = tab.document.content
      tab.fileInfo = {
        path: '',
        name: '未命名.mdx',
        modified: false,
        format: 'mdx'
      }
      activeTabId.value = tab.id
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '新建文件失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function openFile(filePath?: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      // 如果指定了路径，检查是否已在某 tab 中打开
      if (filePath) {
        const existing = findTabByPath(filePath)
        if (existing) {
          activeTabId.value = existing.id
          return true
        }
      }

      const result = await window.electronAPI.openFile(filePath)

      if (result.success && result.data) {
        const doc = result.data.document as MdxDocument
        const fPath = result.data.filePath as string

        // 再次检查（IPC 可能解析了路径）
        const existing = findTabByPath(fPath)
        if (existing) {
          activeTabId.value = existing.id
          return true
        }

        // 创建新 tab
        const tab = createTab()
        tab.document = doc
        tab.content = doc.content
        tab.fileInfo = {
          path: fPath,
          name: fPath.split(/[/\\]/).pop() || '未命名.mdx',
          modified: false,
          format: result.data.format || (fPath.toLowerCase().endsWith('.md') ? 'markdown' : 'mdx')
        }
        activeTabId.value = tab.id

        await loadRecentFiles()
        persistSession()
        return true
      } else if (result.error === '用户取消') {
        return false
      } else {
        error.value = result.error || '打开文件失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '打开文件失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function saveFile(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      const tab = activeTab.value
      if (!tab || !tab.document) {
        error.value = '没有打开的文档'
        return false
      }

      const savedContent = tab.content
      const result = await window.electronAPI.saveFile(savedContent, tab.document.metadata.title, tab.fileInfo?.path || undefined)

      if (result.success) {
        if (tab.content === savedContent && tab.fileInfo) {
          tab.fileInfo.modified = false
          stateVersion.value++
          await writeRecoverySnapshot()
        }
        return true
      } else if (result.error === 'NEW_FILE') {
        return await saveAsFile()
      } else {
        error.value = result.error || '保存文件失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存文件失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function saveAsFile(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      const tab = activeTab.value
      if (!tab || !tab.document) {
        error.value = '没有打开的文档'
        return false
      }

      const savedContent = tab.content
      const result = await window.electronAPI.saveAsFile(savedContent, tab.document.metadata.title, tab.fileInfo?.path || undefined)

      if (result.success && result.data) {
        const savePath = result.data as string
        if (tab.fileInfo) {
          tab.fileInfo.path = savePath
          tab.fileInfo.name = savePath.split(/[/\\]/).pop() || '未命名.mdx'
          tab.fileInfo.modified = tab.content !== savedContent
          tab.fileInfo.format = savePath.toLowerCase().endsWith('.md') ? 'markdown' : 'mdx'
        } else {
          tab.fileInfo = {
            path: savePath,
            name: savePath.split(/[/\\]/).pop() || '未命名.mdx',
            modified: tab.content !== savedContent,
            format: savePath.toLowerCase().endsWith('.md') ? 'markdown' : 'mdx'
          }
        }
        await loadRecentFiles()
        await writeRecoverySnapshot()
        return true
      } else if (result.error === '用户取消') {
        return false
      } else {
        error.value = result.error || '保存文件失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存文件失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function closeFile(): Promise<boolean> {
    if (!activeTabId.value) return true
    const filePath = activeTab.value?.fileInfo?.path
    if (filePath) {
      try { await window.electronAPI?.closeFile(filePath) } catch { /* ignore */ }
    }
    return closeTab(activeTabId.value)
  }

  // ================ 保存确认对话框 ================

  async function confirmSaveDialog(): Promise<'save' | 'discard' | 'cancel'> {
    const tab = activeTab.value
    const title = tab?.document?.metadata.title || '未命名文档'

    const choice = await requestDialog({
      title: '保存更改',
      message: `是否将更改保存到"${title}"？`,
      detail: '如果不保存，你的更改将会丢失。',
      buttons: [
        { label: '取消', value: 2 },
        { label: '不保存', value: 1 },
        { label: '保存', value: 0, primary: true }
      ]
    })
    return choice === 0 ? 'save' : choice === 1 ? 'discard' : 'cancel'
  }

  async function confirmSaveBeforeAction(): Promise<boolean> {
    if (!isDirty.value) return true

    const choice = await confirmSaveDialog()

    if (choice === 'cancel') return false
    if (choice === 'save') {
      const saved = await saveFile()
      if (!saved) return false
    }
    return true
  }

  /** 关闭窗口前遍历所有脏 tab 逐一确认 */
  async function confirmSaveBeforeClose(): Promise<boolean> {
    for (const tab of tabs.value) {
      const isTabDirty = tab.document && ((tab.fileInfo?.modified ?? false) || !tab.fileInfo?.path)
      if (!isTabDirty) continue

      const choice = await confirmSaveForTab(tab)
      if (choice === 'cancel') return false
      if (choice === 'save') {
        activeTabId.value = tab.id
        const saved = await saveFile()
        if (!saved) return false
      }
    }
    return true
  }

  // ================ 导入 / 导出 ================

  async function importMarkdown(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      // 若已打开文件夹，传入文件夹路径，主进程将自动保存到该文件夹
      const targetFolder = openedFolderPath.value || undefined
      const result = await window.electronAPI.importMd(undefined, targetFolder)

      if (result.success && result.data) {
        const doc = result.data.document as MdxDocument
        const fPath = result.data.filePath as string

        const existing = findTabByPath(fPath)
        if (existing) {
          activeTabId.value = existing.id
          return true
        }

        const tab = createTab()
        tab.document = doc
        tab.content = doc.content
        tab.fileInfo = {
          path: fPath,
          name: fPath.split(/[/\\]/).pop() || '未命名.mdx',
          modified: false,
          format: result.data.format || (fPath.toLowerCase().endsWith('.md') ? 'markdown' : 'mdx')
        }
        activeTabId.value = tab.id

        await loadRecentFiles()

        // 刷新文件夹视图以显示新导入的文件
        if (openedFolderPath.value) {
          await readFolder(openedFolderPath.value)
        }

        return true
      } else if (result.error === '用户取消') {
        return false
      } else {
        error.value = result.error || '导入失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导入失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function importFolder(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      // 若已打开文件夹，将其作为默认目标文件夹
      const targetFolder = openedFolderPath.value || undefined
      const result = await window.electronAPI.importFolder(undefined, targetFolder)

      if (result.success && result.data) {
        const data = result.data as {
          imported: Array<{ source: string; target: string }>
          failed: Array<{ source: string; error: string }>
          sourceDir: string
          targetDir: string
        }

        // 刷新文件夹视图以显示新导入的文件
        if (openedFolderPath.value && openedFolderPath.value === data.targetDir) {
          // 目标文件夹就是当前打开的文件夹，直接刷新
          await readFolder(openedFolderPath.value)
        } else if (data.targetDir) {
          // 未打开文件夹或打开了其他文件夹，自动打开目标文件夹
          const success = await readFolder(data.targetDir)
          if (success) {
            const folderName = data.targetDir.split(/[/\\]/).pop() || data.targetDir
            fileTree.value = [
              {
                name: folderName,
                path: data.targetDir,
                isDirectory: true,
                isExpanded: true,
                isLoading: false,
                children: folderItems.value.map((item: FolderItem) => ({
                  name: item.name,
                  path: item.path,
                  isDirectory: item.isDirectory,
                  isExpanded: false,
                  isLoading: false,
                  children: []
                }))
              }
            ]
            persistSession()
          }
        }

        // 显示导入结果提示
        const importedCount = data.imported.length
        const failedCount = data.failed.length
        if (failedCount > 0) {
          error.value = `导入完成：成功 ${importedCount} 个，失败 ${failedCount} 个`
        } else {
          console.log(`批量导入完成：${importedCount} 个文件`)
        }

        return true
      } else if (result.error === '用户取消') {
        return false
      } else {
        error.value = result.error || '批量导入失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '批量导入失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function exportMarkdown(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      const tab = activeTab.value
      if (!tab?.fileInfo?.path) {
        error.value = '请先保存文件'
        return false
      }

      const result = await window.electronAPI.exportMd(tab.fileInfo.path)

      if (result.success) {
        return true
      } else {
        error.value = result.error || '导出失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导出失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ================ 图片 / 资源管理 ================

  const imageCompressSettings = ref({
    enabled: true,
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1080
  })

  function setImageCompressSettings(settings: Partial<typeof imageCompressSettings.value>): void {
    imageCompressSettings.value = { ...imageCompressSettings.value, ...settings }
  }

  async function addImage(
    file: File,
    options?: { compress?: boolean; quality?: number; maxWidth?: number; maxHeight?: number }
  ): Promise<{ success: boolean; path?: string; asset?: MdxImageAsset; error?: string }> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) {
        return { success: false, error: '无法添加图片' }
      }

      const arrayBuffer = await file.arrayBuffer()

      const compressOptions = {
        compress: options?.compress ?? imageCompressSettings.value.enabled,
        quality: options?.quality ?? imageCompressSettings.value.quality,
        maxWidth: options?.maxWidth ?? imageCompressSettings.value.maxWidth,
        maxHeight: options?.maxHeight ?? imageCompressSettings.value.maxHeight
      }

      const result = await window.electronAPI.addImage(
        file.name,
        file.type,
        arrayBuffer,
        compressOptions,
        tab.fileInfo?.path || undefined
      )

      if (result.success && result.data) {
        const { asset, relativePath } = result.data as { asset: MdxImageAsset; relativePath: string }
        if (tab.fileInfo?.format !== 'markdown') tab.document.assets.images.push(asset)
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        scheduleRecoverySnapshot()
        return { success: true, path: relativePath, asset }
      } else {
        return { success: false, error: result.error || '添加图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加图片失败' }
    }
  }

  async function getImage(
    imagePath: string,
    filePath?: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      if (!window.electronAPI) {
        return { success: false, error: 'Electron API 不可用' }
      }

      const imageFilePath = filePath ?? activeTab.value?.fileInfo?.path ?? undefined
      const result = await window.electronAPI.getImage(imagePath, imageFilePath)
      if (result.success && result.data) {
        let byteArray: Uint8Array
        const bufferData = result.data.buffer as unknown

        if (bufferData instanceof Uint8Array) {
          byteArray = bufferData
        } else if (Array.isArray(bufferData)) {
          byteArray = new Uint8Array(bufferData)
        } else if (bufferData && typeof bufferData === 'object') {
          const bufferObj = bufferData as { type?: string; data?: number[] }
          if (bufferObj.data && Array.isArray(bufferObj.data)) {
            byteArray = new Uint8Array(bufferObj.data)
          } else {
            return { success: false, error: '图片数据格式不正确' }
          }
        } else {
          return { success: false, error: '图片数据格式不正确' }
        }

        let binary = ''
        for (let i = 0; i < byteArray.byteLength; i++) {
          binary += String.fromCharCode(byteArray[i])
        }
        const base64 = btoa(binary)
        const mimeType = result.data.mimeType || 'image/png'
        const dataUrl = `data:${mimeType};base64,${base64}`
        return { success: true, data: dataUrl }
      } else {
        return { success: false, error: result.error || '获取图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '获取图片失败' }
    }
  }

  async function removeAsset(assetId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) {
        return { success: false, error: '无法删除资源' }
      }

      const result = await window.electronAPI.removeAsset(assetId, tab.fileInfo?.path)
      if (result.success) {
        const imageIndex = tab.document.assets.images.findIndex((img) => img.id === assetId)
        if (imageIndex > -1) {
          tab.document.assets.images.splice(imageIndex, 1)
        }
        if (tab.document.assets.attachments) {
          const attIndex = tab.document.assets.attachments.findIndex((att) => att.id === assetId)
          if (attIndex > -1) {
            tab.document.assets.attachments.splice(attIndex, 1)
          }
        }
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        scheduleRecoverySnapshot()
        return { success: true }
      } else {
        return { success: false, error: result.error || '删除资源失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '删除资源失败' }
    }
  }

  async function refreshAssets(): Promise<boolean> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) return false

      const result = await window.electronAPI.listAssets(tab.fileInfo?.path)
      if (result.success && result.data) {
        tab.document.assets.images = result.data.images
        tab.document.assets.attachments = result.data.attachments
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function addAttachment(
    file: File
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) {
        return { success: false, error: '无法添加附件' }
      }

      const arrayBuffer = await file.arrayBuffer()
      const result = await window.electronAPI.addAttachment(file.name, file.type, arrayBuffer, tab.fileInfo?.path)

      if (result.success && result.data) {
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        scheduleRecoverySnapshot()
        const { relativePath } = result.data as { relativePath: string }
        return { success: true, path: relativePath }
      } else {
        return { success: false, error: result.error || '添加附件失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加附件失败' }
    }
  }

  function detectOrphanAssets(): Array<{
    id: string
    filename: string
    type: 'image' | 'attachment'
  }> {
    const tab = activeTab.value
    if (!tab?.document) return []

    const content = tab.content
    const orphans: Array<{ id: string; filename: string; type: 'image' | 'attachment' }> = []

    for (const image of tab.document.assets.images) {
      const imagePattern = new RegExp(`!\\[.*?\\]\\(${escapeRegExp(image.path)}\\)`, 'i')
      if (!imagePattern.test(content)) {
        orphans.push({ id: image.id, filename: image.filename, type: 'image' })
      }
    }

    if (tab.document.assets.attachments) {
      for (const attachment of tab.document.assets.attachments) {
        const linkPattern = new RegExp(`\\[.*?\\]\\(${escapeRegExp(attachment.path)}\\)`, 'i')
        if (!linkPattern.test(content)) {
          orphans.push({ id: attachment.id, filename: attachment.filename, type: 'attachment' })
        }
      }
    }

    return orphans
  }

  async function cleanupOrphanAssets(): Promise<{
    success: boolean
    removed: number
    error?: string
  }> {
    const orphans = detectOrphanAssets()
    let removed = 0

    for (const orphan of orphans) {
      const result = await removeAsset(orphan.id)
      if (result.success) removed++
    }

    return { success: true, removed }
  }

  function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async function renameImage(
    assetId: string,
    newFilename: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const tab = activeTab.value
      if (!tab?.document) {
        return { success: false, error: '没有打开的文档' }
      }

      const image = tab.document.assets.images.find((img) => img.id === assetId)
      if (!image) {
        return { success: false, error: '图片不存在' }
      }

      const oldPath = image.path
      const newPath = `assets/images/${newFilename}`

      image.filename = newFilename
      image.path = newPath

      const oldPattern = new RegExp(`(!\\[.*?\\]\\()${escapeRegExp(oldPath)}(\\))`, 'g')
      tab.content = tab.content.replace(oldPattern, `$1${newPath}$2`)
      tab.document.content = tab.content

      if (tab.fileInfo) {
        tab.fileInfo.modified = true
      }
      stateVersion.value++
      scheduleRecoverySnapshot()

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '重命名失败' }
    }
  }

  // ================ 文件夹浏览 ================

  async function openFolder(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      const dialogResult = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择文件夹'
      })

      if (!dialogResult.success || !dialogResult.data || dialogResult.data.length === 0) {
        return false
      }

      const dirPath = dialogResult.data[0]
      const success = await readFolder(dirPath)

      // 初始化文件树
      if (success) {
        const folderName = dirPath.split(/[/\\]/).pop() || dirPath
        fileTree.value = [
          {
            name: folderName,
            path: dirPath,
            isDirectory: true,
            isExpanded: true,
            isLoading: false,
            children: folderItems.value.map((item) => ({
              name: item.name,
              path: item.path,
              isDirectory: item.isDirectory,
              isExpanded: false,
              isLoading: false,
              children: []
            }))
          }
        ]
        persistSession()
      }

      return success
    } catch (err) {
      error.value = err instanceof Error ? err.message : '打开文件夹失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function readFolder(dirPath: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false

      const result = await window.electronAPI.readFolder(dirPath)
      if (result.success && result.data) {
        openedFolderPath.value = dirPath
        folderItems.value = result.data

        // 同步更新 fileTree 根节点的子节点，使侧边栏文件树即时刷新
        if (fileTree.value.length > 0 && fileTree.value[0].path === dirPath) {
          fileTree.value[0].children = result.data.map((item: FolderItem) => ({
            name: item.name,
            path: item.path,
            isDirectory: item.isDirectory,
            isExpanded: false,
            isLoading: false,
            children: []
          }))
        }

        return true
      }
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : '读取文件夹失败'
      return false
    }
  }

  /** 加载指定路径的子文件夹内容 */
  async function loadChildren(node: FileTreeNode): Promise<void> {
    if (!node.isDirectory || node.isLoading) return

    node.isLoading = true
    try {
      const result = await window.electronAPI?.readFolder(node.path)
      if (result?.success && result.data) {
        node.children = result.data.map((item: FolderItem) => ({
          name: item.name,
          path: item.path,
          isDirectory: item.isDirectory,
          isExpanded: false,
          isLoading: false,
          children: []
        }))
      }
    } catch {
      // 忽略错误
    } finally {
      node.isLoading = false
    }
  }

  /** 展开节点（如未加载则先加载） */
  async function expandNode(node: FileTreeNode): Promise<void> {
    node.isExpanded = true
    if (node.isDirectory && node.children.length === 0) {
      await loadChildren(node)
    }
  }

  /** 折叠节点 */
  function collapseNode(node: FileTreeNode): void {
    node.isExpanded = false
  }

  /** 切换展开/折叠状态 */
  async function toggleNode(node: FileTreeNode): Promise<void> {
    if (node.isExpanded) {
      collapseNode(node)
    } else {
      await expandNode(node)
    }
  }

  function closeFolder(): void {
    openedFolderPath.value = null
    folderItems.value = []
    folderHistory.value = []
    fileTree.value = []
    persistSession()
  }

  // 保留兼容的导航方法（内部自动转换为树操作）
  async function navigateToFolder(dirPath: string): Promise<boolean> {
    return await readFolder(dirPath)
  }

  async function navigateUp(): Promise<boolean> {
    if (!openedFolderPath.value) return false
    const parts = openedFolderPath.value.split(/[/\\]/)
    parts.pop()
    const parentPath = parts.join('/')
    if (!parentPath || parentPath === openedFolderPath.value) return false
    return await readFolder(parentPath)
  }

  // ================ 文件/文件夹 CRUD（上下文菜单） ================

  async function createFile(dirPath: string, name: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.createFile(dirPath, name)
      if (result.success && result.data?.path) {
        await readFolder(openedFolderPath.value!)
        return await openFile(result.data.path)
      }
      return false
    } catch {
      return false
    }
  }

  async function createFolder(parentPath: string, name: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.createFolder(parentPath, name)
      if (result.success) {
        await readFolder(openedFolderPath.value!)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function renameItem(oldPath: string, newName: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.renameFile(oldPath, newName)
      if (result.success) {
        // 更新所有匹配的 tab 中的 fileInfo
        for (const tab of tabs.value) {
          if (tab.fileInfo?.path === oldPath) {
            tab.fileInfo.path = result.data!.path
            tab.fileInfo.name = newName
          }
        }
        await readFolder(openedFolderPath.value!)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function deleteItem(targetPath: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.deleteFile(targetPath)
      if (result.success) {
        // 一次性移除匹配的 tab，避免编辑器收到删除过程中的中间状态
        const activeIndex = tabs.value.findIndex((tab) => tab.id === activeTabId.value)
        const matchingTabs = tabs.value.filter((tab) => tab.fileInfo?.path === targetPath)
        const matchingIds = new Set(matchingTabs.map((tab) => tab.id))
        const activeTabDeleted = matchingIds.has(activeTabId.value || '')

        if (matchingIds.size > 0) {
          tabs.value = tabs.value.filter((tab) => !matchingIds.has(tab.id))

          if (activeTabDeleted) {
            const nextIndex = activeIndex >= 0 ? Math.min(activeIndex, tabs.value.length - 1) : 0
            activeTabId.value = tabs.value[nextIndex]?.id ?? null
            editorResetVersion.value++
          }
          stateVersion.value++
          persistSession()
        }

        await readFolder(openedFolderPath.value!)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  function copyPath(filePath: string): void {
    try {
      navigator.clipboard.writeText(filePath)
    } catch {
      // 忽略
    }
  }

  // ================ 暴露的接口 ================

  return {
    // Tab 状态
    tabs,
    activeTabId,

    // 向后兼容的状态（computed proxy）
    currentFile,
    document,
    fileContent,

    // 编辑器状态
    editorMode,
    sidebarCollapsed,
    sidebarWidth,
    isLoading,
    error,
    recentFiles,
    wordCount,
    cursorLine,
    cursorColumn,
    editorResetVersion,
    autoSaveEnabled,
    autoSaveInterval,
    isAutoSaving,
    lastAutoSaveAt,
    autoSaveError,

    // 文件夹浏览
    openedFolderPath,
    folderItems,
    fileTree,

    // Getters
    hasFile,
    isModified,
    isDirty,
    fileName,
    displayTitle,
    imageAssets,
    imageCompressSettings,
    hasMultipleTabs,

    // Tab 操作
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    confirmSaveForTab,
    confirmSaveBeforeClose,
    revealInExplorer,

    // 向后兼容的写入操作
    setFile,
    setDocument,
    setContent,
    updateContent,
    markSaved,
    autoSave,
    startAutoSave,
    stopAutoSave,
    writeRecoverySnapshot,

    // 编辑器操作
    setEditorMode,
    toggleSidebar,
    setSidebarWidth,
    setCursorPosition,
    setImageCompressSettings,

    // 文件操作
    init,
    newFile,
    openFile,
    saveFile,
    saveAsFile,
    closeFile,
    confirmSaveDialog,
    confirmSaveBeforeAction,
    importMarkdown,
    importFolder,
    exportMarkdown,

    // 资源管理
    addImage,
    getImage,
    removeAsset,
    refreshAssets,
    addAttachment,
    detectOrphanAssets,
    cleanupOrphanAssets,
    renameImage,

    // 最近文件
    removeRecent,
    clearRecent,

    // 文件夹操作
    openFolder,
    readFolder,
    closeFolder,
    navigateToFolder,
    navigateUp,
    expandNode,
    collapseNode,
    toggleNode,
    loadChildren,

    // 上下文菜单操作
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    copyPath
  }
})
