/**
 * 文件操作 IPC Handlers
 *
 * 处理文件对话框、最近文件列表等操作
 */

import { ipcMain, dialog, BrowserWindow, app } from 'electron'
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
  ipcMain.handle('file:addRecent', async (_, filePath: string) => {
    try {
      addRecentFile(filePath)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 从最近文件中移除
  ipcMain.handle('file:removeRecent', async (_, filePath: string) => {
    try {
      removeRecentFile(filePath)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })

  // 清空最近文件列表
  ipcMain.handle('file:clearRecent', async () => {
    try {
      clearRecentFiles()
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: errorMessage }
    }
  })
}
