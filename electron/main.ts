import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from './ipc/channels'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerMdxHandlers, cleanupAll, isCloseConfirmed, setCloseConfirmed, attachRecoveryAssetData } from './ipc/mdx-handlers'
import { registerPdfHandlers } from './ipc/pdf-handlers'
import { hadAbnormalExit, markAppRunning, readRecoverySnapshot, writeRecoverySnapshot, clearRecoverySnapshot } from './recovery'

/**
 * 创建主窗口
 */
function createWindow(): void {
  // 开发模式用项目根目录，生产模式用 out 的上级目录
  const iconPath = is.dev
    ? resolve(__dirname, '../../resources/icon.png')
    : join(__dirname, '../resources/icon.png')

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon: iconPath,
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

  // 拦截窗口关闭事件：始终通知渲染进程检查未保存的修改
  mainWindow.on('close', (e) => {
    if (isCloseConfirmed()) {
      setCloseConfirmed(false)
      return
    }
    e.preventDefault()
    mainWindow.webContents.send('app:confirm-close')
  })

  // 窗口控制 IPC handlers
  ipcMain.handle(IPC_CHANNELS.WINDOW.MINIMIZE, () => mainWindow.minimize())
  ipcMain.handle(IPC_CHANNELS.WINDOW.MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW.CLOSE, () => mainWindow.close())
  ipcMain.handle(IPC_CHANNELS.WINDOW.IS_MAXIMIZED, () => mainWindow.isMaximized())

  // 监听最大化状态变化，通知渲染进程
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW.UNMAXIMIZED)
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
  ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, () => {
    if (is.dev) return ''
    return app.getVersion()
  })
  ipcMain.handle(IPC_CHANNELS.APP.RECOVERY_STATUS, () => ({ success: true, data: { available: hadAbnormalExit() } }))
  ipcMain.handle(IPC_CHANNELS.APP.RECOVERY_READ, () => ({ success: true, data: readRecoverySnapshot() }))
  ipcMain.handle(IPC_CHANNELS.APP.RECOVERY_WRITE, (_, snapshot) => {
    try {
      writeRecoverySnapshot(attachRecoveryAssetData(snapshot))
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '写入恢复快照失败' }
    }
  })
  ipcMain.handle(IPC_CHANNELS.APP.RECOVERY_CLEAR, () => {
    clearRecoverySnapshot()
    return { success: true }
  })

  markAppRunning()

  // 注册文件操作 handlers
  registerFileHandlers()

  // 注册 MDX 操作 handlers
  registerMdxHandlers()

  // 注册 PDF 导出 handlers
  registerPdfHandlers()

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
