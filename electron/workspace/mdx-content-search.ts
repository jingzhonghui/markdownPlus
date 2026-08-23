import * as fs from 'node:fs'
import * as posixPath from 'node:path'
import AdmZip from 'adm-zip'
import type { ContentSearchMatch } from '../../shared/ai/types'
import { SourceAccessError } from '../ai/source-access-service'

/**
 * MDX 正文搜索。
 *
 * 只允许在内存中读取压缩包并解压 `content.md`，不落盘、不保留正文引用。
 * 每个文件在独立作用域内处理，`finally` 关闭文件句柄，函数返回后
 * Buffer 立即失去引用，由 GC 回收。所有安全检查复刻 source-access-service
 * 的边界（ZIP 条目、路径、压缩比、大小），保证不可信 MDX 不会触发解压炸弹。
 */

export interface MdxSearchLimits {
  /** 单个 MDX 原始文件字节上限 */
  maxFileBytes: number
  /** 单个 content.md 解压后字节上限 */
  maxContentBytes: number
  /** ZIP 条目数量上限 */
  maxZipEntries: number
  /** 压缩比上限 */
  maxZipRatio: number
}

export const DEFAULT_MDX_SEARCH_LIMITS: MdxSearchLimits = {
  maxFileBytes: 50 * 1024 * 1024,
  maxContentBytes: 10 * 1024 * 1024,
  maxZipEntries: 1_000,
  maxZipRatio: 100
}

export interface MdxMatchContext {
  /** 相对工作区根的路径，统一 `/` 分隔 */
  relativePath: string
}

export interface MdxSearchRequest {
  /** 绝对路径 */
  filePath: string
  relativePath: string
  query: string
  caseSensitive: boolean
  /** 是否按正则解释 query；false 表示字面量 */
  isRegex: boolean
  limits: MdxSearchLimits
  signal: AbortSignal
  onMatch: (match: Omit<ContentSearchMatch, 'type' | 'source' | 'path'>) => void
}

/** 在文本中查找所有匹配，返回 [{ line, column, preview }] */
export function matchTextInContent(
  content: string,
  query: string,
  caseSensitive: boolean,
  isRegex: boolean,
  signal: AbortSignal
): Array<{ line: number; column: number; preview: string }> {
  const flags = caseSensitive ? 'g' : 'gi'
  let needle: RegExp
  try {
    needle = isRegex ? new RegExp(query, flags) : new RegExp(escapeRegExp(query), flags)
  } catch {
    throw new SourceAccessError('SOURCE_INVALID', 'MDX 搜索正则在运行时无法编译')
  }

  const results: Array<{ line: number; column: number; preview: string }> = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (signal.aborted) break
    const line = lines[i]
    needle.lastIndex = 0
    const match = needle.exec(line)
    if (match) {
      const column = match.index + 1
      const raw = line.slice(Math.max(0, match.index - 40), Math.min(line.length, match.index + 120))
      const preview = raw.trim()
      results.push({ line: i + 1, column, preview })
    }
  }
  return results
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 校验并提取 MDX 中 content.md 的文本，仅内存操作 */
export function extractMdxContentText(
  bytes: Buffer,
  limits: MdxSearchLimits
): string {
  let zip: AdmZip
  try {
    zip = new AdmZip(bytes)
  } catch {
    throw new SourceAccessError('SOURCE_INVALID', 'MDX 无法解压')
  }

  const entries = zip.getEntries()
  if (entries.length > limits.maxZipEntries) {
    throw new SourceAccessError('SOURCE_TOO_LARGE', 'MDX 条目过多')
  }

  let inflated = 0
  const names = new Set<string>()
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/')
    if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
      throw new SourceAccessError('SOURCE_POLICY_BLOCKED', 'MDX 包含不安全条目路径')
    }
    const normalizedName = posixPath.posix.normalize(name)
    if (names.has(normalizedName)) {
      throw new SourceAccessError('SOURCE_POLICY_BLOCKED', 'MDX 包含重复或歧义条目路径')
    }
    names.add(normalizedName)
    if ((entry.header.flags & 1) !== 0) {
      throw new SourceAccessError('SOURCE_POLICY_BLOCKED', 'MDX 包含加密条目')
    }
    inflated += entry.header.size
    const compressed = Math.max(1, entry.header.compressedSize)
    if (entry.header.size > limits.maxContentBytes || entry.header.size / compressed > limits.maxZipRatio) {
      throw new SourceAccessError('SOURCE_TOO_LARGE', 'MDX 条目超过解压限制')
    }
  }
  if (inflated > limits.maxFileBytes) {
    throw new SourceAccessError('SOURCE_TOO_LARGE', 'MDX 解压总量超过限制')
  }

  const manifest = zip.getEntry('mdx.json')
  if (!manifest) throw new SourceAccessError('SOURCE_INVALID', 'MDX 缺少 mdx.json')
  let contentFile = 'content.md'
  try {
    const parsed = JSON.parse(manifest.getData().toString('utf8')) as { content_file?: string }
    contentFile = parsed.content_file ?? contentFile
  } catch {
    throw new SourceAccessError('SOURCE_INVALID', 'MDX 清单无效')
  }
  const normalized = contentFile.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new SourceAccessError('SOURCE_POLICY_BLOCKED', 'MDX 内容路径不安全')
  }
  const content = zip.getEntry(normalized)
  if (!content) throw new SourceAccessError('SOURCE_INVALID', 'MDX 内容文件不存在')
  const data = content.getData()
  if (data.length > limits.maxContentBytes) {
    throw new SourceAccessError('SOURCE_TOO_LARGE', 'MDX 内容超过解压上限')
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(data)
}

/**
 * 在内存中读取一个 MDX 文件并搜索 content.md。
 * 文件句柄在 finally 关闭；返回后不保留任何 Buffer 引用。
 */
export async function searchMdxFile(req: MdxSearchRequest): Promise<number> {
  if (req.signal.aborted) return 0
  let handle: fs.promises.FileHandle | undefined
  try {
    handle = await fs.promises.open(req.filePath, 'r')
    const stat = await handle.stat()
    if (stat.size > req.limits.maxFileBytes) {
      throw new SourceAccessError('SOURCE_TOO_LARGE', 'MDX 文件超过大小上限')
    }
    if (req.signal.aborted) return 0
    const buffer = Buffer.allocUnsafe(stat.size)
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0)
    if (bytesRead !== stat.size) throw new SourceAccessError('SOURCE_INVALID', 'MDX 读取不完整')
    const content = extractMdxContentText(buffer, req.limits)
    const matches = matchTextInContent(content, req.query, req.caseSensitive, req.isRegex, req.signal)
    for (const m of matches) {
      req.onMatch({ line: m.line, column: m.column, preview: m.preview })
    }
    return matches.length
  } finally {
    await handle?.close().catch(() => {})
  }
}
