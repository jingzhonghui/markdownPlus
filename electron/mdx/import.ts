/**
 * Markdown (.md) 文件导入模块
 *
 * 将普通 .md 文件及其引用的本地图片转换为 .mdx 格式
 */

import * as fs from 'fs'
import * as path from 'path'
import * as mime from './mime'
import type { MdxDocument, MdxResult, MdxImageAsset } from './schema'
import { createMdxDocument } from './schema'
import { addImageAsset } from './writer'

/**
 * Markdown 中的图片引用信息
 */
export interface ImageReference {
  originalPath: string // 原始路径（如 ./images/pic.png 或 /absolute/path/pic.png）
  alt: string // 图片替代文本
  title?: string // 图片标题
  fullMatch: string // 完整的 Markdown 语法匹配
}

/**
 * 解析 Markdown 中的图片引用
 * @param content Markdown 内容
 * @returns 图片引用列表
 */
export function extractImageReferences(content: string): ImageReference[] {
  const references: ImageReference[] = []

  // 匹配 ![alt](path) 或 ![alt](path "title") 格式
  const imageRegex = /!\[([^\]]*)\]\(([^)"\s]+)(?:\s+"([^"]*)")?\)/g

  let match
  while ((match = imageRegex.exec(content)) !== null) {
    references.push({
      originalPath: match[2],
      alt: match[1],
      title: match[3],
      fullMatch: match[0]
    })
  }

  return references
}

/**
 * 判断路径是否为 URL
 * @param filePath 路径
 * @returns 是否为 URL
 */
function isUrl(filePath: string): boolean {
  return filePath.startsWith('http://') ||
         filePath.startsWith('https://') ||
         filePath.startsWith('data:')
}

/**
 * 判断路径是否为绝对路径
 * @param filePath 路径
 * @returns 是否为绝对路径
 */
function isAbsolutePath(filePath: string): boolean {
  if (process.platform === 'win32') {
    return /^[a-zA-Z]:[/\\]/.test(filePath) || filePath.startsWith('\\')
  }
  return filePath.startsWith('/')
}

/**
 * 解析图片的绝对路径
 * @param imagePath 图片路径
 * @param mdFileDir Markdown 文件所在目录
 * @returns 绝对路径或 null（如果是 URL 或不存在）
 */
function resolveImagePath(imagePath: string, mdFileDir: string): string | null {
  // URL 不需要解析
  if (isUrl(imagePath)) {
    return null
  }

  // 绝对路径
  if (isAbsolutePath(imagePath)) {
    return fs.existsSync(imagePath) ? imagePath : null
  }

  // 相对路径，相对于 Markdown 文件目录
  const resolvedPath = path.resolve(mdFileDir, imagePath)
  return fs.existsSync(resolvedPath) ? resolvedPath : null
}

/**
 * 获取文件的 MIME 类型
 * @param filePath 文件路径
 * @returns MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return mime.getMimeType(ext) || 'application/octet-stream'
}

/**
 * 导入单个图片到 MDX 文档
 * @param document MDX 文档
 * @param imagePath 图片路径
 * @returns 资源信息和相对路径
 */
function importImageToDocument(
  document: MdxDocument,
  imagePath: string
): { asset: MdxImageAsset; relativePath: string } | null {
  try {
    const data = fs.readFileSync(imagePath)
    const filename = path.basename(imagePath)
    const mimeType = getMimeType(imagePath)

    return addImageAsset(document, filename, mimeType, data)
  } catch (error) {
    console.warn(`无法读取图片: ${imagePath}`, error)
    return null
  }
}

/**
 * 替换 Markdown 中的图片引用路径
 * @param content Markdown 内容
 * @param replacements 替换映射（原始路径 -> 新路径）
 * @returns 更新后的内容
 */
function replaceImagePaths(content: string, replacements: Map<string, string>): string {
  let updatedContent = content

  for (const [originalPath, newPath] of replacements) {
    // 转义正则特殊字符
    const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedPath}(?:\\s+"([^"]*)")?\\)`, 'g')

    updatedContent = updatedContent.replace(regex, (_match, alt, title) => {
      if (title) {
        return `![${alt}](${newPath} "${title}")`
      }
      return `![${alt}](${newPath})`
    })
  }

  return updatedContent
}

