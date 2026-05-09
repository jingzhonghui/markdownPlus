/**
 * IPC 通道常量定义
 *
 * 独立的通道定义文件，避免 preload 和主进程之间的循环依赖
 */

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
