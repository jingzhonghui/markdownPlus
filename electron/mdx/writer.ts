/**
 * MDX 文件写入模块
 *
 * 提供 .mdx 文件的打包、压缩和写入功能
 * 使用原子写入策略防止文件损坏
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import archiver from 'archiver'
import type { MdxDocument, MdxJson, MdxResult, MdxImageAsset, MdxAttachmentAsset } from './schema'
import { toMdxJson, createDefaultAssets, createDefaultSettings } from './schema'
import { createTempDir, cleanupTempDir } from './reader'

/**
 * 确保目录存在
 * @param dirPath 目录路径
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 生成唯一的资源 ID
 * @returns 资源 ID
 */
export function generateAssetId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `asset_${timestamp}_${random}`
}

/**
 * 生成基于内容的文件名（哈希前缀）
 * @param originalName 原始文件名
 * @param content 文件内容
 * @returns 新文件名
 */
export function generateContentHashName(originalName: string, content: Buffer): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 12)
  const ext = path.extname(originalName)
  const baseName = path.basename(originalName, ext)
  // 保留原始文件名的前 20 个字符，加上哈希
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20)
  return `${safeBaseName}_${hash}${ext}`
}

/**
 * 写入 mdx.json 文件
 * @param tempDir 临时目录
 * @param mdxJson mdx.json 数据
 */
function writeMdxJson(tempDir: string, mdxJson: MdxJson): void {
  const jsonPath = path.join(tempDir, 'mdx.json')
  const jsonContent = JSON.stringify(mdxJson, null, 2)
  fs.writeFileSync(jsonPath, jsonContent, 'utf-8')
}

/**
 * 写入 content.md 文件
 * @param tempDir 临时目录
 * @param content Markdown 内容
 * @param contentFile 内容文件名（默认为 content.md）
 */
function writeContent(tempDir: string, content: string, contentFile = 'content.md'): void {
  const contentPath = path.join(tempDir, contentFile)
  fs.writeFileSync(contentPath, content, 'utf-8')
}

/**
 * 压缩目录为 ZIP 文件
 * @param sourceDir 源目录
 * @param targetPath 目标 ZIP 文件路径
 * @returns Promise 在压缩完成时 resolve
 */
function zipDirectory(sourceDir: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetPath)
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    })

    output.on('close', () => resolve())
    output.on('error', (err) => reject(err))
    archive.on('error', (err) => reject(err))
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archiver warning:', err)
      } else {
        reject(err)
      }
    })

    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

/**
 * 原子写入文件（先写临时文件，再重命名）
 * @param tempPath 临时文件路径
 * @param targetPath 目标文件路径
 */
function atomicWrite(tempPath: string, targetPath: string): void {
  // 确保目标目录存在
  const targetDir = path.dirname(targetPath)
  ensureDir(targetDir)

  // Windows 下需要先删除已存在的文件
  if (process.platform === 'win32' && fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath)
  }

  // 原子重命名
  fs.renameSync(tempPath, targetPath)
}

/**
 * 添加图片资源到文档
 * @param document MDX 文档
 * @param filename 文件名
 * @param mimeType MIME 类型
 * @param data 图片数据
 * @returns 图片资源信息和相对路径
 */
export function addImageAsset(
  document: MdxDocument,
  filename: string,
  mimeType: string,
  data: Buffer
): { asset: MdxImageAsset; relativePath: string } {
  // 生成内容哈希文件名
  const newFilename = generateContentHashName(filename, data)
  const relativePath = `assets/images/${newFilename}`
  const id = generateAssetId()

  // 检查是否已存在相同内容的图片（通过哈希）
  const checksum = crypto.createHash('sha256').update(data).digest('hex')
  const existingAsset = document.assets.images.find(img => img.checksum === checksum)
  if (existingAsset) {
    return {
      asset: existingAsset,
      relativePath: existingAsset.path
    }
  }

  // 创建新的资源信息
  const asset: MdxImageAsset = {
    id,
    filename: newFilename,
    path: relativePath,
    mime_type: mimeType,
    size: data.length,
    checksum
  }

  document.assets.images.push(asset)

  return { asset, relativePath }
}

/**
 * 添加附件资源到文档
 * @param document MDX 文档
 * @param filename 文件名
 * @param mimeType MIME 类型
 * @param data 附件数据
 * @returns 附件资源信息和相对路径
 */
export function addAttachmentAsset(
  document: MdxDocument,
  filename: string,
  mimeType: string,
  data: Buffer
): { asset: MdxAttachmentAsset; relativePath: string } {
  const newFilename = generateContentHashName(filename, data)
  const relativePath = `assets/attachments/${newFilename}`
  const id = generateAssetId()
  const checksum = crypto.createHash('sha256').update(data).digest('hex')

  // 检查是否已存在
  if (document.assets.attachments) {
    const existingAsset = document.assets.attachments.find(att => att.checksum === checksum)
    if (existingAsset) {
      return {
        asset: existingAsset,
        relativePath: existingAsset.path
      }
    }
  } else {
    document.assets.attachments = []
  }

  const asset: MdxAttachmentAsset = {
    id,
    filename: newFilename,
    path: relativePath,
    mime_type: mimeType,
    size: data.length,
    checksum
  }

  document.assets.attachments.push(asset)

  return { asset, relativePath }
}

/**
 * 移除资源
 * @param document MDX 文档
 * @param assetId 资源 ID
 * @returns 是否成功移除
 */
