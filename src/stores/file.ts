import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export type EditorMode = 'wysiwyg' | 'split' | 'source'

export interface FileInfo {
  path: string
  name: string
  modified: boolean
}

/**
 * 文件状态管理 Store
 */
export const useFileStore = defineStore('file', () => {
  // State
  const currentFile = ref<FileInfo | null>(null)
  const fileContent = ref('')
  const editorMode = ref<EditorMode>('wysiwyg')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const recentFiles = ref<string[]>([])
  const wordCount = ref(0)
  const cursorLine = ref(1)
  const cursorColumn = ref(1)

  // Getters
  const hasFile = computed(() => currentFile.value !== null)
  const isModified = computed(() => currentFile.value?.modified ?? false)
  const fileName = computed(() => currentFile.value?.name ?? '未命名')
  const displayTitle = computed(() => {
    const name = fileName.value
    return isModified.value ? `${name} *` : name
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
   * 设置文件内容
   */
  function setContent(content: string): void {
    fileContent.value = content
    updateWordCount()
  }

  /**
   * 更新文件内容
   */
  function updateContent(content: string): void {
    fileContent.value = content
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
  async function newFile(): Promise<void> {
    // TODO: 检查当前文件是否已保存
    setFile({
      path: '',
      name: '未命名.mdx',
      modified: false
    })
    setContent('# 新建文档\n\n开始编写...')
  }

  /**
   * 打开文件
   */
  async function openFile(): Promise<boolean> {
    try {
      isLoading.value = true
      error.value = null
      
      // 调用 Electron API 打开文件
      if (window.electronAPI) {
        const result = await window.electronAPI.openFile()
        if (result.success && result.data) {
          // TODO: 解析返回的文件数据
          return true
        }
      }
      return false
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
    try {
      isLoading.value = true
      error.value = null
      
      if (window.electronAPI) {
        const result = await window.electronAPI.saveFile({
          content: fileContent.value
        })
        if (result.success) {
          markSaved()
          return true
        }
      }
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存文件失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    // State
    currentFile,
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
    // Actions
    init,
    setFile,
    setContent,
    updateContent,
    markSaved,
    setEditorMode,
    setCursorPosition,
    newFile,
    openFile,
    saveFile
  }
})
