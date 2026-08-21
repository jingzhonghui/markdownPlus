import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import type { WorkspaceFileEntry } from '../../shared/ai/types'

/**
 * 工作区内容概要服务。
 *
 * 在 `<root>/.markdownPlus/` 下维护：
 * - `workspace-summary.md`：工作区内容概要（首版仅基于文件名/目录名归纳，不含文件内容）。
 * - `workspace-summary.fingerprint.json`：文件级指纹清单，用于检测工作区变更。
 *
 * 生成是懒触发的：仅在概要缺失或指纹变化时调用 LLM 重新归纳。任何失败都回退为
 * `skipped`（不抛错、不阻塞提问），由调用方决定是否使用旧概要或跳过。
 */

export interface WorkspaceSummaryResult {
  summary: string | null
  status: 'ok' | 'skipped'
  /** 本次调用是否真正重新生成（而非读取缓存）。 */
  generated: boolean
  /** 工作区完整文件索引（供 AI 工作区工具使用），无工作区/失败时为 null。 */
  files: WorkspaceFileEntry[] | null
}

export interface WorkspaceSummaryOptions {
  /** 在判定需要重新生成、调用 LLM 归纳前触发（用于 UI 推送"正在生成"提示）。 */
  onGenerating?: () => void
}

interface FileFingerprint {
  path: string
  size: number
  mtimeMs: number
  hash: string
}

interface StoredFingerprint {
  format: 1
  files: FileFingerprint[]
}

const SUMMARY_FILENAME = 'workspace-summary.md'
const FINGERPRINT_FILENAME = 'workspace-summary.fingerprint.json'
const EXCLUDED_DIRS = new Set(['.markdownPlus', '.git', 'node_modules'])
const MAX_FILES = 500

export interface WorkspaceSummaryDeps {
  /** LLM 归纳回调；缺省时不生成概要（返回 skipped）。 */
  summarize?: (fileList: string) => Promise<string>
}

function contentHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export class WorkspaceSummaryService {
  private readonly summarize: ((fileList: string) => Promise<string>) | null

  constructor(deps: WorkspaceSummaryDeps = {}) {
    this.summarize = deps.summarize ?? null
  }

  /**
   * 确保返回当前工作区概要。懒检测指纹，无变更时读缓存，否则重新生成。
   * 任何失败都返回 skipped，不抛错。
   */
  async ensureSummary(root: string, options: WorkspaceSummaryOptions = {}): Promise<WorkspaceSummaryResult> {
    try {
      if (!fs.existsSync(root)) return { summary: null, status: 'skipped', generated: false, files: null }

      const dir = path.join(root, '.markdownPlus')
      const summaryPath = path.join(dir, SUMMARY_FILENAME)
      const fingerprintPath = path.join(dir, FINGERPRINT_FILENAME)

      const stored = this.readFingerprint(fingerprintPath)
      const cachedFiles = stored ? this.collectQuick(root) : []
      const cacheFresh = stored !== null && this.sameFiles(stored.files, cachedFiles)

      // 缓存命中且概要文件存在 → 直接返回缓存（不读文件内容算 hash，不调用 LLM）
      if (cacheFresh && fs.existsSync(summaryPath)) {
        const summary = fs.readFileSync(summaryPath, 'utf8')
        const files = this.toWorkspaceEntries(root, stored.files)
        return summary.trim().length > 0
          ? { summary, status: 'ok', generated: false, files }
          : { summary: null, status: 'skipped', generated: false, files }
      }

      // 需要重新生成：先触发回调（UI 提示），再全量扫描 + LLM 归纳
      options.onGenerating?.()

      const current = this.collectFiles(root)
      if (current.length === 0) return { summary: null, status: 'skipped', generated: false, files: null }

      const files = this.toWorkspaceEntries(root, current)

      if (!this.summarize) return { summary: null, status: 'skipped', generated: false, files }

      const fileList = current.map((f) => f.path).sort().join('\n')
      const summary = await this.summarize(fileList)
      const trimmed = summary.trim()
      if (!trimmed) return { summary: null, status: 'skipped', generated: false, files }

      fs.mkdirSync(dir, { recursive: true })
      const nextFingerprint: StoredFingerprint = { format: 1, files: current }
      this.writeFileAtomic(summaryPath, trimmed)
      this.writeFileAtomic(fingerprintPath, JSON.stringify(nextFingerprint, null, 2))
      return { summary: trimmed, status: 'ok', generated: true, files }
    } catch {
      return { summary: null, status: 'skipped', generated: false, files: null }
    }
  }

  /**
   * 仅 stat 的快速指纹采集：返回每个文件的 path/size/mtimeMs（不含内容 hash）。
   * 用于缓存命中比对，避免每次提问都全量读文件内容。
   */
  private collectQuick(root: string): FileFingerprint[] {
    const entries: FileFingerprint[] = []
    const visit = (dir: string): void => {
      if (entries.length >= MAX_FILES) return
      let names: fs.Dirent[]
      try {
        names = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of names) {
        if (entries.length >= MAX_FILES) return
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name)) continue
          visit(path.join(dir, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        const full = path.join(dir, entry.name)
        try {
          const stat = fs.statSync(full)
          entries.push({
            path: path.relative(root, full).replace(/\\/g, '/'),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            hash: ''
          })
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
    visit(root)
    return entries
  }

  private toWorkspaceEntries(root: string, fingerprints: FileFingerprint[]): WorkspaceFileEntry[] {
    return fingerprints.map((f) => {
      const parts = f.path.split('/')
      const name = parts[parts.length - 1]
      return {
        name,
        path: path.join(root, ...parts).replace(/\\/g, '/'),
        isOpen: false,
        parentDirs: parts.slice(0, -1)
      }
    })
  }

  private collectFiles(root: string): FileFingerprint[] {
    const entries: FileFingerprint[] = []
    const visit = (dir: string): void => {
      if (entries.length >= MAX_FILES) return
      let names: fs.Dirent[]
      try {
        names = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of names) {
        if (entries.length >= MAX_FILES) return
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name)) continue
          visit(path.join(dir, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        const full = path.join(dir, entry.name)
        try {
          const stat = fs.statSync(full)
          const data = fs.readFileSync(full)
          entries.push({
            path: path.relative(root, full).replace(/\\/g, '/'),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            hash: contentHash(data)
          })
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
    visit(root)
    return entries
  }

  private readFingerprint(filePath: string): StoredFingerprint | null {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredFingerprint
      if (raw.format !== 1 || !Array.isArray(raw.files)) return null
      return raw
    } catch {
      return null
    }
  }

  private sameFiles(left: FileFingerprint[], right: FileFingerprint[]): boolean {
    if (left.length !== right.length) return false
    // 快速比对基于 path/size/mtimeMs（内容变更会更新 mtime），忽略 hash
    const key = (f: FileFingerprint): string => `${f.path}|${f.size}|${f.mtimeMs}`
    const leftKeys = new Set(left.map(key))
    return right.every((f) => leftKeys.has(key(f)))
  }

  private writeFileAtomic(target: string, content: string): void {
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, content, 'utf8')
    fs.renameSync(tmp, target)
  }
}
