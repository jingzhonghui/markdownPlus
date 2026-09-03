import { ref, type Ref } from 'vue'
import type { PdfBatchProgress, PdfSource } from '../../types/pdf'
import type { TabInfo } from './types'
import { requestDialog } from '../../utils/dialog'
import { clearPdfView, preparePdfView } from '../../utils/pdf-export'
import { isEditableMarkdownFormat } from '../../types/mdx'

export interface PdfDeps {
  tabs: Ref<TabInfo[]>
  error: Ref<string | null>
}

function normalizeComparablePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  return navigator.userAgent.includes('Windows') ? normalized.toLowerCase() : normalized
}

/**
 * PDF 导出（单文件 / 文件夹批量）
 */
export function usePdf(deps: PdfDeps) {
  const { tabs, error } = deps

  const pdfBatchProgress = ref<PdfBatchProgress>({
    visible: false,
    running: false,
    total: 0,
    completed: 0,
    successCount: 0,
    currentFile: '',
    failures: []
  })

  function pdfSourceFromTab(tab: TabInfo): PdfSource {
    const filePath = tab.fileInfo?.path || ''
    const fileName = tab.fileInfo?.name || `${tab.document?.metadata.title || '未命名文档'}.mdx`
    return {
      filePath,
      fileName,
      title: tab.document?.metadata.title || fileName.replace(/\.(mdx|md)$/i, ''),
      format: tab.fileInfo?.format === 'markdown' ? 'markdown' : 'mdx',
      content: tab.content,
      images: {}
    }
  }

  async function loadPdfSource(filePath: string): Promise<PdfSource> {
    const normalizedPath = normalizeComparablePath(filePath)
    const openTab = tabs.value.find(
      (tab) => tab.fileInfo?.path && normalizeComparablePath(tab.fileInfo.path) === normalizedPath
    )
    if (openTab) return pdfSourceFromTab(openTab)

    const result = await window.electronAPI.readPdfSource(filePath)
    if (!result.success || !result.data) throw new Error(result.error || '读取文档失败')
    return result.data
  }

  async function printPdfSource(source: PdfSource, outputDir?: string, relativeSubdir?: string): Promise<string | null> {
    await preparePdfView(source)
    try {
      const result = await window.electronAPI.printPdf(source.fileName, outputDir, relativeSubdir)
      if (!result.success) {
        if (result.error === '用户取消') return null
        throw new Error(result.error || '导出 PDF 失败')
      }
      return result.data?.filePath || null
    } finally {
      clearPdfView()
    }
  }

  async function showPdfSuccess(filePath: string): Promise<void> {
    await requestDialog({
      title: '导出 PDF',
      message: 'PDF 导出成功',
      detail: filePath,
      buttons: [{ label: '确定', value: 0, primary: true }]
    })
  }

  async function exportTabToPdf(tabId: string): Promise<boolean> {
    const tab = tabs.value.find((item) => item.id === tabId)
    if (!tab?.document) return false
    if (!isEditableMarkdownFormat(tab.fileInfo?.format)) return false
    try {
      const outputPath = await printPdfSource(pdfSourceFromTab(tab))
      if (outputPath) {
        await showPdfSuccess(outputPath)
      }
      return outputPath !== null
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导出 PDF 失败'
      await window.electronAPI.showMessageBox({
        type: 'error',
        title: '导出 PDF 失败',
        message: error.value
      })
      return false
    }
  }

  async function exportFileToPdf(filePath: string): Promise<boolean> {
    try {
      const source = await loadPdfSource(filePath)
      const outputPath = await printPdfSource(source)
      if (outputPath) {
        await showPdfSuccess(outputPath)
      }
      return outputPath !== null
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导出 PDF 失败'
      await window.electronAPI.showMessageBox({
        type: 'error',
        title: '导出 PDF 失败',
        message: error.value
      })
      return false
    }
  }

  async function exportFolderToPdf(folderPath: string): Promise<boolean> {
    const listResult = await window.electronAPI.listPdfSources(folderPath)
    if (!listResult.success || !listResult.data) {
      error.value = listResult.error || '读取文件夹失败'
      return false
    }
    if (listResult.data.length === 0) {
      await window.electronAPI.showMessageBox({
        type: 'info',
        title: '批量导出 PDF',
        message: '当前文件夹中没有 .md 或 .mdx 文件'
      })
      return false
    }

    const directoryResult = await window.electronAPI.showOpenDialog({
      title: '选择 PDF 输出文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (!directoryResult.success || !directoryResult.data?.[0]) return false

    const outputDir = directoryResult.data[0]

    function dirname(p: string): string {
      const normalized = p.replace(/\\/g, '/')
      const idx = normalized.lastIndexOf('/')
      return idx === -1 ? '' : normalized.slice(0, idx)
    }

    pdfBatchProgress.value = {
      visible: true,
      running: true,
      total: listResult.data.length,
      completed: 0,
      successCount: 0,
      currentFile: '',
      failures: []
    }

    for (const entry of listResult.data) {
      const filePath = entry.absolutePath
      const relativeSubdir = dirname(entry.relativePath) || undefined
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      pdfBatchProgress.value.currentFile = entry.relativePath
      try {
        const source = await loadPdfSource(filePath)
        const outputPath = await printPdfSource(source, outputDir, relativeSubdir)
        if (outputPath) pdfBatchProgress.value.successCount += 1
      } catch (err) {
        pdfBatchProgress.value.failures.push({
          file: fileName,
          error: err instanceof Error ? err.message : '导出失败'
        })
      } finally {
        pdfBatchProgress.value.completed += 1
      }
    }

    pdfBatchProgress.value.running = false
    pdfBatchProgress.value.currentFile = ''
    return pdfBatchProgress.value.successCount > 0
  }

  function closePdfBatchProgress(): void {
    if (!pdfBatchProgress.value.running) pdfBatchProgress.value.visible = false
  }

  return {
    pdfBatchProgress,
    exportTabToPdf,
    exportFileToPdf,
    exportFolderToPdf,
    closePdfBatchProgress
  }
}
