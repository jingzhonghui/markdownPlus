import { describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { WorkspaceSummaryService } from '../workspace-summary'

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-ws-summary-'))
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.markdownPlus'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'k8s.md'), '# k8s 安装笔记\n内容', 'utf8')
  fs.writeFileSync(path.join(dir, 'README.md'), '# README', 'utf8')
  fs.writeFileSync(path.join(dir, '.markdownPlus', 'existing.md'), 'ignore me', 'utf8')
  fs.writeFileSync(path.join(dir, '.git', 'config'), 'ignore', 'utf8')
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg.js'), 'ignore', 'utf8')
  return dir
}

function fileList(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(path.relative(root, full))
    }
  }
  walk(root)
  return out.sort()
}

describe('WorkspaceSummaryService', () => {
  it('generates a summary on first use and writes md + fingerprint', async () => {
    const root = makeTempWorkspace()
    const summarize = vi.fn(async () => '该工作区是云原生运维知识库，包含 k8s 相关文档。')
    const service = new WorkspaceSummaryService({ summarize })

    const result = await service.ensureSummary(root)

    expect(result.status).toBe('ok')
    expect(result.summary).toContain('云原生运维')
    expect(summarize).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(path.join(root, '.markdownPlus', 'workspace-summary.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.markdownPlus', 'workspace-summary.fingerprint.json'))).toBe(true)
  })

  it('reads the cached summary when the fingerprint is unchanged', async () => {
    const root = makeTempWorkspace()
    const summarize = vi.fn(async () => '首个概要')
    const service = new WorkspaceSummaryService({ summarize })
    await service.ensureSummary(root)

    const summarize2 = vi.fn(async () => '不应被调用')
    const service2 = new WorkspaceSummaryService({ summarize: summarize2 })
    const result = await service2.ensureSummary(root)

    expect(result.status).toBe('ok')
    expect(result.summary).toBe('首个概要')
    expect(summarize2).not.toHaveBeenCalled()
  })

  it('regenerates when a file is added', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => 'v1' })
    await service.ensureSummary(root)

    fs.writeFileSync(path.join(root, 'docs', 'helm.md'), '# helm 指南', 'utf8')

    const summarize2 = vi.fn(async () => 'v2 含 helm')
    const service2 = new WorkspaceSummaryService({ summarize: summarize2 })
    const result = await service2.ensureSummary(root)

    expect(result.summary).toBe('v2 含 helm')
    expect(summarize2).toHaveBeenCalledTimes(1)
  })

  it('regenerates when a file is modified', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => 'v1' })
    await service.ensureSummary(root)

    const target = path.join(root, 'docs', 'k8s.md')
    const future = Date.now() + 10_000
    fs.utimesSync(target, new Date(future), new Date(future))
    fs.writeFileSync(target, '# k8s 安装笔记\n更新内容', 'utf8')

    const summarize2 = vi.fn(async () => 'v2')
    const service2 = new WorkspaceSummaryService({ summarize: summarize2 })
    const result = await service2.ensureSummary(root)

    expect(result.summary).toBe('v2')
    expect(summarize2).toHaveBeenCalledTimes(1)
  })

  it('regenerates when a file is deleted', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => 'v1' })
    await service.ensureSummary(root)

    fs.rmSync(path.join(root, 'README.md'))

    const summarize2 = vi.fn(async () => 'v2 无 README')
    const service2 = new WorkspaceSummaryService({ summarize: summarize2 })
    const result = await service2.ensureSummary(root)

    expect(result.summary).toBe('v2 无 README')
    expect(summarize2).toHaveBeenCalledTimes(1)
  })

  it('excludes .markdownPlus, .git and node_modules from the fingerprint', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => '概览' })
    await service.ensureSummary(root)

    const summarize2 = vi.fn(async () => '不应重新生成')
    const service2 = new WorkspaceSummaryService({ summarize: summarize2 })
    await service2.ensureSummary(root)

    expect(summarize2).not.toHaveBeenCalled()
    expect(fileList(root)).not.toContain('.markdownPlus/workspace-summary.md')
  })

  it('returns skipped and does not throw when the LLM summarize fails', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({
      summarize: async () => {
        throw new Error('LLM 不可用')
      }
    })

    const result = await service.ensureSummary(root)

    expect(result.status).toBe('skipped')
    expect(result.summary).toBeNull()
    expect(fs.existsSync(path.join(root, '.markdownPlus', 'workspace-summary.md'))).toBe(false)
  })

  it('returns skipped when the workspace has no documents', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-empty-'))
    const service = new WorkspaceSummaryService({ summarize: async () => '不应调用' })

    const result = await service.ensureSummary(root)

    expect(result.status).toBe('skipped')
    expect(result.summary).toBeNull()
  })

  it('returns the complete file index from disk for the workspace tools', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => '概览' })

    const result = await service.ensureSummary(root)

    expect(result.status).toBe('ok')
    expect(result.files).toBeDefined()
    const names = result.files!.map((f) => f.name)
    expect(names).toContain('k8s.md')
    expect(names).toContain('README.md')

    const k8s = result.files!.find((f) => f.name === 'k8s.md')!
    expect(k8s.path).toBe(path.join(root, 'docs', 'k8s.md').replace(/\\/g, '/'))
    expect(k8s.parentDirs).toEqual(['docs'])
    expect(k8s.isDirectory).toBeUndefined()

    const excluded = result.files!.some((f) => f.path.includes('.markdownPlus') || f.path.includes('.git') || f.path.includes('node_modules'))
    expect(excluded).toBe(false)
  })

  it('returns the cached file index even when the fingerprint is unchanged', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => '首个概要' })
    await service.ensureSummary(root)

    const result = await new WorkspaceSummaryService({ summarize: async () => '不应调用' }).ensureSummary(root)

    expect(result.status).toBe('ok')
    expect(result.files).toBeDefined()
    expect(result.files!.map((f) => f.name)).toContain('k8s.md')
  })

  it('reports generated=true and fires onGenerating when the summary is rebuilt', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => 'v1' })
    const onGenerating = vi.fn()
    const result = await service.ensureSummary(root, { onGenerating })

    expect(result.status).toBe('ok')
    expect(result.generated).toBe(true)
    expect(onGenerating).toHaveBeenCalledTimes(1)
  })

  it('reports generated=false and skips onGenerating when the cache is used', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => '首个概要' })
    await service.ensureSummary(root)

    const onGenerating = vi.fn()
    const result = await new WorkspaceSummaryService({ summarize: async () => '不应调用' }).ensureSummary(root, { onGenerating })

    expect(result.status).toBe('ok')
    expect(result.generated).toBe(false)
    expect(onGenerating).not.toHaveBeenCalled()
  })

  it('fires onGenerating only once even when the fingerprint is fresh but summary is missing', async () => {
    const root = makeTempWorkspace()
    const service = new WorkspaceSummaryService({ summarize: async () => '概览' })
    await service.ensureSummary(root)

    // 指纹一致但概要文件被删除 → 需要重新生成
    fs.rmSync(path.join(root, '.markdownPlus', 'workspace-summary.md'))

    const onGenerating = vi.fn()
    const result = await service.ensureSummary(root, { onGenerating })

    expect(result.status).toBe('ok')
    expect(result.generated).toBe(true)
    expect(onGenerating).toHaveBeenCalledTimes(1)
  })
})
