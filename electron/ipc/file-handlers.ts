/**
 * 文件操作 IPC Handlers
 *
 * 处理文件对话框、最近文件列表等操作
 */

import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_CHANNELS } from './channels'

/** 最近文件列表上限 */
const MAX_RECENT_FILES = 20

/** 最近文件列表持久化文件路径 */
function getRecentFilesPath(): string {
  return path.join(app.getPath('userData'), 'recent-files.json')
}

/**
 * 从磁盘读取最近文件列表
 */
function loadRecentFilesFromDisk(): string[] {
  try {
    const filePath = getRecentFilesPath()
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      const files: string[] = JSON.parse(data)
      // 过滤掉不存在的文件
      return files.filter((p) => fs.existsSync(p))
    }
  } catch {
    // 读取失败返回空列表
  }
  return []
}

/**
 * 将最近文件列表写入磁盘
 */
function saveRecentFilesToDisk(files: string[]): void {
  try {
    const filePath = getRecentFilesPath()
    fs.writeFileSync(filePath, JSON.stringify(files, null, 2), 'utf-8')
  } catch {
    // 写入失败忽略
  }
}

/** 内存缓存 */
let recentFilesCache: string[] | null = null

/**
 * 获取最近文件列表（带缓存）
 */
function getRecentFiles(): string[] {
  if (!recentFilesCache) {
    recentFilesCache = loadRecentFilesFromDisk()
  }
  return [...recentFilesCache]
}

/**
 * 添加文件到最近列表
 */
export function addRecentFile(filePath: string): void {
  if (!recentFilesCache) {
    recentFilesCache = loadRecentFilesFromDisk()
  }
  // 规范化路径
  const normalized = path.resolve(filePath)
  // 移除已存在的相同路径
  recentFilesCache = recentFilesCache.filter((p) => p !== normalized)
  // 添加到开头
  recentFilesCache.unshift(normalized)
  // 限制数量
  if (recentFilesCache.length > MAX_RECENT_FILES) {
    recentFilesCache = recentFilesCache.slice(0, MAX_RECENT_FILES)
  }
  // 持久化
  saveRecentFilesToDisk(recentFilesCache)
}

/**
 * 从最近列表中移除文件
 */
function removeRecentFile(filePath: string): void {
  if (!recentFilesCache) {
    recentFilesCache = loadRecentFilesFromDisk()
  }
  const normalized = path.resolve(filePath)
  recentFilesCache = recentFilesCache.filter((p) => p !== normalized)
  saveRecentFilesToDisk(recentFilesCache)
}

/**
 * 清空最近文件列表
 */
function clearRecentFiles(): void {
  recentFilesCache = []
  saveRecentFilesToDisk(recentFilesCache)
}

/**
 * 注册文件操作 IPC handlers
 */
