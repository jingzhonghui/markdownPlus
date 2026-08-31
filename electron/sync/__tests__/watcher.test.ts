import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createWorkspaceWatcher } from '../watcher'

async function waitFor(fn: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('createWorkspaceWatcher', () => {
  it('reports file changes after debounce and ignores ignored dirs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-watcher-'))
    const collected: string[] = []
    const handle = createWorkspaceWatcher(
      dir,
      (files) => collected.push(...files),
      { debounceMs: 150 }
    )
    try {
      // 等待 chokidar 完成初始扫描（ignoreInitial 会吞掉就绪前创建的文件事件），
      // 避免同步创建文件与异步初始化之间的竞态。
      await new Promise((r) => setTimeout(r, 200))
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'docs', 'a.md'), '# a', 'utf-8')
      fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.git', 'index'), 'x', 'utf-8')
      fs.mkdirSync(path.join(dir, '.markdownPlus'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.markdownPlus', 'sync.json'), '{}', 'utf-8')

      await waitFor(() => collected.some((p) => p.endsWith('a.md')))
      expect(collected.some((p) => p.includes('.git'))).toBe(false)
      expect(collected.some((p) => p.includes('.markdownPlus'))).toBe(false)
    } finally {
      handle.dispose()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not fire when there are no changes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-watcher-idle-'))
    const collected: string[] = []
    const handle = createWorkspaceWatcher(dir, (files) => collected.push(...files), { debounceMs: 100 })
    await new Promise((r) => setTimeout(r, 300))
    expect(collected).toHaveLength(0)
    handle.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
