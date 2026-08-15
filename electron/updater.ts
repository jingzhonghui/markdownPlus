import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { IPC_CHANNELS } from './ipc/channels'

/**
 * 发送给渲染进程的更新信息（最小化字段，避免传递不可序列化对象）
 */
export interface UpdateInfoPayload {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

export interface UpdateProgressPayload {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

/**
 * 是否启用自动更新：
 * - 仅打包后的生产环境可用（开发模式跳过）
 * - Linux 仅 AppImage 支持（deb 等通过系统包管理器更新）
 */
export function shouldEnableUpdater(
  isPackaged: boolean,
  platform: string,
  appImageEnv?: string
): boolean {
  if (!isPackaged) return false
  if (platform === 'linux') return Boolean(appImageEnv)
  return platform === 'win32' || platform === 'darwin'
}

// 简单的日志适配器（后续可替换为 electron-log 等）
autoUpdater.logger = {
  info: (...args: unknown[]) => console.info('[updater]', ...args),
  warn: (...args: unknown[]) => console.warn('[updater]', ...args),
  error: (...args: unknown[]) => console.error('[updater]', ...args),
  debug: (...args: unknown[]) => console.debug('[updater]', ...args)
}

let enabled = false
let initialized = false
let getWindow: (() => BrowserWindow | null) | null = null

function send(channel: string, payload?: unknown): void {
  const win = getWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

function toInfoPayload(info: UpdateInfo): UpdateInfoPayload {
  const releaseNotes =
    typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
  return {
    version: info.version,
    releaseNotes,
    releaseDate: info.releaseDate
  }
}

/**
 * 初始化自动更新：绑定事件并转发到渲染进程
 */
export function initUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  enabled = shouldEnableUpdater(app.isPackaged, process.platform, process.env['APPIMAGE'])

  if (!enabled) {
    console.info('[updater] auto-update disabled (dev mode or unsupported platform)')
    return
  }
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    send(IPC_CHANNELS.UPDATE.AVAILABLE, toInfoPayload(info))
  })
  autoUpdater.on('update-not-available', (info) => {
    send(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, toInfoPayload(info))
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const payload: UpdateProgressPayload = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }
    send(IPC_CHANNELS.UPDATE.PROGRESS, payload)
  })
  autoUpdater.on('update-downloaded', (info) => {
    send(IPC_CHANNELS.UPDATE.DOWNLOADED, toInfoPayload(info))
  })
  autoUpdater.on('error', (error) => {
    send(IPC_CHANNELS.UPDATE.ERROR, {
      message: error instanceof Error ? error.message : String(error)
    })
  })
}

/**
 * 检查更新（手动或启动时调用）
 */
export async function checkForUpdates(): Promise<{ success: boolean; error?: string }> {
  if (!enabled) {
    return { success: false, error: '当前环境不支持自动更新' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '检查更新失败'
    }
  }
}

/**
 * 下载更新（由用户在弹窗确认后触发）
 */
export async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  if (!enabled) {
    return { success: false, error: '当前环境不支持自动更新' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '下载更新失败'
    }
  }
}

/**
 * 退出并安装更新（调用前需确认无未保存修改）
 */
export function quitAndInstall(): void {
  if (!enabled) return
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true)
  })
}
