/**
 * 文件操作 IPC Handlers
 *
 * 处理文件对话框、最近文件列表等操作
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_CHANNELS } from './channels'

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
}

// 存储最近文件列表（实际应用中应该使用 electron-store 或配置文件）
const MAX_RECENT_FILES = 10
let recentFilesCache: string[] = []

/**
 * 获取最近文件列表
 */
function getRecentFiles(): string[] {
  // 过滤掉不存在的文件
  recentFilesCache = recentFilesCache.filter(filePath => fs.existsSync(filePath))
  return [...recentFilesCache]
}

/**
 * 添加文件到最近列表
 */
function addRecentFile(filePath: string): void {
  // 移除已存在的相同路径
  recentFilesCache = recentFilesCache.filter(p => p !== filePath)
  // 添加到开头
  recentFilesCache.unshift(filePath)
  // 限制数量
  if (recentFilesCache.length > MAX_RECENT_FILES) {
    recentFilesCache = recentFilesCache.slice(0, MAX_RECENT_FILES)
  }
}

/**
 * 从最近列表中移除文件
 */
export function removeRecentFile(filePath: string): void {
  recentFilesCache = recentFilesCache.filter(p => p !== filePath)
}

/**
 * 清空最近文件列表
 */
export function clearRecentFiles(): void {
  recentFilesCache = []
}
