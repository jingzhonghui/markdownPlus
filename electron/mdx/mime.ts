/**
 * MIME 类型映射
 *
 * 提供文件扩展名到 MIME 类型的映射
 */

/**
 * 扩展名到 MIME 类型的映射表
 */
const MIME_TYPES: Record<string, string> = {
  // 图片
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',

  // 文档
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // 文本
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.csv': 'text/csv',

  // 压缩
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',

  // 音频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',

  // 视频
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm'
}

/**
 * 根据文件扩展名获取 MIME 类型
 * @param ext 文件扩展名（包含或不包含点号）
 * @returns MIME 类型，未知类型返回 null
 */
export function getMimeType(ext: string): string | null {
  // 确保扩展名包含点号
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  return MIME_TYPES[normalizedExt] || null
}

/**
 * 根据 MIME 类型获取文件扩展名
 * @param mimeType MIME 类型
 * @returns 文件扩展名（包含点号），未知类型返回 null
 */
export function getExtension(mimeType: string): string | null {
  const normalizedMime = mimeType.toLowerCase()
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (mime === normalizedMime) {
      return ext
    }
  }
  return null
}

/**
 * 判断 MIME 类型是否为图片
 * @param mimeType MIME 类型
 * @returns 是否为图片
 */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * 判断 MIME 类型是否为视频
 * @param mimeType MIME 类型
 * @returns 是否为视频
 */
export function isVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

/**
 * 判断 MIME 类型是否为音频
 * @param mimeType MIME 类型
 * @returns 是否为音频
 */
export function isAudio(mimeType: string): boolean {
  return mimeType.startsWith('audio/')
}

/**
 * 判断文件扩展名是否为图片
 * @param ext 文件扩展名
 * @returns 是否为图片
 */
export function isImageExtension(ext: string): boolean {
  const mimeType = getMimeType(ext)
  return mimeType ? isImage(mimeType) : false
}

/**
 * 获取图片扩展名列表
 * @returns 支持的图片扩展名列表
 */
export function getImageExtensions(): string[] {
  return Object.entries(MIME_TYPES)
    .filter(([, mime]) => mime.startsWith('image/'))
    .map(([ext]) => ext)
}
