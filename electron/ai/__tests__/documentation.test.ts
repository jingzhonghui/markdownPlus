import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')

describe('AI approval documentation', () => {
  it.each(['docs/AI助手设计方案.md', 'docs/代码结构文档.md'])(
    '%s lists the renderer-write-only claim channel and preload API',
    (relativePath) => {
      const content = fs.readFileSync(path.join(root, relativePath), 'utf8')

      expect(content).toContain('ai:approval:claim')
      expect(content).toContain('claimAiApproval')
      expect(content).toMatch(/renderer[^\n]*写|Renderer[^\n]*写/)
    }
  )

  it.each(['docs/AI助手设计方案.md', 'docs/代码结构文档.md'])(
    '%s documents distinct Main and Renderer approval sequences',
    (relativePath) => {
      const content = fs.readFileSync(path.join(root, relativePath), 'utf8')

      expect(content).toMatch(/Main[^\n]*resolve[^\n]*不[^\n]*claim/i)
      expect(content).toMatch(/Renderer[^\n]*claim[^\n]*执行[^\n]*resolve/i)
    }
  )
})