export function removeAsset(document: MdxDocument, assetId: string): boolean {
  // 从图片列表中移除
  const imageIndex = document.assets.images.findIndex(img => img.id === assetId)
  if (imageIndex !== -1) {
    document.assets.images.splice(imageIndex, 1)
    return true
  }

  // 从附件列表中移除
  if (document.assets.attachments) {
    const attachmentIndex = document.assets.attachments.findIndex(att => att.id === assetId)
    if (attachmentIndex !== -1) {
      document.assets.attachments.splice(attachmentIndex, 1)
      return true
    }
  }

  return false
}

/**
 * 准备资源数据用于写入
 * @param tempDir 临时目录
 * @param document MDX 文档
 * @returns 资源数据映射
 */
export function prepareAssetsData(tempDir: string, document: MdxDocument): Map<string, Buffer> {
  const assetsData = new Map<string, Buffer>()

  // 读取并清理不存在的图片资源
  document.assets.images = document.assets.images.filter((image) => {
    const imagePath = path.join(tempDir, image.path)
    if (fs.existsSync(imagePath)) {
      assetsData.set(image.path, fs.readFileSync(imagePath))
      return true
    }
    return false
  })

  // 读取并清理不存在的附件资源
  if (document.assets.attachments) {
    document.assets.attachments = document.assets.attachments.filter((attachment) => {
      const attachmentPath = path.join(tempDir, attachment.path)
      if (fs.existsSync(attachmentPath)) {
        assetsData.set(attachment.path, fs.readFileSync(attachmentPath))
        return true
      }
      return false
    })
  }

  return assetsData
}

/**
 * 保存 MDX 文件
 * @param filePath 目标文件路径
 * @param document MDX 文档对象
 * @param assetsData 资源数据映射（可选，如果已存在于临时目录则不需要）
 * @returns 操作结果
 */
export async function saveMdx(
  filePath: string,
  document: MdxDocument,
  assetsData?: Map<string, Buffer>
): Promise<MdxResult> {
  const validation = validateFilePath(filePath)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const tempDir = createTempDir()
  const tempMdxPath = `${filePath}.tmp`

  try {
    // 确保 assets 和 settings 存在
    if (!document.assets) {
      document.assets = createDefaultAssets()
    }
    if (!document.settings) {
      document.settings = createDefaultSettings()
    }

    // 写入 mdx.json
    const mdxJson = toMdxJson(document)
    writeMdxJson(tempDir, mdxJson)

    // 写入 content.md
    writeContent(tempDir, document.content, document.metadata.content_file)

    // 写入资源文件
    if (assetsData && assetsData.size > 0) {
      for (const [relativePath, data] of assetsData) {
        const assetPath = path.join(tempDir, relativePath)
        ensureDir(path.dirname(assetPath))
        fs.writeFileSync(assetPath, data)
      }
    }

    // 压缩为 ZIP
    await zipDirectory(tempDir, tempMdxPath)

    // 原子写入目标文件
    atomicWrite(tempMdxPath, filePath)

    // 更新文档的修改时间
    document.metadata.modified_at = new Date().toISOString()

    return { success: true }
  } catch (error) {
    // 清理临时文件
    if (fs.existsSync(tempMdxPath)) {
      fs.unlinkSync(tempMdxPath)
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: `保存文件失败: ${errorMessage}` }
  } finally {
    cleanupTempDir(tempDir)
  }
}

/**
 * 另存为新的 MDX 文件
 * @param sourcePath 源文件路径（可选，用于复制资源）
 * @param targetPath 目标文件路径
 * @param document MDX 文档对象
 * @returns 操作结果
 */
export async function saveAsMdx(
  sourcePath: string | null,
  targetPath: string,
  document: MdxDocument
): Promise<MdxResult> {
  // 如果有源文件，先复制资源数据
  let assetsData: Map<string, Buffer> | undefined

  if (sourcePath && fs.existsSync(sourcePath)) {
    // 从源文件加载资源数据
    const { openMdx } = await import('./reader')
    const result = openMdx(sourcePath)
    if (result.success && result.data) {
      const { tempDir } = result.data
      try {
        assetsData = prepareAssetsData(tempDir, document)
      } finally {
        cleanupTempDir(tempDir)
      }
    }
  }

  return saveMdx(targetPath, document, assetsData)
}

/**
 * 创建新的空白 MDX 文件
 * @param filePath 文件路径
 * @param title 文档标题
 * @param content 初始内容
 * @returns 操作结果
 */
export async function createMdx(
  filePath: string,
  title = '未命名文档',
  content = ''
): Promise<MdxResult<{ document: MdxDocument; tempDir: string }>> {
  const { createMdxDocument } = await import('./schema')
  const document = createMdxDocument(title, content)

  const result = await saveMdx(filePath, document)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 重新打开以获取临时目录
  const { openMdx } = await import('./reader')
  return openMdx(filePath)
}

/**
 * 验证文件路径是否有效
 * @param filePath 文件路径
 * @returns 验证结果
 */
export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  // 检查文件名
  const fileName = path.basename(filePath)
  if (!fileName || fileName === '.mdx') {
    return { valid: false, error: '文件名不能为空' }
  }

  // 检查扩展名
  if (!filePath.toLowerCase().endsWith('.mdx')) {
    return { valid: false, error: '文件扩展名必须是 .mdx' }
  }

  // 检查非法字符（Windows）
  const invalidChars = /[<>:"|?*]/
  if (invalidChars.test(fileName)) {
    return { valid: false, error: '文件名包含非法字符' }
  }

  return { valid: true }
}