export function registerFileHandlers(): void {
  // 显示打开文件对话框
  ipcMain.handle(IPC_CHANNELS.DIALOG.SHOW_OPEN, async (_, options) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) {
      return { success: false, error: '没有活动的窗口' }
    }

    const defaultOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown+ 文件', extensions: ['mdx'] },
        { name: 'Markdown 文件', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }

    const result = await dialog.showOpenDialog(window, { ...defaultOptions, ...(options || {}) })

    if (result.canceled) {
      return { success: false, error: '用户取消' }
    }

    return {
      success: true,
      data: result.filePaths
    }
  })

  // 显示保存文件对话框
  ipcMain.handle(IPC_CHANNELS.DIALOG.SHOW_SAVE, async (_, options) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) {
      return { success: false, error: '没有活动的窗口' }
    }

    const defaultOptions = {
      filters: [
        { name: 'Markdown+ 文件', extensions: ['mdx'] },
        { name: 'Markdown 文件', extensions: ['md'] }
      ]
    }

    const result = await dialog.showSaveDialog(window, { ...defaultOptions, ...(options || {}) })

    if (result.canceled) {
      return { success: false, error: '用户取消' }
    }

    return {
      success: true,
      data: result.filePath
    }
  })

  // 显示消息对话框
  ipcMain.handle(IPC_CHANNELS.DIALOG.SHOW_MESSAGE, async (_, options) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) {
      return { success: false, error: '没有活动的窗口' }
    }

    const result = await dialog.showMessageBox(window, options || {})

    return {
      success: true,
      data: result.response
    }
  })

  // 获取最近文件列表
  ipcMain.handle(IPC_CHANNELS.FILE.RECENT, async () => {
    try {
      const recentFiles = getRecentFiles()
      return {
        success: true,
        data: recentFiles
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 添加到最近文件
  ipcMain.handle(IPC_CHANNELS.FILE.RECENT_ADD, async (_, filePath: string) => {
    try {
      addRecentFile(filePath)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 从最近文件中移除
  ipcMain.handle(IPC_CHANNELS.FILE.RECENT_REMOVE, async (_, filePath: string) => {
    try {
      removeRecentFile(filePath)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 清空最近文件列表
  ipcMain.handle(IPC_CHANNELS.FILE.RECENT_CLEAR, async () => {
    try {
      clearRecentFiles()
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 读取文件夹内容
  ipcMain.handle(IPC_CHANNELS.FOLDER.READ, async (_, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const items: Array<{ name: string; path: string; isDirectory: boolean }> = []

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          items.push({ name: entry.name, path: fullPath, isDirectory: true })
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (ext === '.mdx' || ext === '.md') {
            items.push({ name: entry.name, path: fullPath, isDirectory: false })
          }
        }
      }

      // 排序：文件夹在前，文件在后，各自按名称字母排序
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      return { success: true, data: items }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 创建新文件
  ipcMain.handle(IPC_CHANNELS.FILE.CREATE, async (_, { dirPath, name }: { dirPath: string; name: string }) => {
    try {
      const fullPath = path.join(dirPath, name)
      if (fs.existsSync(fullPath)) {
        return { success: false, error: '文件已存在' }
      }
      const ext = path.extname(fullPath).toLowerCase()
      if (ext === '.mdx') {
        // 创建空的 .mdx 文件（简单的 ZIP 结构）
        const AdmZip = await import('adm-zip')
        const zip = new AdmZip.default()
        const mdxJson = JSON.stringify({
          version: '1.0',
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          title: name.replace(/\.mdx$/i, ''),
          encoding: 'UTF-8',
          content_file: 'content.md',
          assets: { images: [] },
          settings: { editor_theme: 'default', preview_style: 'github' }
        }, null, 2)
        zip.addFile('mdx.json', Buffer.from(mdxJson, 'utf-8'))
        zip.addFile('content.md', Buffer.from('', 'utf-8'))
        zip.writeZip(fullPath)
      } else {
        // 普通的 .md 文件
        fs.writeFileSync(fullPath, '', 'utf-8')
      }
      return { success: true, data: { path: fullPath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 创建新文件夹
  ipcMain.handle(IPC_CHANNELS.FOLDER.CREATE, async (_, { parentPath, name }: { parentPath: string; name: string }) => {
    try {
      const fullPath = path.join(parentPath, name)
      if (fs.existsSync(fullPath)) {
        return { success: false, error: '文件夹已存在' }
      }
      fs.mkdirSync(fullPath, { recursive: true })
      return { success: true, data: { path: fullPath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 在系统文件管理器中打开文件所在位置
  ipcMain.handle(IPC_CHANNELS.FILE.REVEAL_IN_EXPLORER, async (_, filePath: string) => {
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 重命名文件/文件夹
  ipcMain.handle(IPC_CHANNELS.FILE.RENAME, async (_, { oldPath, newName }: { oldPath: string; newName: string }) => {
    try {
      const dir = path.dirname(oldPath)
      const newPath = path.join(dir, newName)
      if (fs.existsSync(newPath)) {
        return { success: false, error: '目标已存在' }
      }
      fs.renameSync(oldPath, newPath)
      return { success: true, data: { path: newPath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 删除文件/文件夹
  ipcMain.handle(IPC_CHANNELS.FILE.DELETE, async (_, { targetPath }: { targetPath: string }) => {
    try {
      const stat = fs.statSync(targetPath)
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(targetPath)
      }
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })
}
