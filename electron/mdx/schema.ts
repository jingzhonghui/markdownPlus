/**
 * MDX 文件格式 Schema 定义
 *
 * 定义 mdx.json 的数据结构和 TypeScript 类型
 */

/** MDX 文件格式版本 */
export const MDX_VERSION = '1.0'

/** 支持的编码格式 */
export type Encoding = 'UTF-8'

/** 编辑器主题 */
export type EditorTheme = 'default' | 'dark' | 'light'

/** 预览样式 */
export type PreviewStyle = 'github' | 'gitlab' | 'minimal'

/** 资源类型 */
export type AssetType = 'image' | 'attachment'

/** 图片资源信息 */
export interface MdxImageAsset {
  id: string
  filename: string
  path: string
  mime_type: string
  size: number
  checksum: string
  width?: number
  height?: number
}

/** 附件资源信息 */
export interface MdxAttachmentAsset {
  id: string
  filename: string
  path: string
  mime_type: string
  size: number
  checksum: string
}

/** 资源集合 */
export interface MdxAssets {
  images: MdxImageAsset[]
  attachments?: MdxAttachmentAsset[]
}

/** 编辑器设置 */
export interface MdxSettings {
  editor_theme: EditorTheme
  preview_style: PreviewStyle
  auto_save?: boolean
  auto_save_interval?: number // 秒
}

/** MDX 文件元数据 */
export interface MdxMetadata {
  version: string
  created_at: string // ISO 8601 格式
  modified_at: string // ISO 8601 格式
  author?: string
  title: string
  encoding: Encoding
  content_file: string
}

/** 完整的 mdx.json 结构 */
export interface MdxJson {
  version: string
  created_at: string
  modified_at: string
  author?: string
  title: string
  encoding: Encoding
  content_file: string
  assets: MdxAssets
  settings: MdxSettings
}

/** 内存中的 MDX 文档对象 */
export interface MdxDocument {
  metadata: MdxMetadata
  content: string
  assets: MdxAssets
  settings: MdxSettings
}

/** MDX 文件操作结果 */
export interface MdxResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** 文件信息 */
export interface FileInfo {
  path: string
  name: string
  size: number
  modifiedAt: Date
}

/**
 * 创建默认的 MDX 设置
 */
export function createDefaultSettings(): MdxSettings {
  return {
    editor_theme: 'default',
    preview_style: 'github',
    auto_save: true,
    auto_save_interval: 30
  }
}

/**
 * 创建默认的 MDX 资源集合
 */
export function createDefaultAssets(): MdxAssets {
  return {
    images: [],
    attachments: []
  }
}

/**
 * 创建新的 MDX 文档元数据
 */
export function createMetadata(title = '未命名文档'): MdxMetadata {
  const now = new Date().toISOString()
  return {
    version: MDX_VERSION,
    created_at: now,
    modified_at: now,
    title,
    encoding: 'UTF-8',
    content_file: 'content.md'
  }
}

/**
 * 创建新的 MDX 文档
 */
export function createMdxDocument(title = '未命名文档', content = ''): MdxDocument {
  return {
    metadata: createMetadata(title),
    content,
    assets: createDefaultAssets(),
    settings: createDefaultSettings()
  }
}

/**
 * 将 MdxDocument 转换为 mdx.json 格式
 */
export function toMdxJson(doc: MdxDocument): MdxJson {
  return {
    version: doc.metadata.version,
    created_at: doc.metadata.created_at,
    modified_at: new Date().toISOString(),
    author: doc.metadata.author,
    title: doc.metadata.title,
    encoding: doc.metadata.encoding,
    content_file: doc.metadata.content_file,
    assets: doc.assets,
    settings: doc.settings
  }
}

/**
 * 验证 mdx.json 数据结构
 * @returns 验证结果，成功时返回 true，失败时返回错误信息
 */
export function validateMdxJson(data: unknown): { valid: boolean; error?: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'mdx.json 必须是对象' }
  }

  const json = data as Record<string, unknown>

  // 检查必需字段
  const requiredFields = ['version', 'created_at', 'modified_at', 'title', 'encoding', 'content_file', 'assets', 'settings']
  for (const field of requiredFields) {
    if (!(field in json)) {
      return { valid: false, error: `缺少必需字段: ${field}` }
    }
  }

  // 验证 version
  if (typeof json.version !== 'string') {
    return { valid: false, error: 'version 必须是字符串' }
  }

  // 验证时间戳格式
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
  if (typeof json.created_at !== 'string' || !isoDateRegex.test(json.created_at)) {
    return { valid: false, error: 'created_at 必须是有效的 ISO 8601 时间戳' }
  }
  if (typeof json.modified_at !== 'string' || !isoDateRegex.test(json.modified_at)) {
    return { valid: false, error: 'modified_at 必须是有效的 ISO 8601 时间戳' }
  }

  // 验证 title
  if (typeof json.title !== 'string') {
    return { valid: false, error: 'title 必须是字符串' }
  }

  // 验证 encoding
  if (json.encoding !== 'UTF-8') {
    return { valid: false, error: 'encoding 必须是 UTF-8' }
  }

  // 验证 content_file
  if (typeof json.content_file !== 'string') {
    return { valid: false, error: 'content_file 必须是字符串' }
  }

  // 验证 assets
  if (typeof json.assets !== 'object' || json.assets === null) {
    return { valid: false, error: 'assets 必须是对象' }
  }

  const assets = json.assets as Record<string, unknown>
  if (!Array.isArray(assets.images)) {
    return { valid: false, error: 'assets.images 必须是数组' }
  }

  // 验证每个图片资源
  for (const img of assets.images) {
    if (typeof img !== 'object' || img === null) {
      return { valid: false, error: 'assets.images 中的每一项必须是对象' }
    }
    const imageFields = ['id', 'filename', 'path', 'mime_type', 'size', 'checksum']
    for (const field of imageFields) {
      if (!(field in (img as Record<string, unknown>))) {
        return { valid: false, error: `图片资源缺少字段: ${field}` }
      }
    }
  }

  // 验证 settings
  if (typeof json.settings !== 'object' || json.settings === null) {
    return { valid: false, error: 'settings 必须是对象' }
  }

  const settings = json.settings as Record<string, unknown>
  const validThemes = ['default', 'dark', 'light']
  const validStyles = ['github', 'gitlab', 'minimal']

  if (typeof settings.editor_theme !== 'string' || !validThemes.includes(settings.editor_theme)) {
    return { valid: false, error: 'settings.editor_theme 必须是 default、dark 或 light' }
  }
  if (typeof settings.preview_style !== 'string' || !validStyles.includes(settings.preview_style)) {
    return { valid: false, error: 'settings.preview_style 必须是 github、gitlab 或 minimal' }
  }

  return { valid: true }
}
