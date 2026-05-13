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
    RECENT: 'file:recent',
    CREATE: 'file:create',
    RENAME: 'file:rename',
    DELETE: 'file:delete'
  },
  MDX: {
    READ: 'mdx:read',
    WRITE: 'mdx:write',
    IMPORT_MD: 'mdx:importMd',
    EXPORT_MD: 'mdx:exportMd',
    ADD_IMAGE: 'mdx:addImage',
    GET_IMAGE: 'mdx:getImage',
    REMOVE_ASSET: 'mdx:removeAsset',
    LIST_ASSETS: 'mdx:listAssets',
    ADD_ATTACHMENT: 'mdx:addAttachment',
    GET_ATTACHMENT: 'mdx:getAttachment'
  },
  APP: {
    PING: 'ping',
    GET_VERSION: 'app:getVersion',
    GET_PLATFORM: 'app:getPlatform',
    CONFIRM_CLOSE: 'app:confirm-close',
    CLOSE_CONFIRMED: 'app:close-confirmed'
  },
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    MAXIMIZED: 'window:maximized',
    UNMAXIMIZED: 'window:unmaximized',
    CLOSE: 'window:close',
    IS_MAXIMIZED: 'window:isMaximized'
  },
  DIALOG: {
    SHOW_OPEN: 'dialog:showOpen',
    SHOW_SAVE: 'dialog:showSave',
    SHOW_MESSAGE: 'dialog:showMessage'
  },
  FOLDER: {
    READ: 'folder:read',
    CREATE: 'folder:create'
  }
} as const
