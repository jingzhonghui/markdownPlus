import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'

export { IPC_CHANNELS }

// 文件夹条目类型
export interface FolderItem {
  name: string
  path: string
  isDirectory: boolean
}

// 图片压缩选项
export interface ImageCompressOptions {
  compress?: boolean
  quality?: number
  maxWidth?: number
  maxHeight?: number
}

// 图片资源信息
export interface ImageAssetInfo {
  id: string
  filename: string
  path: string
  mime_type: string
  size: number
  checksum: string
}

// API 类型定义
export interface ElectronAPI {
  // 文件操作
  newFile: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  openFile: (filePath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveFile: (content?: string, title?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveAsFile: (content?: string, title?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  closeFile: () => Promise<{ success: boolean; error?: string }>
  getRecentFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  removeRecentFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  clearRecentFiles: () => Promise<{ success: boolean; error?: string }>

  // MDX 操作
  readMdx: (filePath: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  writeMdx: (filePath: string, data: unknown) => Promise<{ success: boolean; error?: string }>
  importMd: (filePath?: string, targetPath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  exportMd: (filePath: string, outputDir?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  addImage: (filename: string, mimeType: string, data: ArrayBuffer, options?: ImageCompressOptions) => Promise<{ success: boolean; data?: unknown; error?: string }>
  getImage: (imagePath: string) => Promise<{ success: boolean; data?: { buffer: Uint8Array | number[] | { type: string; data: number[] }; mimeType: string }; error?: string }>
  removeAsset: (assetId: string) => Promise<{ success: boolean; error?: string }>
  listAssets: () => Promise<{ success: boolean; data?: { images: ImageAssetInfo[]; attachments: unknown[]; all: unknown[] }; error?: string }>
  addAttachment: (filename: string, mimeType: string, data: ArrayBuffer) => Promise<{ success: boolean; data?: unknown; error?: string }>
  getAttachment: (attachmentPath: string) => Promise<{ success: boolean; data?: { buffer: Uint8Array | number[] | { type: string; data: number[] }; mimeType: string }; error?: string }>

  // 文件夹操作
  readFolder: (dirPath: string) => Promise<{ success: boolean; data?: FolderItem[]; error?: string }>
  createFile: (dirPath: string, name: string) => Promise<{ success: boolean; data?: { path: string }; error?: string }>
  createFolder: (parentPath: string, name: string) => Promise<{ success: boolean; data?: { path: string }; error?: string }>
  renameFile: (oldPath: string, newName: string) => Promise<{ success: boolean; data?: { path: string }; error?: string }>
  deleteFile: (targetPath: string) => Promise<{ success: boolean; error?: string }>

  // 应用信息
  ping: () => Promise<string>
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>

  // 对话框
  showOpenDialog: (options?: unknown) => Promise<{ success: boolean; data?: string[]; error?: string }>
  showSaveDialog: (options?: unknown) => Promise<{ success: boolean; data?: string; error?: string }>
  showMessageBox: (options?: unknown) => Promise<{ success: boolean; data?: number; error?: string }>

  // 事件监听
  onConfirmClose: (callback: () => void) => () => void
  closeConfirmed: () => void

  // 窗口控制
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: () => void) => () => void
  onWindowUnmaximized: (callback: () => void) => () => void
}

// 通过 contextBridge 暴露安全的 API
const api: ElectronAPI = {
  // 文件操作
  newFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.NEW),
  openFile: (filePath?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN, filePath),
  saveFile: (content?, title?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE, content, title),
  saveAsFile: (content?, title?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE_AS, content, title),
  closeFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.CLOSE),
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.RECENT),
  removeRecentFile: (filePath) => ipcRenderer.invoke('file:removeRecent', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('file:clearRecent'),

  // MDX 操作
  readMdx: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.READ, filePath),
  writeMdx: (filePath, data) => ipcRenderer.invoke(IPC_CHANNELS.MDX.WRITE, filePath, data),
  importMd: (filePath?, targetPath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.IMPORT_MD, filePath, targetPath),
  exportMd: (filePath, outputDir?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.EXPORT_MD, filePath, outputDir),
  addImage: (filename, mimeType, data, options?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.ADD_IMAGE, filename, mimeType, data, options),
  getImage: (imagePath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.GET_IMAGE, imagePath),
  removeAsset: (assetId) => ipcRenderer.invoke(IPC_CHANNELS.MDX.REMOVE_ASSET, assetId),
  listAssets: () => ipcRenderer.invoke(IPC_CHANNELS.MDX.LIST_ASSETS),
  addAttachment: (filename, mimeType, data) => ipcRenderer.invoke(IPC_CHANNELS.MDX.ADD_ATTACHMENT, filename, mimeType, data),
  getAttachment: (attachmentPath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.GET_ATTACHMENT, attachmentPath),

  // 文件夹操作
  readFolder: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FOLDER.READ, dirPath),
  createFile: (dirPath, name) => ipcRenderer.invoke(IPC_CHANNELS.FILE.CREATE, { dirPath, name }),
  createFolder: (parentPath, name) => ipcRenderer.invoke(IPC_CHANNELS.FOLDER.CREATE, { parentPath, name }),
  renameFile: (oldPath, newName) => ipcRenderer.invoke(IPC_CHANNELS.FILE.RENAME, { oldPath, newName }),
  deleteFile: (targetPath) => ipcRenderer.invoke(IPC_CHANNELS.FILE.DELETE, { targetPath }),

  // 应用信息
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.APP.PING),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION),
  getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_PLATFORM),

  // 对话框
  showOpenDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG.SHOW_OPEN, options),
  showSaveDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG.SHOW_SAVE, options),
  showMessageBox: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG.SHOW_MESSAGE, options),

  // 事件监听
  onConfirmClose: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.APP.CONFIRM_CLOSE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP.CONFIRM_CLOSE, handler)
  },
  closeConfirmed: () => ipcRenderer.invoke(IPC_CHANNELS.APP.CLOSE_CONFIRMED),

  // 窗口控制
  windowMinimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.MINIMIZE),
  windowMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.MAXIMIZE),
  windowClose: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.CLOSE),
  windowIsMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED),
  onWindowMaximized: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.WINDOW.MAXIMIZED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW.MAXIMIZED, handler)
  },
  onWindowUnmaximized: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.WINDOW.UNMAXIMIZED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW.UNMAXIMIZED, handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

// 类型声明扩展
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
