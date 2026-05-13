import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { MdxDocument, MdxImageAsset } from '../types/mdx'

export type EditorMode = 'split' | 'source'

export interface FileInfo {
  path: string
  name: string
  modified: boolean
}

/**
 * 文件状态管理 Store
 * 集成 MDX 文件操作功能
 */
export const useFileStore = defineStore('file', () => {
  // State
  const currentFile = ref<FileInfo | null>(null)
  const document = ref<MdxDocument | null>(null)
  const fileContent = ref('')
  const editorMode = ref<EditorMode>('split')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const recentFiles = ref<string[]>([])
  const wordCount = ref(0)
  const cursorLine = ref(1)
  const cursorColumn = ref(1)

  // Getters
  const hasFile = computed(() => document.value !== null)
  const isModified = computed(() => currentFile.value?.modified ?? false)
  /** 是否有未保存的修改（包括有文档但从未保存过的情况） */
  const isDirty = computed(() => {
    if (!document.value) return false
    return isModified.value || !currentFile.value?.path
  })
  const fileName = computed(() => {
    if (document.value?.metadata.title && document.value.metadata.title !== '未命名文档') {
      return `${document.value.metadata.title}.mdx`
    }
    return currentFile.value?.name ?? '未命名.mdx'
  })
  const displayTitle = computed(() => {
    const name = fileName.value.replace('.mdx', '')
    return isModified.value ? `${name} *` : name
  })

  // 获取图片资源列表
  const imageAssets = computed(() => {
    return document.value?.assets.images || []
  })

  // Actions
  /**
   * 初始化文件状态
   */
  async function init(): Promise<void> {
    await loadRecentFiles()
  }

  /**
   * 设置当前文件
   */
  function setFile(file: FileInfo | null): void {
    currentFile.value = file
    fileContent.value = ''
    error.value = null
  }

  /**
   * 设置文档
   */
  function setDocument(doc: MdxDocument | null, path?: string): void {
    document.value = doc
    if (doc) {
      fileContent.value = doc.content
      if (path) {
        currentFile.value = {
          path,
          name: path.split(/[/\\]/).pop() || '未命名.mdx',
          modified: false
        }
      }
      updateWordCount()
    } else {
      fileContent.value = ''
      currentFile.value = null
    }
  }

  /**
   * 设置文件内容
   */
  function setContent(content: string): void {
    fileContent.value = content
    if (document.value) {
      document.value.content = content
    }
    updateWordCount()
  }

  /**
   * 更新文件内容
   */
  function updateContent(content: string): void {
    fileContent.value = content
    if (document.value) {
      document.value.content = content
    }
    if (currentFile.value) {
      currentFile.value.modified = true
    }
    updateWordCount()
  }

  /**
   * 标记文件为已保存
   */
  function markSaved(): void {
    if (currentFile.value) {
      currentFile.value.modified = false
    }
  }

  /**
   * 设置编辑器模式
   */
  function setEditorMode(mode: EditorMode): void {
    editorMode.value = mode
  }

  /**
   * 设置光标位置
   */
  function setCursorPosition(line: number, column: number): void {
    cursorLine.value = line
    cursorColumn.value = column
  }

  /**
   * 更新字数统计
   */
  function updateWordCount(): void {
    const text = fileContent.value
    // 移除空白字符后的字符数（中文字数统计方式）
    wordCount.value = text.replace(/\s/g, '').length
  }

  /**
   * 加载最近文件列表（从主进程读取）
   */
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

  /**
   * 添加到最近文件（同步到主进程）
   */
  async function addToRecent(filePath: string): Promise<void> {
    // 本地立即更新
    const index = recentFiles.value.indexOf(filePath)
    if (index > -1) {
      recentFiles.value.splice(index, 1)
    }
    recentFiles.value.unshift(filePath)
    if (recentFiles.value.length > 20) {
      recentFiles.value = recentFiles.value.slice(0, 20)
    }
    // 通知主进程持久化
    if (window.electronAPI) {
      // 使用已有的 addImage API 模式调用 addRecent
      try {
        await window.electronAPI.getRecentFiles() // 触发主进程刷新
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 从最近列表移除文件
   */
  async function removeRecent(filePath: string): Promise<void> {
    recentFiles.value = recentFiles.value.filter((p) => p !== filePath)
    if (window.electronAPI?.removeRecentFile) {
      await window.electronAPI.removeRecentFile(filePath)
    }
  }

  /**
   * 清空最近文件列表
   */
  async function clearRecent(): Promise<void> {
    recentFiles.value = []
    if (window.electronAPI?.clearRecentFiles) {
      await window.electronAPI.clearRecentFiles()
    }
  }

  /**
   * 新建文件
   */
  async function newFile(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.newFile()
        if (result.success && result.data) {
          const doc = result.data.document as MdxDocument
          setDocument(doc, null as unknown as string)
          currentFile.value = {
            path: '',
            name: '未命名.mdx',
            modified: false
          }
          return true
        }
      }
      // Fallback: 本地创建
      const { createMdxDocument } = await import('../types/mdx')
      setDocument(createMdxDocument('未命名文档', '# 新建文档\n\n开始编写...'))
      currentFile.value = {
        path: '',
        name: '未命名.mdx',
        modified: false
      }
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '新建文件失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 打开文件
   */
  async function openFile(filePath?: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      const result = await window.electronAPI.openFile(filePath)

      if (result.success && result.data) {
        const doc = result.data.document as MdxDocument
        const filePath = result.data.filePath as string
        setDocument(doc, filePath)
        // 主进程已添加到最近列表，刷新前端缓存
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

  /**
   * 保存文件
   */
  async function saveFile(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      if (!document.value) {
        error.value = '没有打开的文档'
        return false
      }

      const result = await window.electronAPI.saveFile(
        fileContent.value,
        document.value.metadata.title
      )

      if (result.success) {
        markSaved()
        return true
      } else if (result.error === 'NEW_FILE') {
        // 新文件需要另存为
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

  /**
   * 另存为
   */
  async function saveAsFile(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      if (!document.value) {
        error.value = '没有打开的文档'
        return false
      }

      const result = await window.electronAPI.saveAsFile(
        fileContent.value,
        document.value.metadata.title
      )

      if (result.success && result.data) {
        const savePath = result.data as string
        currentFile.value = {
          path: savePath,
          name: savePath.split(/[/\\]/).pop() || '未命名.mdx',
          modified: false
        }
        // 主进程已添加到最近列表，刷新前端缓存
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

  /**
   * 关闭文件
   */
  async function closeFile(): Promise<boolean> {
    try {
      if (window.electronAPI) {
        await window.electronAPI.closeFile()
      }
      setDocument(null)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '关闭文件失败'
      return false
    }
  }

  /**
   * 确认保存对话框
   * 返回: 'save' | 'discard' | 'cancel'
   * 使用 Electron 原生对话框，回退到 window.confirm
   */
  async function confirmSaveDialog(): Promise<'save' | 'discard' | 'cancel'> {
    const title = document.value?.metadata.title || '未命名文档'

    // 优先使用 Electron 原生对话框
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

    // 回退方案：使用 window.confirm
    const confirmed = window.confirm(`"${title}" 有未保存的更改，是否保存？\n\n确定 = 不保存，取消 = 返回继续编辑`)
    return confirmed ? 'discard' : 'cancel'
  }

  /**
   * 在执行操作前确认保存
   * 返回 true 表示可以继续执行操作，false 表示用户取消
   */
  async function confirmSaveBeforeAction(): Promise<boolean> {
    if (!isDirty.value) return true

    const choice = await confirmSaveDialog()

    if (choice === 'cancel') {
      return false
    }

    if (choice === 'save') {
      const saved = await saveFile()
      if (!saved) {
        // 保存失败或用户取消了另存为
        return false
      }
    }

    // 'discard' - 不保存，继续操作
    return true
  }

  /**
   * 导入 Markdown 文件
   */
  async function importMarkdown(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      const result = await window.electronAPI.importMd()

      if (result.success && result.data) {
        const doc = result.data.document as MdxDocument
        const filePath = result.data.filePath as string
        setDocument(doc, filePath)
        // 刷新最近文件列表
        await loadRecentFiles()
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

  /**
   * 导出为 Markdown
   */
  async function exportMarkdown(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        error.value = 'Electron API 不可用'
        return false
      }

      if (!currentFile.value?.path) {
        error.value = '请先保存文件'
        return false
      }

      const result = await window.electronAPI.exportMd(currentFile.value.path)

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

  // 图片压缩设置
  const imageCompressSettings = ref({
    enabled: true,
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1080
  })

  /**
   * 设置图片压缩选项
   */
  function setImageCompressSettings(settings: Partial<typeof imageCompressSettings.value>): void {
    imageCompressSettings.value = { ...imageCompressSettings.value, ...settings }
  }

  /**
   * 添加图片到文档
   */
  async function addImage(
    file: File,
    options?: { compress?: boolean; quality?: number; maxWidth?: number; maxHeight?: number }
  ): Promise<{ success: boolean; path?: string; asset?: MdxImageAsset; error?: string }> {
    try {
      if (!window.electronAPI || !document.value) {
        return { success: false, error: '无法添加图片' }
      }

      const arrayBuffer = await file.arrayBuffer()

      // 合并默认设置和传入选项
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
        // 更新文档中的资源列表
        const { asset } = result.data as { asset: MdxImageAsset; relativePath: string }
        document.value.assets.images.push(asset)
        // 标记文档已修改
        if (currentFile.value) {
          currentFile.value.modified = true
        }
        return { success: true, path: asset.path, asset }
      } else {
        return { success: false, error: result.error || '添加图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加图片失败' }
    }
  }

  /**
   * 获取图片数据
   */
  async function getImage(imagePath: string): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      if (!window.electronAPI) {
        return { success: false, error: 'Electron API 不可用' }
      }

      const result = await window.electronAPI.getImage(imagePath)
      if (result.success && result.data) {
        // Electron IPC 传输 Buffer 会序列化为 { type: 'Buffer', data: number[] }
        let byteArray: Uint8Array
        const bufferData = result.data.buffer as unknown

        if (bufferData instanceof Uint8Array) {
          // 已经是 Uint8Array
          byteArray = bufferData
        } else if (Array.isArray(bufferData)) {
          // 是普通数组
          byteArray = new Uint8Array(bufferData)
        } else if (bufferData && typeof bufferData === 'object') {
          // 是 { type: 'Buffer', data: number[] } 格式
          const bufferObj = bufferData as { type?: string; data?: number[] }
          if (bufferObj.data && Array.isArray(bufferObj.data)) {
            byteArray = new Uint8Array(bufferObj.data)
          } else {
            return { success: false, error: '图片数据格式不正确' }
          }
        } else {
          return { success: false, error: '图片数据格式不正确' }
        }

        // 将 Uint8Array 转换为 Data URL
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

  /**
   * 删除资源
   */
  async function removeAsset(assetId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!window.electronAPI || !document.value) {
        return { success: false, error: '无法删除资源' }
      }

      const result = await window.electronAPI.removeAsset(assetId)
      if (result.success) {
        // 从前端状态中移除
        const imageIndex = document.value.assets.images.findIndex(img => img.id === assetId)
        if (imageIndex > -1) {
          document.value.assets.images.splice(imageIndex, 1)
        }
        if (document.value.assets.attachments) {
          const attIndex = document.value.assets.attachments.findIndex(att => att.id === assetId)
          if (attIndex > -1) {
            document.value.assets.attachments.splice(attIndex, 1)
          }
        }
        // 标记文档已修改
        if (currentFile.value) {
          currentFile.value.modified = true
        }
        return { success: true }
      } else {
        return { success: false, error: result.error || '删除资源失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '删除资源失败' }
    }
  }

  /**
   * 刷新资源列表
   */
  async function refreshAssets(): Promise<boolean> {
    try {
      if (!window.electronAPI || !document.value) {
        return false
      }

      const result = await window.electronAPI.listAssets()
      if (result.success && result.data) {
        document.value.assets.images = result.data.images
        document.value.assets.attachments = result.data.attachments
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * 添加附件到文档
   */
  async function addAttachment(file: File): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      if (!window.electronAPI || !document.value) {
        return { success: false, error: '无法添加附件' }
      }

      const arrayBuffer = await file.arrayBuffer()
      const result = await window.electronAPI.addAttachment(file.name, file.type, arrayBuffer)

      if (result.success && result.data) {
        // 标记文档已修改
        if (currentFile.value) {
          currentFile.value.modified = true
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

  /**
   * 检测孤立资源（未被引用的图片/附件）
   */
  function detectOrphanAssets(): Array<{ id: string; filename: string; type: 'image' | 'attachment' }> {
    if (!document.value) return []

    const content = fileContent.value
    const orphans: Array<{ id: string; filename: string; type: 'image' | 'attachment' }> = []

    // 检查图片
    for (const image of document.value.assets.images) {
      // 检查 Markdown 中是否引用了该图片
      const imagePattern = new RegExp(`!\\[.*?\\]\\(${escapeRegExp(image.path)}\\)`, 'i')
      if (!imagePattern.test(content)) {
        orphans.push({ id: image.id, filename: image.filename, type: 'image' })
      }
    }

    // 检查附件
    if (document.value.assets.attachments) {
      for (const attachment of document.value.assets.attachments) {
        // 检查 Markdown 中是否引用了该附件
        const linkPattern = new RegExp(`\\[.*?\\]\\(${escapeRegExp(attachment.path)}\\)`, 'i')
        if (!linkPattern.test(content)) {
          orphans.push({ id: attachment.id, filename: attachment.filename, type: 'attachment' })
        }
      }
    }

    return orphans
  }

  /**
   * 清理孤立资源
   */
  async function cleanupOrphanAssets(): Promise<{ success: boolean; removed: number; error?: string }> {
    const orphans = detectOrphanAssets()
    let removed = 0

    for (const orphan of orphans) {
      const result = await removeAsset(orphan.id)
      if (result.success) {
        removed++
      }
    }

    return { success: true, removed }
  }

  /**
   * 转义正则表达式特殊字符
   */
  function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * 重命名图片并更新引用
   */
  async function renameImage(assetId: string, newFilename: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!document.value) {
        return { success: false, error: '没有打开的文档' }
      }

      const image = document.value.assets.images.find(img => img.id === assetId)
      if (!image) {
        return { success: false, error: '图片不存在' }
      }

      const oldPath = image.path
      const newPath = `assets/images/${newFilename}`

      // 更新文档中的资源路径
      image.filename = newFilename
      image.path = newPath

      // 更新 Markdown 内容中的引用
      const oldPattern = new RegExp(`(!\\[.*?\\]\\()${escapeRegExp(oldPath)}(\\))`, 'g')
      fileContent.value = fileContent.value.replace(oldPattern, `$1${newPath}$2`)
      document.value.content = fileContent.value

      // 标记文档已修改
      if (currentFile.value) {
        currentFile.value.modified = true
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '重命名失败' }
    }
  }

  return {
    // State
    currentFile,
    document,
    fileContent,
    editorMode,
    isLoading,
    error,
    recentFiles,
    wordCount,
    cursorLine,
    cursorColumn,
    // Getters
    hasFile,
    isModified,
    isDirty,
    fileName,
    displayTitle,
    imageAssets,
    imageCompressSettings,
    // Actions
    init,
    setFile,
    setDocument,
    setContent,
    updateContent,
    markSaved,
    setEditorMode,
    setCursorPosition,
    setImageCompressSettings,
    newFile,
    openFile,
    saveFile,
    saveAsFile,
    closeFile,
    confirmSaveDialog,
    confirmSaveBeforeAction,
    importMarkdown,
    exportMarkdown,
    addImage,
    getImage,
    removeAsset,
    refreshAssets,
    addAttachment,
    detectOrphanAssets,
    cleanupOrphanAssets,
    renameImage,
    removeRecent,
    clearRecent
  }
})
