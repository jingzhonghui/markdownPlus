import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'

export { IPC_CHANNELS }

// API 类型定义
export interface ElectronAPI {
  // 文件操作
  newFile: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  openFile: (filePath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveFile: (content?: string, title?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  saveAsFile: (content?: string, title?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  closeFile: () => Promise<{ success: boolean; error?: string }>
  getRecentFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>

  // MDX 操作
  readMdx: (filePath: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  writeMdx: (filePath: string, data: unknown) => Promise<{ success: boolean; error?: string }>
  importMd: (filePath?: string, targetPath?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  exportMd: (filePath: string, outputDir?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  addImage: (imagePath: string, filename: string, mimeType: string, data: ArrayBuffer) => Promise<{ success: boolean; data?: unknown; error?: string }>

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
  openFile: (filePath?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN, filePath),
  saveFile: (content?, title?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE, content, title),
  saveAsFile: (content?, title?) => ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE_AS, content, title),
  closeFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.CLOSE),
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.RECENT),

  // MDX 操作
  readMdx: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MDX.READ, filePath),
  writeMdx: (filePath, data) => ipcRenderer.invoke(IPC_CHANNELS.MDX.WRITE, filePath, data),
  importMd: (filePath?, targetPath?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.IMPORT_MD, filePath, targetPath),
  exportMd: (filePath, outputDir?) => ipcRenderer.invoke(IPC_CHANNELS.MDX.EXPORT_MD, filePath, outputDir),
  addImage: (imagePath, filename, mimeType, data) => ipcRenderer.invoke('mdx:addImage', imagePath, filename, mimeType, data),

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
