/**
 * MDX 文件操作 IPC Handlers
 *
 * 处理 .mdx 文件的打开、保存、导入、导出等操作
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import { IPC_CHANNELS } from './channels'
import type { MdxDocument, MdxResult } from '../mdx/schema'
import { createMdxDocument } from '../mdx/schema'
import { openMdx, cleanupTempDir, calculateChecksum } from '../mdx/reader'
import { saveMdx, saveAsMdx, createMdx, validateFilePath } from '../mdx/writer'
import { importFromMarkdown, importAndSaveAsMdx } from '../mdx/import'
import { exportMdxFile, exportToMarkdown } from '../mdx/export'
import { addRecentFile as addRecent } from './file-handlers'

// 存储当前打开的文档信息
interface OpenedDocument {
  filePath: string | null
  tempDir: string | null
  document: MdxDocument | null
  isModified: boolean
}

const currentDoc: OpenedDocument = {
  filePath: null,
  tempDir: null,
  document: null,
  isModified: false
}

/**
 * 注册 MDX 操作 IPC handlers
 */
export function registerMdxHandlers(): void {
  // 创建新文件
  ipcMain.handle(IPC_CHANNELS.FILE.NEW, async () => {
    try {
      // 清理之前的临时目录
      if (currentDoc.tempDir) {
        cleanupTempDir(currentDoc.tempDir)
      }

      // 创建新的空白文档
      currentDoc.document = createMdxDocument('未命名文档', '')
      currentDoc.filePath = null
      currentDoc.tempDir = null
      currentDoc.isModified = false

      return {
        success: true,
        data: {
          document: currentDoc.document,
          isNew: true
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 打开文件
  ipcMain.handle(IPC_CHANNELS.FILE.OPEN, async (_, filePath?: string) => {
    try {
      let targetPath = filePath

      // 如果没有提供文件路径，显示打开对话框
      if (!targetPath) {
        const { dialog } = await import('electron')
        const window = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(window!, {
          properties: ['openFile'],
          filters: [
            { name: 'Markdown+ 文件', extensions: ['mdx'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '用户取消' }
        }
        targetPath = result.filePaths[0]
      }

      // 清理之前的临时目录
      if (currentDoc.tempDir) {
        cleanupTempDir(currentDoc.tempDir)
      }

      // 打开 MDX 文件
      const result = openMdx(targetPath)

      if (!result.success || !result.data) {
        return result
      }

      const { document, tempDir } = result.data

      // 更新当前文档状态
      currentDoc.document = document
      currentDoc.filePath = targetPath
      currentDoc.tempDir = tempDir
      currentDoc.isModified = false

      // 添加到最近文件列表
      addRecent(targetPath)

      return {
        success: true,
        data: {
          document,
          filePath: targetPath,
          isNew: false
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 保存文件
  ipcMain.handle(IPC_CHANNELS.FILE.SAVE, async (_, content: string, title?: string) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      // 更新文档内容
      currentDoc.document.content = content
      if (title) {
        currentDoc.document.metadata.title = title
      }

      // 如果是新文件，需要另存为
      if (!currentDoc.filePath) {
        return { success: false, error: 'NEW_FILE' }
      }

      // 准备资源数据
      const { prepareAssetsData } = await import('../mdx/writer')
      const assetsData = currentDoc.tempDir
        ? prepareAssetsData(currentDoc.tempDir, currentDoc.document)
        : undefined

      // 保存文件
      const result = await saveMdx(currentDoc.filePath, currentDoc.document, assetsData)

      if (result.success) {
        currentDoc.isModified = false
        addRecent(currentDoc.filePath)
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 另存为
  ipcMain.handle(IPC_CHANNELS.FILE.SAVE_AS, async (_, content?: string, title?: string) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      // 显示保存对话框
      const { dialog } = await import('electron')
      const window = BrowserWindow.getFocusedWindow()
      const defaultName = (title || currentDoc.document.metadata.title || '未命名文档') + '.mdx'
      const result = await dialog.showSaveDialog(window!, {
        defaultPath: defaultName,
        filters: [{ name: 'Markdown+ 文件', extensions: ['mdx'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '用户取消' }
      }
      let targetPath = result.filePath

      // 确保扩展名正确
      if (!targetPath.toLowerCase().endsWith('.mdx')) {
        targetPath += '.mdx'
      }

      // 验证文件路径
      const validation = validateFilePath(targetPath)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // 更新文档内容
      if (content) {
        currentDoc.document.content = content
      }
      if (title) {
        currentDoc.document.metadata.title = title
      }

      // 准备资源数据
      const { prepareAssetsData } = await import('../mdx/writer')
      const assetsData = currentDoc.tempDir
        ? prepareAssetsData(currentDoc.tempDir, currentDoc.document)
        : undefined

      // 保存文件
      const saveResult = await saveMdx(targetPath, currentDoc.document, assetsData)

      if (saveResult.success) {
        // 更新当前文档状态
        currentDoc.filePath = targetPath
        currentDoc.isModified = false

        // 添加到最近文件列表
        addRecent(targetPath)

        // 清理旧临时目录，打开新的
        if (currentDoc.tempDir) {
          cleanupTempDir(currentDoc.tempDir)
        }
        const openResult = openMdx(targetPath)
        if (openResult.success && openResult.data) {
          currentDoc.tempDir = openResult.data.tempDir
        }
      }

      return saveResult
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 关闭文件
  ipcMain.handle(IPC_CHANNELS.FILE.CLOSE, async () => {
    try {
      // 清理临时目录
      if (currentDoc.tempDir) {
        cleanupTempDir(currentDoc.tempDir)
      }

      // 重置状态
      currentDoc.document = null
      currentDoc.filePath = null
      currentDoc.tempDir = null
      currentDoc.isModified = false

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // MDX 读取（供前端直接调用）
  ipcMain.handle(IPC_CHANNELS.MDX.READ, async (_, filePath: string) => {
    return openMdx(filePath)
  })

  // MDX 写入（供前端直接调用）
  ipcMain.handle(IPC_CHANNELS.MDX.WRITE, async (_, filePath: string, document: MdxDocument) => {
    return saveMdx(filePath, document)
  })

  // 导入 Markdown
  ipcMain.handle(IPC_CHANNELS.MDX.IMPORT_MD, async (_, mdFilePath?: string, targetPath?: string) => {
    try {
      let sourcePath = mdFilePath
      let savePath = targetPath

      // 如果没有提供源文件路径，显示打开对话框
      if (!sourcePath) {
        const { dialog } = await import('electron')
        const window = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(window!, {
          properties: ['openFile'],
          filters: [
            { name: 'Markdown 文件', extensions: ['md'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '用户取消' }
        }
        sourcePath = result.filePaths[0]
      }

      // 如果没有提供目标路径，显示保存对话框
      if (!savePath) {
        const { dialog } = await import('electron')
        const window = BrowserWindow.getFocusedWindow()
        const defaultName = sourcePath!.split(/[/\\]/).pop()?.replace('.md', '.mdx') || '未命名文档.mdx'
        const result = await dialog.showSaveDialog(window!, {
          defaultPath: defaultName,
          filters: [{ name: 'Markdown+ 文件', extensions: ['mdx'] }]
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: '用户取消' }
        }
        savePath = result.filePath
      }

      // 确保扩展名正确
      if (!savePath.toLowerCase().endsWith('.mdx')) {
        savePath += '.mdx'
      }

      // 导入并保存
      const result = await importAndSaveAsMdx(savePath, sourcePath)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 导出为 Markdown
  ipcMain.handle(IPC_CHANNELS.MDX.EXPORT_MD, async (_, mdxFilePath: string, outputDir?: string) => {
    try {
      let targetDir = outputDir

      // 如果没有提供输出目录，显示选择对话框
      if (!targetDir) {
        const { dialog } = await import('electron')
        const window = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(window!, {
          properties: ['openDirectory'],
          title: '选择导出目录'
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '用户取消' }
        }
        targetDir = result.filePaths[0]
      }

      return await exportMdxFile(mdxFilePath, targetDir)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 获取当前文档状态
  ipcMain.handle('mdx:getCurrentStatus', () => {
    return {
      success: true,
      data: {
        filePath: currentDoc.filePath,
        isModified: currentDoc.isModified,
        title: currentDoc.document?.metadata.title || '未命名文档'
      }
    }
  })

  // 设置修改状态
  ipcMain.handle('mdx:setModified', (_, isModified: boolean) => {
    currentDoc.isModified = isModified
    return { success: true }
  })

  // 关闭确认完成：用户已处理完保存提示，可以关闭窗口
  ipcMain.handle(IPC_CHANNELS.APP.CLOSE_CONFIRMED, () => {
    setCloseConfirmed(true)
    // 触发窗口关闭
    const { BrowserWindow } = require('electron') as typeof import('electron')
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.close()
    }
    return { success: true }
  })

  // 添加图片资源
  ipcMain.handle('mdx:addImage', async (_, imagePath: string, filename: string, mimeType: string, data: ArrayBuffer) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      const { addImageAsset } = await import('../mdx/writer')
      const buffer = Buffer.from(data)
      const result = addImageAsset(currentDoc.document, filename, mimeType, buffer)

      // 如果有临时目录，写入图片文件
      if (currentDoc.tempDir) {
        const fs = await import('fs')
        const path = await import('path')
        const fullPath = path.join(currentDoc.tempDir, result.relativePath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, buffer)
      }

      return {
        success: true,
        data: {
          asset: result.asset,
          relativePath: result.relativePath
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 获取图片数据
  ipcMain.handle('mdx:getImage', async (_, imagePath: string) => {
    try {
      if (!currentDoc.tempDir) {
        return { success: false, error: '没有打开的文档' }
      }

      const fs = await import('fs')
      const path = await import('path')
      const fullPath = path.join(currentDoc.tempDir, imagePath)

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: '图片不存在' }
      }

      const data = fs.readFileSync(fullPath)
      return {
        success: true,
        data: {
          buffer: data,
          mimeType: path.extname(fullPath).toLowerCase()
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })
}

/**
 * 获取当前文档信息
 */
export function getCurrentDocument(): OpenedDocument {
  return { ...currentDoc }
}

/** 用户确认关闭后，标记可以关闭 */
let closeConfirmed = false

/**
 * 设置关闭确认标志
 */
export function setCloseConfirmed(value: boolean): void {
  closeConfirmed = value
}

/**
 * 获取关闭确认标志
 */
export function isCloseConfirmed(): boolean {
  return closeConfirmed
}

/**
 * 清理所有临时资源
 */
export function cleanupAll(): void {
  if (currentDoc.tempDir) {
    cleanupTempDir(currentDoc.tempDir)
  }
  currentDoc.document = null
  currentDoc.filePath = null
  currentDoc.tempDir = null
  currentDoc.isModified = false
}
