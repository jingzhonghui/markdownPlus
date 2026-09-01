import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_CHANNELS } from './channels'
import { cleanupTempDir, openMdx } from '../mdx/reader'

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}

function toDataUrl(filePath: string): string {
  const mimeType = IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`
}

function isPathInside(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function uniquePdfPath(requestedPath: string): string {
  if (!fs.existsSync(requestedPath)) return requestedPath
  const directory = path.dirname(requestedPath)
  const extension = path.extname(requestedPath)
  const basename = path.basename(requestedPath, extension)
  let index = 1
  let candidate = path.join(directory, `${basename} (${index})${extension}`)
  while (fs.existsSync(candidate)) {
    index += 1
    candidate = path.join(directory, `${basename} (${index})${extension}`)
  }
  return candidate
}

interface PdfSourceEntry {
  absolutePath: string
  relativePath: string
}

function collectPdfSources(dirPath: string, basePath: string = dirPath): PdfSourceEntry[] {
  const results: PdfSourceEntry[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectPdfSources(fullPath, basePath))
    } else if (entry.isFile() && ['.md', '.mdx'].includes(path.extname(entry.name).toLowerCase())) {
      results.push({ absolutePath: fullPath, relativePath: path.relative(basePath, fullPath) })
    }
  }
  return results
}

function safePdfName(fileName: string): string {
  const basename = path.basename(fileName, path.extname(fileName)).replace(/[<>:"/\\|?*]/g, '_').trim()
  return `${basename || 'document'}.pdf`
}

export function registerPdfHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PDF.READ_SOURCE, async (_, filePath: string) => {
    try {
      const extension = path.extname(filePath).toLowerCase()
      if (extension === '.md' || extension === '.txt') {
        return {
          success: true,
          data: {
            filePath,
            fileName: path.basename(filePath),
            title: path.basename(filePath, extension),
            format: 'markdown' as const,
            content: fs.readFileSync(filePath, 'utf-8'),
            images: {}
          }
        }
      }
      if (extension !== '.mdx') return { success: false, error: '仅支持 .md 和 .mdx 文件' }

      const result = openMdx(filePath)
      if (!result.success || !result.data) return result
      const { document, tempDir } = result.data
      try {
        const images: Record<string, string> = {}
        for (const image of document.assets.images) {
          const imagePath = path.resolve(tempDir, image.path)
          if (isPathInside(tempDir, imagePath) && fs.existsSync(imagePath)) {
            images[image.path] = toDataUrl(imagePath)
          }
        }
        return {
          success: true,
          data: {
            filePath,
            fileName: path.basename(filePath),
            title: document.metadata.title || path.basename(filePath, extension),
            format: 'mdx' as const,
            content: document.content,
            images
          }
        }
      } finally {
        cleanupTempDir(tempDir)
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取 PDF 源文件失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PDF.LIST_FOLDER, async (_, folderPath: string) => {
    try {
      const entries = collectPdfSources(folderPath)
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true }))
      return { success: true, data: entries }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取文件夹失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PDF.PRINT, async (event, suggestedFileName: string, outputDir?: string, relativeSubdir?: string) => {
    try {
      let requestedPath: string
      if (outputDir) {
        const targetDir = relativeSubdir ? path.join(outputDir, relativeSubdir) : outputDir
        fs.mkdirSync(targetDir, { recursive: true })
        requestedPath = path.join(targetDir, safePdfName(suggestedFileName))
      } else {
        const window = BrowserWindow.fromWebContents(event.sender)
        const result = await dialog.showSaveDialog(window!, {
          title: '导出 PDF',
          defaultPath: safePdfName(suggestedFileName),
          filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return { success: false, error: '用户取消' }
        requestedPath = result.filePath.toLowerCase().endsWith('.pdf') ? result.filePath : `${result.filePath}.pdf`
      }

      const outputPath = outputDir ? uniquePdfPath(requestedPath) : requestedPath
      const pdf = await event.sender.printToPDF({
        pageSize: 'A4',
        landscape: false,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;font-size:8px;color:#8a8a8a;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        // Electron expects PDF margins in inches.
        margins: { top: 16 / 25.4, bottom: 16 / 25.4, left: 18 / 25.4, right: 18 / 25.4 },
        preferCSSPageSize: false
      })

      const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`
      try {
        fs.writeFileSync(temporaryPath, pdf)
        fs.renameSync(temporaryPath, outputPath)
      } finally {
        if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true })
      }
      return { success: true, data: { filePath: outputPath, size: pdf.byteLength } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '导出 PDF 失败' }
    }
  })
}
