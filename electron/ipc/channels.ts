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
    RECENT_ADD: 'file:addRecent',
    RECENT_REMOVE: 'file:removeRecent',
    RECENT_CLEAR: 'file:clearRecent',
    CREATE: 'file:create',
    RENAME: 'file:rename',
    DELETE: 'file:delete',
    REVEAL_IN_EXPLORER: 'file:revealInExplorer'
  },
  MDX: {
    READ: 'mdx:read',
    WRITE: 'mdx:write',
    IMPORT_MD: 'mdx:importMd',
    IMPORT_FOLDER: 'mdx:importFolder',
    EXPORT_MD: 'mdx:exportMd',
    ADD_IMAGE: 'mdx:addImage',
    GET_IMAGE: 'mdx:getImage',
    REMOVE_ASSET: 'mdx:removeAsset',
    LIST_ASSETS: 'mdx:listAssets',
    ADD_ATTACHMENT: 'mdx:addAttachment',
    GET_ATTACHMENT: 'mdx:getAttachment',
    RESTORE_RECOVERY_ASSETS: 'mdx:restoreRecoveryAssets'
  },
  PDF: {
    READ_SOURCE: 'pdf:readSource',
    LIST_FOLDER: 'pdf:listFolder',
    PRINT: 'pdf:print'
  },
  APP: {
    PING: 'ping',
    GET_VERSION: 'app:getVersion',
    GET_PLATFORM: 'app:getPlatform',
    OPEN_USER_GUIDE: 'app:openUserGuide',
    CONFIRM_CLOSE: 'app:confirm-close',
    CLOSE_CONFIRMED: 'app:close-confirmed',
    RECOVERY_STATUS: 'recovery:status',
    RECOVERY_READ: 'recovery:read',
    RECOVERY_WRITE: 'recovery:write',
    RECOVERY_CLEAR: 'recovery:clear'
  },
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    MAXIMIZED: 'window:maximized',
    UNMAXIMIZED: 'window:unmaximized',
    CLOSE: 'window:close',
    IS_MAXIMIZED: 'window:isMaximized'
  },
  UPDATE: {
    CHECK: 'update:check',
    DOWNLOAD: 'update:download',
    QUIT_AND_INSTALL: 'update:quitAndInstall',
    AVAILABLE: 'update:available',
    NOT_AVAILABLE: 'update:not-available',
    PROGRESS: 'update:progress',
    DOWNLOADED: 'update:downloaded',
    ERROR: 'update:error'
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
