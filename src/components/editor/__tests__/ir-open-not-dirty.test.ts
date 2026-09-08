// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import IrEditor from '../IrEditor.vue'
import { useFileStore } from '../../../stores/file'
import { createMdxDocument } from '../../../types/mdx'

function stubElectronAPI(content: string): void {
  const api = {
    openFile: vi.fn().mockResolvedValue({
      success: true,
      data: {
        document: createMdxDocument('doc', content),
        filePath: 'C:/ws/a.md',
        format: 'markdown',
        isNew: false,
        largeFileWarning: false
      }
    }),
    getImage: vi.fn(async () => ({ success: true })),
    setCachedImage: vi.fn(),
    getRecentFiles: vi.fn(async () => ({ success: true, data: [] })),
    clearRecovery: vi.fn(async () => ({ success: true })),
    writeRecovery: vi.fn(async () => ({ success: true })),
    readRecovery: vi.fn(async () => ({ success: true, data: null })),
    recoveryStatus: vi.fn(async () => ({ success: true, data: { available: false } })),
    addRecentFile: vi.fn(async () => ({ success: true }))
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api })
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  })
  vi.stubGlobal('navigator', { userAgent: 'Windows', clipboard: { writeText: vi.fn(), readText: vi.fn(async () => '') } })
  // @ts-expect-error 测试环境最小 DOM
  window.requestAnimationFrame ??= (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)
  // @ts-expect-error 测试环境最小 DOM
  window.cancelAnimationFrame ??= (id: number) => clearTimeout(id)
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
    await nextTick()
  }
}

describe('IrEditor 打开未编辑文件不应标记未保存', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  const contents: Array<{ name: string; text: string }> = [
    { name: '普通标题', text: '# Hello\n\nWorld\n' },
    { name: '纯文本', text: 'just some words\n' },
    { name: '以表格结尾', text: '| a | b |\n| --- | --- |\n| 1 | 2 |\n' },
    { name: '以代码块结尾', text: 'text\n\n```js\ncode\n```\n' },
    { name: 'CRLF', text: '# Hello\r\n\r\nWorld\r\n' },
    { name: '任务列表', text: '- [ ] todo\n- [x] done\n' },
    { name: '中文内容', text: '# 标题\n\n正文内容\n' },
    { name: '空文档', text: '' }
  ]

  for (const c of contents) {
    it(`挂载后不会置脏：${c.name}`, async () => {
      stubElectronAPI(c.text)
      const store = useFileStore()
      await store.openFile('C:/ws/a.md')
      expect(store.isModified).toBe(false)

      mount(IrEditor, { attachTo: document.body })
      await settle()

      expect(store.isModified).toBe(false)
    })
  }
})
