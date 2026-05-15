import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { MdxDocument, MdxImageAsset } from '../types/mdx'

export type EditorMode = 'split' | 'source'

export interface FileInfo {
  path: string
  name: string
  modified: boolean
}

export interface FolderItem {
  name: string
  path: string
  isDirectory: boolean
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
  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null)
  const currentFile = computed<FileInfo | null>(() => activeTab.value?.fileInfo ?? null)
  const document = computed<MdxDocument | null>(() => activeTab.value?.document ?? null)
  const fileContent = computed<string>(() => activeTab.value?.content ?? '')

  // 编辑器状态
  const editorMode = ref<EditorMode>('split')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const recentFiles = ref<string[]>([])
  const wordCount = ref(0)
  const cursorLine = ref(1)
  const cursorColumn = ref(1)

  // 文件夹浏览状态
  const openedFolderPath = ref<string | null>(null)
  const folderItems = ref<FolderItem[]>([])
  const folderHistory = ref<string[]>([])

  // Getters
  const hasFile = computed(() => activeTab.value !== null && activeTab.value.document !== null)
  const isModified = computed(() => activeTab.value?.fileInfo?.modified ?? false)
  const isDirty = computed(() => {
    if (!activeTab.value?.document) return false
    return isModified.value || !activeTab.value?.fileInfo?.path
  })
  const fileName = computed(() => {
    const tab = activeTab.value
    if (!tab) return '未命名.mdx'
    if (tab.document?.metadata.title && tab.document.metadata.title !== '未命名文档') {
      return `${tab.document.metadata.title}.mdx`
    }
    return tab.fileInfo?.name ?? '未命名.mdx'
  })
  const displayTitle = computed(() => {
    const name = fileName.value.replace('.mdx', '')
    return isModified.value ? `${name} *` : name
  })
  const imageAssets = computed(() => {
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
  function setActiveTab(tabId: string): void {
    activeTabId.value = tabId
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

    if (window.electronAPI?.showMessageBox) {
      try {
        const result = await window.electronAPI.showMessageBox({
          type: 'warning',
          title: '保存更改',
          message: `是否将更改保存到"${title}"？`,
          detail: '如果不保存，你的更改将会丢失。',
          buttons: ['保存', '不保存', '取消'],
          defaultId: 0,
          cancelId: 2,
          noLink: true
        })
        if (result.success && result.data !== undefined) {
          const choice = result.data as number
          if (choice === 0) return 'save'
          if (choice === 1) return 'discard'
          return 'cancel'
        }
      } catch {
        // 回退到简单对话框
      }
    }

    const confirmed = window.confirm(
      `"${title}" 有未保存的更改，是否保存？\n\n确定 = 不保存，取消 = 返回继续编辑`
    )
    return confirmed ? 'discard' : 'cancel'
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

    // 如果关闭的是当前激活的 tab，切换到邻居
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const nextIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[nextIndex].id
      } else {
        activeTabId.value = null
      }
    }

    return true
  }

  // ================ 向后兼容的写入操作（代理到 activeTab） ================

  function setFile(file: FileInfo | null): void {
    const tab = activeTab.value
    if (!tab) return
    tab.fileInfo = file
    if (!file) tab.content = ''
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
          modified: false
        }
      }
      updateWordCount()
    } else {
      tab.content = ''
      tab.fileInfo = null
    }
  }

  function setContent(content: string): void {
    const tab = activeTab.value
    if (!tab) return
    tab.content = content
    if (tab.document) {
      tab.document.content = content
    }
    updateWordCount()
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
    updateWordCount()
  }

  function markSaved(): void {
    const tab = activeTab.value
    if (tab?.fileInfo) {
      tab.fileInfo.modified = false
    }
  }

  // ================ 其余状态操作 ================

  function setEditorMode(mode: EditorMode): void {
    editorMode.value = mode
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

  async function addToRecent(filePath: string): Promise<void> {
    const index = recentFiles.value.indexOf(filePath)
    if (index > -1) {
      recentFiles.value.splice(index, 1)
    }
    recentFiles.value.unshift(filePath)
    if (recentFiles.value.length > 20) {
      recentFiles.value = recentFiles.value.slice(0, 20)
    }
    if (window.electronAPI) {
      try {
        await window.electronAPI.getRecentFiles()
      } catch {
        // 忽略
      }
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
            modified: false
          }
          activeTabId.value = tab.id
          return true
        }
      }

      // Fallback: 本地创建
      const { createMdxDocument } = await import('../types/mdx')
      tab.document = createMdxDocument('未命名文档', '# 新建文档\n\n开始编写...')
      tab.content = tab.document.content
      tab.fileInfo = {
        path: '',
        name: '未命名.mdx',
        modified: false
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
          modified: false
        }
        activeTabId.value = tab.id

        await loadRecentFiles()
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

      const result = await window.electronAPI.saveFile(tab.content, tab.document.metadata.title)

      if (result.success) {
        markSaved()
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

      const result = await window.electronAPI.saveAsFile(tab.content, tab.document.metadata.title)

      if (result.success && result.data) {
        const savePath = result.data as string
        if (tab.fileInfo) {
          tab.fileInfo.path = savePath
          tab.fileInfo.name = savePath.split(/[/\\]/).pop() || '未命名.mdx'
          tab.fileInfo.modified = false
        } else {
          tab.fileInfo = {
            path: savePath,
            name: savePath.split(/[/\\]/).pop() || '未命名.mdx',
            modified: false
          }
        }
        await loadRecentFiles()
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
    return closeTab(activeTabId.value)
  }

  // ================ 保存确认对话框 ================

  async function confirmSaveDialog(): Promise<'save' | 'discard' | 'cancel'> {
    const tab = activeTab.value
    const title = tab?.document?.metadata.title || '未命名文档'

    if (window.electronAPI?.showMessageBox) {
      try {
        const result = await window.electronAPI.showMessageBox({
          type: 'warning',
          title: '保存更改',
          message: `是否将更改保存到"${title}"？`,
          detail: '如果不保存，你的更改将会丢失。',
          buttons: ['保存', '不保存', '取消'],
          defaultId: 0,
          cancelId: 2,
          noLink: true
        })
        if (result.success && result.data !== undefined) {
          const choice = result.data as number
          if (choice === 0) return 'save'
          if (choice === 1) return 'discard'
          return 'cancel'
        }
      } catch {
        // 回退
      }
    }

    const confirmed = window.confirm(
      `"${title}" 有未保存的更改，是否保存？\n\n确定 = 不保存，取消 = 返回继续编辑`
    )
    return confirmed ? 'discard' : 'cancel'
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
          modified: false
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
        compressOptions
      )

      if (result.success && result.data) {
        const { asset } = result.data as { asset: MdxImageAsset; relativePath: string }
        tab.document.assets.images.push(asset)
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        return { success: true, path: asset.path, asset }
      } else {
        return { success: false, error: result.error || '添加图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加图片失败' }
    }
  }

  async function getImage(
    imagePath: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      if (!window.electronAPI) {
        return { success: false, error: 'Electron API 不可用' }
      }

      const result = await window.electronAPI.getImage(imagePath)
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

      const result = await window.electronAPI.removeAsset(assetId)
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

      const result = await window.electronAPI.listAssets()
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
      const result = await window.electronAPI.addAttachment(file.name, file.type, arrayBuffer)

      if (result.success && result.data) {
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
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
      await readFolder(dirPath)
      return true
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
        return true
      }
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : '读取文件夹失败'
      return false
    }
  }

  function closeFolder(): void {
    openedFolderPath.value = null
    folderItems.value = []
    folderHistory.value = []
  }

  async function navigateToFolder(dirPath: string): Promise<boolean> {
    if (openedFolderPath.value) {
      folderHistory.value.push(openedFolderPath.value)
    }
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
      if (result.success) {
        await readFolder(openedFolderPath.value!)
        return true
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
        // 关闭所有匹配的 tab
        const matchingTabs = tabs.value.filter((t) => t.fileInfo?.path === targetPath)
        for (const mt of matchingTabs) {
          const idx = tabs.value.findIndex((t) => t.id === mt.id)
          if (idx !== -1) {
            tabs.value.splice(idx, 1)
            if (activeTabId.value === mt.id) {
              if (tabs.value.length > 0) {
                const nextIdx = Math.min(idx, tabs.value.length - 1)
                activeTabId.value = tabs.value[nextIdx].id
              } else {
                activeTabId.value = null
              }
            }
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
    isLoading,
    error,
    recentFiles,
    wordCount,
    cursorLine,
    cursorColumn,

    // 文件夹浏览
    openedFolderPath,
    folderItems,

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
    confirmSaveForTab,
    confirmSaveBeforeClose,

    // 向后兼容的写入操作
    setFile,
    setDocument,
    setContent,
    updateContent,
    markSaved,

    // 编辑器操作
    setEditorMode,
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

    // 上下文菜单操作
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    copyPath
  }
})
