import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { MdxDocument, MdxImageAsset } from '../types/mdx'

export type EditorMode = 'wysiwyg' | 'split' | 'source'

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
  const editorMode = ref<EditorMode>('wysiwyg')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const recentFiles = ref<string[]>([])
  const wordCount = ref(0)
  const cursorLine = ref(1)
  const cursorColumn = ref(1)

  // Getters
  const hasFile = computed(() => document.value !== null)
  const isModified = computed(() => currentFile.value?.modified ?? false)
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
  function init(): void {
    loadRecentFiles()
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
   * 加载最近文件列表
   */
  function loadRecentFiles(): void {
    try {
      const saved = localStorage.getItem('markdown-plus-recent-files')
      if (saved) {
        recentFiles.value = JSON.parse(saved)
      }
    } catch {
      recentFiles.value = []
    }
  }

  /**
   * 保存最近文件列表
   */
  function saveRecentFiles(): void {
    try {
      localStorage.setItem('markdown-plus-recent-files', JSON.stringify(recentFiles.value))
    } catch {
      // 忽略存储错误
    }
  }

  /**
   * 添加到最近文件
   */
  function addToRecent(filePath: string): void {
    const index = recentFiles.value.indexOf(filePath)
    if (index > -1) {
      recentFiles.value.splice(index, 1)
    }
    recentFiles.value.unshift(filePath)
    // 最多保留 10 个
    if (recentFiles.value.length > 10) {
      recentFiles.value = recentFiles.value.slice(0, 10)
    }
    saveRecentFiles()
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
        const path = result.data.filePath as string
        setDocument(doc, path)
        addToRecent(path)
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
        const path = result.data as string
        currentFile.value = {
          path,
          name: path.split(/[/\\]/).pop() || '未命名.mdx',
          modified: false
        }
        addToRecent(path)
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
        const path = result.data.filePath as string
        setDocument(doc, path)
        if (path) {
          addToRecent(path)
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

  /**
   * 添加图片到文档
   */
  async function addImage(file: File): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      if (!window.electronAPI || !document.value) {
        return { success: false, error: '无法添加图片' }
      }

      const arrayBuffer = await file.arrayBuffer()
      const result = await window.electronAPI.addImage(
        '',
        file.name,
        file.type,
        arrayBuffer
      )

      if (result.success && result.data) {
        // 更新文档中的资源列表
        const { asset } = result.data as { asset: MdxImageAsset; relativePath: string }
        document.value.assets.images.push(asset)
        return { success: true, path: asset.path }
      } else {
        return { success: false, error: result.error || '添加图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加图片失败' }
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
    fileName,
    displayTitle,
    imageAssets,
    // Actions
    init,
    setFile,
    setDocument,
    setContent,
    updateContent,
    markSaved,
    setEditorMode,
    setCursorPosition,
    newFile,
    openFile,
    saveFile,
    saveAsFile,
    closeFile,
    importMarkdown,
    exportMarkdown,
    addImage
  }
})
