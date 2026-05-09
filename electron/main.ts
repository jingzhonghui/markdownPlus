import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerMdxHandlers, cleanupAll, getCurrentDocument, isCloseConfirmed, setCloseConfirmed } from './ipc/mdx-handlers'

/**
 * 创建主窗口
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 拦截窗口关闭事件：检查是否有未保存的修改
  mainWindow.on('close', (e) => {
    // 如果已确认关闭，直接放行
    if (isCloseConfirmed()) {
      setCloseConfirmed(false)
      return
    }

    const currentDoc = getCurrentDocument()
    if (currentDoc.isModified || (currentDoc.document && !currentDoc.filePath)) {
      // 有未保存的修改，阻止关闭并通知渲染进程
      e.preventDefault()
      mainWindow.webContents.send('app:confirm-close')
    }
  })

  // 根据开发/生产环境加载页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 应用生命周期管理
 */
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.markdown-plus.app')

  // 默认打开或关闭开发者工具（仅开发环境）
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC 测试通道
  ipcMain.handle('ping', () => 'pong')

  // 注册文件操作 handlers
  registerFileHandlers()

  // 注册 MDX 操作 handlers
  registerMdxHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 清理临时资源
  cleanupAll()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 应用退出前清理临时资源
  cleanupAll()
})
