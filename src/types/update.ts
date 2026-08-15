/**
 * 自动更新类型定义（前端共享）
 *
 * 这些类型与 electron/updater.ts 中的 UpdateInfoPayload / UpdateProgressPayload 保持一致
 */

/** 更新信息（展示给用户的最小字段集） */
export interface UpdateInfo {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

/** 更新下载进度 */
export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

/** 更新状态机 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
