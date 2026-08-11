import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
import type { MdxAttachmentAsset, MdxDocument } from './mdx/schema'

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

export interface MdxOpenResult {
  document: MdxDocument
  filePath?: string
  format?: 'mdx' | 'markdown'
  isNew?: boolean
}

// API 类型定义
export interface ElectronAPI {
  // 文件操作
  newFile: () => Promise<{ success: boolean; data?: MdxOpenResult; error?: string }>
  openFile: (filePath?: string) => Promise<{ success: boolean; data?: MdxOpenResult; error?: string }>
  saveFile: (content?: string, title?: string, filePath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveAsFile: (content: string, title?: string, filePath?: string) => Promise<{ success: boolean; data?: string; error?: string }>
  closeFile: (filePath?: string) => Promise<{ success: boolean; error?: string }>
  getRecentFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  removeRecentFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  clearRecentFiles: () => Promise<{ success: boolean; error?: string }>

  // MDX 操作
  readMdx: (filePath: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  writeMdx: (filePath: string, data: unknown) => Promise<{ success: boolean; error?: string }>
  importMd: (filePath?: string, targetPath?: string) => Promise<{ success: boolean; data?: MdxOpenResult; error?: string }>
  importFolder: (sourceFolder?: string, targetFolder?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  exportMd: (filePath: string, outputDir?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  addImage: (filename: string, mimeType: string, data: ArrayBuffer, options?: ImageCompressOptions, filePath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  getImage: (imagePath: string, filePath?: string) => Promise<{ success: boolean; data?: { buffer: Uint8Array | number[] | { type: string; data: number[] }; mimeType: string }; error?: string }>
  removeAsset: (assetId: string, filePath?: string) => Promise<{ success: boolean; error?: string }>
  listAssets: (filePath?: string) => Promise<{ success: boolean; data?: { images: ImageAssetInfo[]; attachments: MdxAttachmentAsset[]; all: unknown[] }; error?: string }>
  addAttachment: (filename: string, mimeType: string, data: ArrayBuffer, filePath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  getAttachment: (attachmentPath: string, filePath?: string) => Promise<{ success: boolean; data?: { buffer: Uint8Array | number[] | { type: string; data: number[] }; mimeType: string }; error?: string }>
  restoreRecoveryAssets: (filePath: string, document: unknown, assetData: Record<string, string>) => Promise<{ success: boolean; error?: string }>

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

  // 崩溃恢复
  recoveryStatus: () => Promise<{ success: boolean; data?: { available: boolean }; error?: string }>
  readRecovery: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  writeRecovery: (snapshot: unknown) => Promise<{ success: boolean; error?: string }>
  clearRecovery: () => Promise<{ success: boolean; error?: string }>

  // 文件系统
  revealInExplorer: (filePath: string) => Promise<{ success: boolean; error?: string }>

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
  saveFile: (content?, title?, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE, content, title, filePath),
  saveAsFile: (content?, title?, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE_AS, content, title, filePath),
  closeFile: (filePath?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.CLOSE, filePath),
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.RECENT),
  removeRecentFile: (filePath) => ipcRenderer.invoke('file:removeRecent', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('file:clearRecent'),

  // MDX 操作
  readMdx: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.READ, filePath),
  writeMdx: (filePath, data) => ipcRenderer.invoke(IPC_CHANNELS.MDX.WRITE, filePath, data),
  importMd: (filePath?, targetPath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.IMPORT_MD, filePath, targetPath),
  importFolder: (sourceFolder?, targetFolder?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.IMPORT_FOLDER, sourceFolder, targetFolder),
  exportMd: (filePath, outputDir?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.EXPORT_MD, filePath, outputDir),
  addImage: (filename, mimeType, data, options?, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.ADD_IMAGE, filename, mimeType, data, options, filePath),
  getImage: (imagePath, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.GET_IMAGE, imagePath, filePath),
  removeAsset: (assetId, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.REMOVE_ASSET, assetId, filePath),
  listAssets: (filePath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.LIST_ASSETS, filePath),
  addAttachment: (filename, mimeType, data, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.ADD_ATTACHMENT, filename, mimeType, data, filePath),
  getAttachment: (attachmentPath, filePath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.GET_ATTACHMENT, attachmentPath, filePath),
  restoreRecoveryAssets: (filePath, document, assetData) => ipcRenderer.invoke(IPC_CHANNELS.MDX.RESTORE_RECOVERY_ASSETS, filePath, document, assetData),

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
  recoveryStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP.RECOVERY_STATUS),
  readRecovery: () => ipcRenderer.invoke(IPC_CHANNELS.APP.RECOVERY_READ),
  writeRecovery: (snapshot) => ipcRenderer.invoke(IPC_CHANNELS.APP.RECOVERY_WRITE, snapshot),
  clearRecovery: () => ipcRenderer.invoke(IPC_CHANNELS.APP.RECOVERY_CLEAR),

  // 文件系统
  revealInExplorer: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FILE.REVEAL_IN_EXPLORER, filePath),

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