/**
 * 从 Markdown 文件导入
 * @param mdFilePath Markdown 文件路径
 * @returns 导入结果，包含 MDX 文档对象和图片资源数据
 */
export function importFromMarkdown(mdFilePath: string): MdxResult<{ document: MdxDocument; importedImages: string[]; failedImages: string[]; assetsData: Map<string, Buffer> }> {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(mdFilePath)) {
      return { success: false, error: 'Markdown 文件不存在' }
    }

    // 读取 Markdown 内容
    const content = fs.readFileSync(mdFilePath, 'utf-8')
    const mdFileDir = path.dirname(mdFilePath)
    const fileName = path.basename(mdFilePath, '.md')

    // 创建新的 MDX 文档
    const document = createMdxDocument(fileName, content)

    // 提取图片引用
    const imageReferences = extractImageReferences(content)

    // 收集替换映射和导入结果
    const pathReplacements = new Map<string, string>()
    const assetsData = new Map<string, Buffer>()
    const importedImages: string[] = []
    const failedImages: string[] = []

    // 处理每个图片引用
    for (const ref of imageReferences) {
      const absolutePath = resolveImagePath(ref.originalPath, mdFileDir)

      if (absolutePath === null) {
        // URL 或无法解析的路径，保持原样
        if (!isUrl(ref.originalPath)) {
          failedImages.push(ref.originalPath)
        }
        continue
      }

      // 读取图片原始数据
      let imageData: Buffer
      try {
        imageData = fs.readFileSync(absolutePath)
      } catch {
        failedImages.push(ref.originalPath)
        continue
      }

      // 导入图片到文档（生成 hash 文件名并注册到 assets）
      const result = importImageToDocument(document, absolutePath)

      if (result) {
        pathReplacements.set(ref.originalPath, result.relativePath)
        // 保存图片二进制数据，key 为 .mdx 内的相对路径
        assetsData.set(result.relativePath, imageData)
        importedImages.push(ref.originalPath)
      } else {
        failedImages.push(ref.originalPath)
      }
    }

    // 更新 Markdown 内容中的图片路径
    document.content = replaceImagePaths(document.content, pathReplacements)

    return {
      success: true,
      data: {
        document,
        importedImages,
        failedImages,
        assetsData
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: `导入失败: ${errorMessage}` }
  }
}

/**
 * 将导入的文档保存为 .mdx 文件
 * @param targetPath 目标 .mdx 文件路径
 * @param mdFilePath 源 Markdown 文件路径
 * @returns 操作结果
 */
export async function importAndSaveAsMdx(targetPath: string, mdFilePath: string): Promise<MdxResult<{ document: MdxDocument; tempDir: string }>> {
  // 导入 Markdown（同时获取图片资源数据）
  const importResult = importFromMarkdown(mdFilePath)
  if (!importResult.success) {
    return { success: false, error: importResult.error }
  }

  const { document, assetsData } = importResult.data!

  // 保存为 MDX，直接使用导入时收集的图片数据
  const { saveMdx } = await import('./writer')
  const saveResult = await saveMdx(targetPath, document, assetsData)

  if (!saveResult.success) {
    return { success: false, error: saveResult.error }
  }

  // 重新打开以获取临时目录
  const { openMdx } = await import('./reader')
  return openMdx(targetPath)
}

/**
 * 获取导入报告
 * @param importedImages 成功导入的图片列表
 * @param failedImages 失败的图片列表
 * @returns 格式化的报告字符串
 */
export function generateImportReport(importedImages: string[], failedImages: string[]): string {
  let report = 'Markdown 导入报告\n'
  report += '='.repeat(40) + '\n\n'

  report += `成功导入: ${importedImages.length} 个图片\n`
  for (const img of importedImages) {
    report += `  ✓ ${img}\n`
  }

  if (failedImages.length > 0) {
    report += `\n导入失败: ${failedImages.length} 个图片\n`
    for (const img of failedImages) {
      report += `  ✗ ${img}\n`
    }
  }

  return report
}
