/**
 * Electron API 类型声明
 */

import type { ElectronAPI } from '../../electron/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
