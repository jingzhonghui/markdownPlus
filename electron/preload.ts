import { contextBridge, ipcRenderer } from 'electron'

// IPC 通道常量定义
export const IPC_CHANNELS = {
  FILE: {
    NEW: 'file:new',
    OPEN: 'file:open',
    SAVE: 'file:save',
    SAVE_AS: 'file:saveAs',
    CLOSE: 'file:close',
    RECENT: 'file:recent'
  },
  MDX: {
    READ: 'mdx:read',
    WRITE: 'mdx:write',
    IMPORT_MD: 'mdx:importMd',
    EXPORT_MD: 'mdx:exportMd'
  },
  APP: {
    PING: 'ping',
    GET_VERSION: 'app:getVersion',
    GET_PLATFORM: 'app:getPlatform'
  },
  DIALOG: {
    SHOW_OPEN: 'dialog:showOpen',
    SHOW_SAVE: 'dialog:showSave',
    SHOW_MESSAGE: 'dialog:showMessage'
  }
} as const

// API 类型定义
export interface ElectronAPI {
  // 文件操作
  newFile: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  openFile: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveFile: (content: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveAsFile: (content: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>
  closeFile: () => Promise<{ success: boolean; error?: string }>
  getRecentFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>

  // MDX 操作
  readMdx: (filePath: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  writeMdx: (filePath: string, data: unknown) => Promise<{ success: boolean; error?: string }>
  importMd: (filePath: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  exportMd: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>

  // 应用信息
  ping: () => Promise<string>
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>

  // 对话框
  showOpenDialog: (options?: unknown) => Promise<{ success: boolean; data?: string[]; error?: string }>
  showSaveDialog: (options?: unknown) => Promise<{ success: boolean; data?: string; error?: string }>
  showMessageBox: (options?: unknown) => Promise<{ success: boolean; data?: number; error?: string }>
}

// 通过 contextBridge 暴露安全的 API
const api: ElectronAPI = {
  // 文件操作
  newFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.NEW),
  openFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN),
  saveFile: (content) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE, content),
  saveAsFile: (content) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE_AS, content),
  closeFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.CLOSE),
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.RECENT),

  // MDX 操作
  readMdx: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.READ, filePath),
  writeMdx: (filePath, data) => ipcRenderer.invoke(IPC_CHANNELS.MDX.WRITE, filePath, data),
  importMd: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.IMPORT_MD, filePath),
  exportMd: (filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.MDX.EXPORT_MD, filePath, content),

  // 应用信息
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.APP.PING),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION),
  getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_PLATFORM),

  // 对话框
  showOpenDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG.SHOW_OPEN, options),
  showSaveDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG.SHOW_SAVE, options),
  showMessageBox: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG.SHOW_MESSAGE, options)
}

contextBridge.exposeInMainWorld('electronAPI', api)

// 类型声明扩展
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
