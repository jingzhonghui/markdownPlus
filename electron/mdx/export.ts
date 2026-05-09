/**
 * MDX 导出为 Markdown (.md) 模块
 *
 * 将 .mdx 文件导出为普通 Markdown 文件，图片提取到同级文件夹
 */

import * as fs from 'fs'
import * as path from 'path'
import type { MdxDocument, MdxResult, MdxImageAsset } from './schema'

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean
  /** 图片文件夹名称（默认为 {filename}_assets） */
  assetsFolderName?: string
  /** 是否保留原始图片路径结构 */
  preservePathStructure?: boolean
}

/**
 * 导出结果
 */
export interface ExportResult {
  mdFilePath: string
  assetsFolderPath: string
  exportedImages: string[]
  skippedImages: string[]
}

/**
 * 解析 Markdown 中的图片引用
 * @param content Markdown 内容
 * @returns 图片路径列表
 */
function extractImagePaths(content: string): string[] {
  const paths: string[] = []
  const imageRegex = /!\[([^\]]*)\]\(([^)"\s]+)(?:\s+"([^"]*)")?\)/g

  let match
  while ((match = imageRegex.exec(content)) !== null) {
    paths.push(match[2])
  }

  return paths
}

/**
 * 替换 Markdown 中的图片引用路径
 * @param content Markdown 内容
 * @param pathMappings 路径映射（原路径 -> 新路径）
 * @returns 更新后的内容
 */
function replaceImagePaths(content: string, pathMappings: Map<string, string>): string {
  let updatedContent = content

  for (const [originalPath, newPath] of pathMappings) {
    // 转义正则特殊字符
    const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedPath}(?:\\s+"([^"]*)")?\\)`, 'g')

    updatedContent = updatedContent.replace(regex, (match, alt, title) => {
      if (title) {
        return `![${alt}](${newPath} "${title}")`
      }
      return `![${alt}](${newPath})`
    })
  }

  return updatedContent
}

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
 * 从 MDX 文档导出为 Markdown
 * @param document MDX 文档
 * @param outputDir 输出目录
 * @param fileName 文件名（不含扩展名）
 * @param tempDir MDX 临时目录（包含资源文件）
 * @param options 导出选项
 * @returns 导出结果
 */
export function exportToMarkdown(
  document: MdxDocument,
  outputDir: string,
  fileName: string,
  tempDir: string,
  options: ExportOptions = {}
): MdxResult<ExportResult> {
  try {
    const {
      overwrite = false,
      assetsFolderName,
      preservePathStructure = false
    } = options

    // 确保输出目录存在
    ensureDir(outputDir)

    // 确定文件路径
    const mdFilePath = path.join(outputDir, `${fileName}.md`)

    // 检查文件是否已存在
    if (!overwrite && fs.existsSync(mdFilePath)) {
      return { success: false, error: `文件已存在: ${mdFilePath}` }
    }

    // 确定资源文件夹路径
    const assetsFolder = assetsFolderName || `${fileName}_assets`
    const assetsFolderPath = path.join(outputDir, assetsFolder)
    ensureDir(assetsFolderPath)

    // 提取内容中的图片引用
    const imagePaths = extractImagePaths(document.content)

    // 准备路径映射和导出记录
    const pathMappings = new Map<string, string>()
    const exportedImages: string[] = []
    const skippedImages: string[] = []

    // 处理每个图片资源
    for (const imagePath of imagePaths) {
      // 查找对应的资源信息
      const imageAsset = document.assets.images.find(img => img.path === imagePath)

      if (!imageAsset) {
        skippedImages.push(imagePath)
        continue
      }

      // 构建源文件路径
      const sourcePath = path.join(tempDir, imagePath)

      if (!fs.existsSync(sourcePath)) {
        skippedImages.push(imagePath)
        continue
      }

      // 确定目标路径
      let targetFileName: string
      if (preservePathStructure) {
        // 保留路径结构
        const relativeDir = path.dirname(imagePath)
        const targetDir = path.join(assetsFolderPath, relativeDir)
        ensureDir(targetDir)
        targetFileName = path.join(relativeDir, imageAsset.filename)
      } else {
        // 直接放入资源文件夹
        targetFileName = imageAsset.filename
      }

      const targetPath = path.join(assetsFolderPath, targetFileName)

      // 复制文件
      fs.copyFileSync(sourcePath, targetPath)

      // 更新路径映射
      const newRelativePath = path.join(assetsFolder, targetFileName).replace(/\\/g, '/')
      pathMappings.set(imagePath, newRelativePath)
      exportedImages.push(imagePath)
    }

    // 更新 Markdown 内容中的图片路径
    const updatedContent = replaceImagePaths(document.content, pathMappings)

    // 写入 Markdown 文件
    fs.writeFileSync(mdFilePath, updatedContent, 'utf-8')

    return {
      success: true,
      data: {
        mdFilePath,
        assetsFolderPath,
        exportedImages,
        skippedImages
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: `导出失败: ${errorMessage}` }
  }
}

/**
 * 从 MDX 文件导出为 Markdown
 * @param mdxFilePath MDX 文件路径
 * @param outputDir 输出目录
 * @param options 导出选项
 * @returns 导出结果
 */
export async function exportMdxFile(
  mdxFilePath: string,
  outputDir: string,
  options: ExportOptions = {}
): Promise<MdxResult<ExportResult>> {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(mdxFilePath)) {
      return { success: false, error: 'MDX 文件不存在' }
    }

    // 获取文件名
    const fileName = path.basename(mdxFilePath, '.mdx')

    // 打开 MDX 文件
    const { openMdx } = await import('./reader')
    const openResult = openMdx(mdxFilePath)

    if (!openResult.success || !openResult.data) {
      return { success: false, error: openResult.error || '无法打开 MDX 文件' }
    }

    const { document, tempDir } = openResult.data

    try {
      // 执行导出
      return exportToMarkdown(document, outputDir, fileName, tempDir, options)
    } finally {
      // 清理临时目录
      const { cleanupTempDir } = await import('./reader')
      cleanupTempDir(tempDir)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: `导出失败: ${errorMessage}` }
  }
}

/**
 * 生成导出报告
 * @param result 导出结果
 * @returns 格式化的报告字符串
 */
export function generateExportReport(result: ExportResult): string {
  let report = 'Markdown 导出报告\n'
  report += '='.repeat(40) + '\n\n'

  report += `Markdown 文件: ${result.mdFilePath}\n`
  report += `资源文件夹: ${result.assetsFolderPath}\n\n`

  report += `成功导出: ${result.exportedImages.length} 个图片\n`
  for (const img of result.exportedImages) {
    report += `  ✓ ${img}\n`
  }

  if (result.skippedImages.length > 0) {
    report += `\n跳过: ${result.skippedImages.length} 个图片\n`
    for (const img of result.skippedImages) {
      report += `  ⚠ ${img}\n`
    }
  }

  return report
}

/**
 * 验证导出路径
 * @param outputDir 输出目录
 * @param fileName 文件名
 * @returns 验证结果
 */
export function validateExportPath(outputDir: string, fileName: string): { valid: boolean; error?: string } {
  // 检查目录
  if (!outputDir || outputDir.trim() === '') {
    return { valid: false, error: '输出目录不能为空' }
  }

  // 检查文件名
  if (!fileName || fileName.trim() === '') {
    return { valid: false, error: '文件名不能为空' }
  }

  // 检查非法字符
  const invalidChars = /[<>:"|?*]/
  if (invalidChars.test(fileName)) {
    return { valid: false, error: '文件名包含非法字符' }
  }

  return { valid: true }
}
