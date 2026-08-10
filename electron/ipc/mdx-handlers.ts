/**
 * MDX 文件操作 IPC Handlers
 *
 * 处理 .mdx 文件的打开、保存、导入、导出等操作
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { IPC_CHANNELS } from './channels'
import type { MdxDocument } from '../mdx/schema'
import { createMdxDocument } from '../mdx/schema'
import { openMdx, cleanupTempDir, cleanupAllTempDirs } from '../mdx/reader'
import { saveMdx, validateFilePath } from '../mdx/writer'
import { importAndSaveAsMdx } from '../mdx/import'
import { exportMdxFile } from '../mdx/export'
import { addRecentFile as addRecent } from './file-handlers'

// 存储当前打开的文档信息
interface OpenedDocument {
  filePath: string | null
  tempDir: string | null
  document: MdxDocument | null
  isModified: boolean
  format: 'mdx' | 'markdown'
}

const currentDoc: OpenedDocument = {
  filePath: null,
  tempDir: null,
  document: null,
  isModified: false,
  format: 'mdx'
}

// 多标签页共用同一个主进程，通过文件路径定位各文档的资源目录
const tempDirsByFile = new Map<string, string>()

function normalizeFilePath(filePath: string): string {
  return path.normalize(path.resolve(filePath))
}

function registerTempDir(filePath: string, tempDir: string): void {
  tempDirsByFile.set(normalizeFilePath(filePath), tempDir)
}

/**
 * 注册 MDX 操作 IPC handlers
 */
export function registerMdxHandlers(): void {
  // 创建新文件
  ipcMain.handle(IPC_CHANNELS.FILE.NEW, async () => {
    try {
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
            { name: 'Markdown 文件', extensions: ['md'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '用户取消' }
        }
        targetPath = result.filePaths[0]
      }

      const isMarkdown = path.extname(targetPath).toLowerCase() === '.md'
      if (isMarkdown) {
        const content = fs.readFileSync(targetPath, 'utf-8')
        const document = createMdxDocument(path.basename(targetPath, path.extname(targetPath)), content)
        currentDoc.document = document
        currentDoc.filePath = targetPath
        currentDoc.tempDir = null
        currentDoc.format = 'markdown'
        currentDoc.isModified = false
        addRecent(targetPath)
        return {
          success: true,
          data: { document, filePath: targetPath, format: 'markdown', isNew: false }
        }
      }

      // 打开 MDX 文件
      // createTempDirForFile 会自动清理并重建该文件对应的临时目录
      const result = openMdx(targetPath)

      if (!result.success || !result.data) {
        return result
      }

      const { document, tempDir } = result.data

      // 更新当前文档状态
      currentDoc.document = document
      currentDoc.filePath = targetPath
      currentDoc.tempDir = tempDir
      currentDoc.format = 'mdx'
      currentDoc.isModified = false
      registerTempDir(targetPath, tempDir)

      // 添加到最近文件列表
      addRecent(targetPath)

      return {
        success: true,
        data: {
          document,
          filePath: targetPath,
          format: 'mdx',
          isNew: false
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 保存文件
  ipcMain.handle(IPC_CHANNELS.FILE.SAVE, async (_, content: string, title?: string, filePath?: string) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      // 更新文档内容
      currentDoc.document.content = content
      if (title) {
        currentDoc.document.metadata.title = title
      }

      const targetPath = filePath || currentDoc.filePath
      if (targetPath && path.extname(targetPath).toLowerCase() === '.md') {
        fs.writeFileSync(targetPath, content, 'utf-8')
        currentDoc.isModified = false
        addRecent(targetPath)
        return { success: true, data: targetPath }
      }

      // 如果是新文件，需要另存为
      if (!targetPath) {
        return { success: false, error: 'NEW_FILE' }
      }

      if (filePath && normalizeFilePath(filePath) !== normalizeFilePath(currentDoc.filePath || '')) {
        const openResult = openMdx(filePath)
        if (!openResult.success || !openResult.data) return openResult
        currentDoc.document = openResult.data.document
        currentDoc.tempDir = openResult.data.tempDir
        currentDoc.filePath = filePath
        currentDoc.format = 'mdx'
        registerTempDir(filePath, openResult.data.tempDir)
        currentDoc.document.content = content
        if (title) currentDoc.document.metadata.title = title
      }

      // 准备资源数据
      const { prepareAssetsData } = await import('../mdx/writer')
      const assetsData = currentDoc.tempDir
        ? prepareAssetsData(currentDoc.tempDir, currentDoc.document)
        : undefined

      // 保存文件
      const result = await saveMdx(targetPath, currentDoc.document, assetsData)

      if (result.success) {
        currentDoc.isModified = false
        addRecent(targetPath)
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 另存为
  ipcMain.handle(IPC_CHANNELS.FILE.SAVE_AS, async (_, content?: string, title?: string, sourcePath?: string) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      // 显示保存对话框
      const { dialog } = await import('electron')
      const window = BrowserWindow.getFocusedWindow()
      const sourceExtension = sourcePath && path.extname(sourcePath).toLowerCase() === '.md' ? '.md' : '.mdx'
      const defaultName = (title || currentDoc.document.metadata.title || '未命名文档') + sourceExtension
      const result = await dialog.showSaveDialog(window!, {
        defaultPath: defaultName,
        filters: [
          { name: 'Markdown+ 文件', extensions: ['mdx'] },
          { name: 'Markdown 文件', extensions: ['md'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '用户取消' }
      }
      let targetPath = result.filePath

      const targetIsMarkdown = path.extname(targetPath).toLowerCase() === '.md'
      if (!targetIsMarkdown && !targetPath.toLowerCase().endsWith('.mdx')) targetPath += '.mdx'

      // 验证文件路径
      const validation = targetIsMarkdown
        ? { valid: !/[<>:"|?*]/.test(path.basename(targetPath)), error: '文件名包含非法字符' }
        : validateFilePath(targetPath)
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

      if (sourcePath && path.extname(sourcePath).toLowerCase() === '.mdx' && fs.existsSync(sourcePath)) {
        const sourceResult = openMdx(sourcePath)
        if (!sourceResult.success || !sourceResult.data) return sourceResult
        currentDoc.document = sourceResult.data.document
        currentDoc.tempDir = sourceResult.data.tempDir
        currentDoc.document.content = content || ''
        if (title) currentDoc.document.metadata.title = title
      } else if (sourcePath && path.extname(sourcePath).toLowerCase() === '.md') {
        currentDoc.document = createMdxDocument(title || path.basename(sourcePath, '.md'), content || '')
        currentDoc.tempDir = null
      }

      if (targetIsMarkdown) {
        fs.writeFileSync(targetPath, currentDoc.document.content, 'utf-8')
        currentDoc.filePath = targetPath
        currentDoc.format = 'markdown'
        currentDoc.tempDir = null
        currentDoc.isModified = false
        addRecent(targetPath)
        return { success: true, data: targetPath }
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
        currentDoc.format = 'mdx'
        currentDoc.isModified = false

        // 添加到最近文件列表
        addRecent(targetPath)

        // 重新打开以更新临时目录（createTempDirForFile 会自动清理并重建）
        const openResult = openMdx(targetPath)
        if (openResult.success && openResult.data) {
          currentDoc.tempDir = openResult.data.tempDir
          registerTempDir(targetPath, openResult.data.tempDir)
        }
      }

      return saveResult.success
        ? { ...saveResult, data: targetPath }
        : saveResult
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
      currentDoc.format = 'mdx'

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

  // 从文件夹批量导入 Markdown
  ipcMain.handle(IPC_CHANNELS.MDX.IMPORT_FOLDER, async (_, sourceFolder?: string, targetFolder?: string) => {
    try {
      let sourceDir = sourceFolder
      let targetDir = targetFolder

      // 选择源文件夹
      if (!sourceDir) {
        const { dialog } = await import('electron')
        const window = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(window!, {
          properties: ['openDirectory'],
          title: '选择要导入的 Markdown 文件夹'
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '用户取消' }
        }
        sourceDir = result.filePaths[0]
      }

      // 选择目标文件夹
      if (!targetDir) {
        const { dialog } = await import('electron')
        const window = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(window!, {
          properties: ['openDirectory'],
          title: '选择保存 .mdx 文件的目标文件夹'
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '用户取消' }
        }
        targetDir = result.filePaths[0]
      }

      // 递归扫描所有 .md 文件
      const fs = await import('fs')
      const path = await import('path')

      function findMarkdownFiles(dir: string, baseDir: string): Array<{ relativePath: string; fullPath: string }> {
        const results: Array<{ relativePath: string; fullPath: string }> = []
        const entries = fs.readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            results.push(...findMarkdownFiles(fullPath, baseDir))
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            const relativePath = path.relative(baseDir, fullPath)
            results.push({ relativePath, fullPath })
          }
        }

        return results
      }

      const mdFiles = findMarkdownFiles(sourceDir, sourceDir)

      if (mdFiles.length === 0) {
        return { success: false, error: '所选文件夹中没有找到 Markdown 文件' }
      }

      const imported: Array<{ source: string; target: string }> = []
      const failed: Array<{ source: string; error: string }> = []

      for (const { relativePath, fullPath } of mdFiles) {
        // 计算目标路径：保持相对目录结构，将 .md 替换为 .mdx
        const relativeDir = path.dirname(relativePath)
        const baseName = path.basename(relativePath, '.md')
        const targetSubDir = path.join(targetDir, relativeDir)
        let targetFilePath = path.join(targetSubDir, `${baseName}.mdx`)

        // 确保目标子目录存在
        fs.mkdirSync(targetSubDir, { recursive: true })

        // 处理同名冲突
        if (fs.existsSync(targetFilePath)) {
          let counter = 1
          while (fs.existsSync(path.join(targetSubDir, `${baseName}_${counter}.mdx`))) {
            counter++
          }
          targetFilePath = path.join(targetSubDir, `${baseName}_${counter}.mdx`)
        }

        // 导入并保存为 .mdx
        const importResult = await importAndSaveAsMdx(targetFilePath, fullPath)

        if (importResult.success) {
          imported.push({ source: fullPath, target: targetFilePath })
        } else {
          failed.push({ source: fullPath, error: importResult.error || '导入失败' })
        }
      }

      return {
        success: true,
        data: {
          imported,
          failed,
          sourceDir,
          targetDir
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: `批量导入失败: ${errorMessage}` }
    }
  })

  // 导入 Markdown
  ipcMain.handle(IPC_CHANNELS.MDX.IMPORT_MD, async (_, mdFilePath?: string, targetFolder?: string) => {
    try {
      let sourcePath = mdFilePath

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

      // 确定保存路径
      let savePath: string

      if (targetFolder) {
        // 已打开文件夹：自动生成保存路径，跳过保存对话框
        const fs = await import('fs')
        const baseName = path.basename(sourcePath!, '.md')
        let candidatePath = path.join(targetFolder, `${baseName}.mdx`)

        // 处理同名冲突
        if (fs.existsSync(candidatePath)) {
          let counter = 1
          while (fs.existsSync(path.join(targetFolder, `${baseName}_${counter}.mdx`))) {
            counter++
          }
          candidatePath = path.join(targetFolder, `${baseName}_${counter}.mdx`)
        }
        savePath = candidatePath
      } else {
        // 未打开文件夹：显示保存对话框让用户选择
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
      const importResult = await importAndSaveAsMdx(savePath, sourcePath)

      if (importResult.success && importResult.data) {
        // 更新当前文档状态
        currentDoc.document = importResult.data.document
        currentDoc.filePath = savePath
        currentDoc.tempDir = importResult.data.tempDir
        currentDoc.isModified = false
        registerTempDir(savePath, importResult.data.tempDir)

        addRecent(savePath)

        return {
          success: true,
          data: {
            document: importResult.data.document,
            filePath: savePath
          }
        }
      }

      return importResult
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
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.close()
    }
    return { success: true }
  })

  // 添加图片资源
  ipcMain.handle(IPC_CHANNELS.MDX.ADD_IMAGE, async (_, filename: string, mimeType: string, data: ArrayBuffer, options?: { compress?: boolean; quality?: number; maxWidth?: number; maxHeight?: number }, filePath?: string) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      let buffer: Buffer<ArrayBufferLike> = Buffer.from(data)

      // 如果需要压缩，调用压缩功能
      if (options?.compress) {
        try {
          const sharp = await import('sharp')
          let sharpInstance = sharp.default(buffer)

          // 调整尺寸
          if (options.maxWidth || options.maxHeight) {
            sharpInstance = sharpInstance.resize(options.maxWidth, options.maxHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
          }

          // 根据 MIME 类型选择压缩格式
          const quality = options.quality ?? 85
          if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
            buffer = await sharpInstance.jpeg({ quality }).toBuffer()
          } else if (mimeType === 'image/png') {
            // PNG 使用自适应质量
            buffer = await sharpInstance.png({ quality }).toBuffer()
          } else if (mimeType === 'image/webp') {
            buffer = await sharpInstance.webp({ quality }).toBuffer()
          }
        } catch {
          // sharp 不可用或压缩失败，使用原始数据
          console.warn('图片压缩失败，使用原始数据')
        }
      }

       const safeFilename = path.basename(filename).replace(/[<>:"|?*]/g, '_') || `image-${Date.now()}.png`
       const { addImageAsset } = await import('../mdx/writer')
       const result = addImageAsset(currentDoc.document, safeFilename, mimeType, buffer)

       const markdownPath = filePath && path.extname(filePath).toLowerCase() === '.md' ? filePath : null
       const assetsDir = markdownPath
         ? path.join(path.dirname(markdownPath), `${path.basename(markdownPath, path.extname(markdownPath))}.assets`)
         : null
       let markdownFilename = safeFilename
       if (assetsDir) {
         const extension = path.extname(safeFilename)
         const baseName = path.basename(safeFilename, extension)
         let counter = 1
         while (fs.existsSync(path.join(assetsDir, markdownFilename))) {
           markdownFilename = `${baseName}-${counter++}${extension}`
         }
       }
       const imagePath = assetsDir
         ? path.join(assetsDir, markdownFilename)
         : currentDoc.tempDir
           ? path.join(currentDoc.tempDir, result.relativePath)
           : null
       if (imagePath) {
         fs.mkdirSync(path.dirname(imagePath), { recursive: true })
         fs.writeFileSync(imagePath, buffer)
       }

       const markdownImagePath = markdownPath
         ? path.relative(path.dirname(markdownPath), imagePath!).replace(/\\/g, '/')
         : result.asset.path

      // 标记文档已修改
      currentDoc.isModified = true

      return {
        success: true,
        data: {
          asset: result.asset,
          relativePath: markdownImagePath
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 获取图片数据
  ipcMain.handle(IPC_CHANNELS.MDX.GET_IMAGE, async (_, imagePath: string, filePath?: string) => {
    try {
       const isMarkdown = filePath ? path.extname(filePath).toLowerCase() === '.md' : currentDoc.format === 'markdown'
       const tempDir = filePath
         ? tempDirsByFile.get(normalizeFilePath(filePath))
         : currentDoc.tempDir
       const baseDir = filePath ? path.dirname(filePath) : path.dirname(currentDoc.filePath || '')
       if (!tempDir && !isMarkdown) {
        return { success: false, error: '没有打开的文档' }
      }

       const fullPath = isMarkdown
         ? path.resolve(baseDir, imagePath)
         : path.join(tempDir!, imagePath)

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: '图片不存在' }
      }

      const data = fs.readFileSync(fullPath)
      const ext = path.extname(fullPath).toLowerCase()
      // 将文件扩展名映射为正确的 MIME 类型
      const mimeTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
      }
      const mimeType = mimeTypeMap[ext] || 'image/png'
      return {
        success: true,
        data: {
          buffer: data,
          mimeType
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 添加附件资源
  ipcMain.handle(IPC_CHANNELS.MDX.ADD_ATTACHMENT, async (_, filename: string, mimeType: string, data: ArrayBuffer) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      const buffer = Buffer.from(data)
      const { addAttachmentAsset } = await import('../mdx/writer')
      const result = addAttachmentAsset(currentDoc.document, filename, mimeType, buffer)

      // 如果有临时目录，写入附件文件
      if (currentDoc.tempDir) {
        const fs = await import('fs')
        const path = await import('path')
        const fullPath = path.join(currentDoc.tempDir, result.relativePath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, buffer)
      }

      // 标记文档已修改
      currentDoc.isModified = true

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

  // 获取附件数据
  ipcMain.handle(IPC_CHANNELS.MDX.GET_ATTACHMENT, async (_, attachmentPath: string) => {
    try {
      if (!currentDoc.tempDir) {
        return { success: false, error: '没有打开的文档' }
      }

      const fs = await import('fs')
      const path = await import('path')
      const fullPath = path.join(currentDoc.tempDir, attachmentPath)

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: '附件不存在' }
      }

      const data = fs.readFileSync(fullPath)
      const ext = path.extname(fullPath).toLowerCase()
      // 将文件扩展名映射为正确的 MIME 类型
      const mimeTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.zip': 'application/zip'
      }
      const mimeType = mimeTypeMap[ext] || 'application/octet-stream'
      return {
        success: true,
        data: {
          buffer: data,
          mimeType
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 删除资源
  ipcMain.handle(IPC_CHANNELS.MDX.REMOVE_ASSET, async (_, assetId: string) => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      const { removeAsset } = await import('../mdx/writer')
      const removed = removeAsset(currentDoc.document, assetId)

      if (removed) {
        // 标记文档已修改
        currentDoc.isModified = true
        return { success: true }
      } else {
        return { success: false, error: '资源不存在' }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 列出所有资源
  ipcMain.handle(IPC_CHANNELS.MDX.LIST_ASSETS, async () => {
    try {
      if (!currentDoc.document) {
        return { success: false, error: '没有打开的文档' }
      }

      const { listAssets } = await import('../mdx/reader')
      const assets = listAssets(currentDoc.document)

      return {
        success: true,
        data: {
          images: currentDoc.document.assets.images,
          attachments: currentDoc.document.assets.attachments || [],
          all: assets
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
  // 清理所有临时目录
  cleanupAllTempDirs()

  currentDoc.document = null
  currentDoc.filePath = null
  currentDoc.tempDir = null
  currentDoc.isModified = false
}
