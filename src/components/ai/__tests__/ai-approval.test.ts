// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { ToolApprovalRequest } from '../../../../shared/ai/types'
import AiApprovalDialog from '../AiApprovalDialog.vue'
import { useAiStore } from '../../../stores/ai'

function approval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    id: 'approval-1',
    runId: 'run-1',
    toolCallId: 'tool-1',
    toolName: 'replace_document',
    title: '更新文档',
    description: '将修改当前文档',
    reason: '修正内容',
    effect: 'write',
    riskLevel: 'medium',
    preview: { type: 'markdown-diff', title: 'README', before: '保留\n删除', after: '保留\n新增' },
    execution: { location: 'main' },
    createdAt: 1,
    expiresAt: 2,
    ...overrides
  }
}

describe('AI approval dialog', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows markdown line differences, reason, and counts', () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval())
    const wrapper = mount(AiApprovalDialog)

    expect(wrapper.text()).toContain('README')
    expect(wrapper.text()).toContain('修正内容')
    expect(wrapper.get('[data-testid="diff-added-count"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="diff-deleted-count"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="diff-added"]').text()).toContain('新增')
    expect(wrapper.get('[data-testid="diff-deleted"]').text()).toContain('删除')
  })

  it('shows a full generated Markdown document', () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval({ preview: { type: 'document', title: '新文档', content: '# 标题\n\n**正文**' } }))
    const wrapper = mount(AiApprovalDialog)

    expect(wrapper.text()).toContain('新文档')
    expect(wrapper.get('[data-testid="document-preview"]').html()).toContain('<h1>标题</h1>')
    expect(wrapper.get('[data-testid="document-preview"]').html()).toContain('<strong>正文</strong>')
  })

  it('renders generated Markdown without raw HTML or navigating links', () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval({ preview: {
      type: 'document', title: '新文档',
      content: '<script>alert(1)</script> [web](https://example.test) [relative](/draft) [mail](mailto:a@example.test) [bad](javascript:alert(1))'
    } }))
    const preview = mount(AiApprovalDialog).get('[data-testid="document-preview"]')

    expect(preview.find('script').exists()).toBe(false)
    expect(preview.text()).toContain('<script>alert(1)</script>')
    expect(preview.find('a').exists()).toBe(false)
    expect(preview.text()).toContain('web')
    expect(preview.text()).toContain('relative')
    expect(preview.text()).toContain('mail')
  })

  it('summarizes a network request with its reason without performing it', () => {
    const store = useAiStore()
    const resolve = vi.spyOn(store, 'resolveApproval')
    store.pendingApprovals.push(approval({
      preview: {
        type: 'network-request', method: 'GET', url: 'https://example.test/api',
        reason: '读取参考资料', bodySummary: '{"name":"doc"}'
      }
    }))
    const wrapper = mount(AiApprovalDialog)

    expect(wrapper.text()).toContain('GET')
    expect(wrapper.text()).toContain('https://example.test/api')
    expect(wrapper.text()).toContain('读取参考资料')
    expect(wrapper.text()).toContain('{"name":"doc"}')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('shows local-file read details and formats the optional size', () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval({
      preview: {
        type: 'local-file-read',
        requestedPath: '.\\notes\\draft.md',
        normalizedPath: 'C:\\workspace\\notes\\draft.md',
        fileType: 'markdown',
        size: 1536,
        reason: '引用本地草稿'
      }
    }))
    const wrapper = mount(AiApprovalDialog)

    expect(wrapper.text()).toContain('.\\notes\\draft.md')
    expect(wrapper.text()).toContain('C:\\workspace\\notes\\draft.md')
    expect(wrapper.text()).toContain('markdown')
    expect(wrapper.text()).toContain('1.5 KB')
    expect(wrapper.text()).toContain('引用本地草稿')
  })

  it('fails closed for an unsupported runtime preview', () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval({ preview: { type: 'model-component' } as never }))
    const wrapper = mount(AiApprovalDialog)

    expect(wrapper.get('[data-testid="unsupported-preview"]').text()).toContain('不支持')
    expect(wrapper.find('[data-testid="approval-allow"]').exists()).toBe(false)
  })

  it.each([
    null,
    {},
    { type: 'document', title: '缺少正文' },
    { type: 'network-request', method: 'GET', url: 'https://example.test' },
    {
      type: 'local-file-read', requestedPath: 'a.md', normalizedPath: 'C:\\a.md',
      fileType: 'markdown', size: '10', reason: '读取'
    },
    {
      type: 'local-file-read', requestedPath: 'a.md', normalizedPath: 'C:\\a.md',
      fileType: 'binary', reason: '读取'
    },
    {
      type: 'local-file-read', requestedPath: 'a.md', normalizedPath: 'C:\\a.md',
      fileType: 'markdown'
    }
  ])(
    'fails closed for malformed runtime preview %#',
    (preview) => {
      const store = useAiStore()
      store.pendingApprovals.push(approval({ preview: preview as never }))
      const wrapper = mount(AiApprovalDialog)

      expect(wrapper.get('[data-testid="unsupported-preview"]').text()).toContain('不支持')
      expect(wrapper.find('[data-testid="approval-allow"]').exists()).toBe(false)
    }
  )

  it('rejects without applying and only displays the first queued approval', async () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval(), approval({ id: 'approval-2', title: '第二项' }))
    const resolve = vi.spyOn(store, 'resolveApproval').mockResolvedValue()
    const wrapper = mount(AiApprovalDialog)

    expect(wrapper.text()).not.toContain('第二项')
    await wrapper.get('[data-testid="approval-reject"]').trigger('click')
    expect(resolve).toHaveBeenCalledWith('approval-1', { status: 'rejected' })
  })

  it('delegates allow to the store and prevents duplicate submissions while resolving', async () => {
    const store = useAiStore()
    store.pendingApprovals.push(approval())
    let finish!: () => void
    const resolve = vi.spyOn(store, 'resolveApproval').mockImplementation(() => new Promise<void>((done) => { finish = done }))
    const wrapper = mount(AiApprovalDialog)
    const allow = wrapper.get('[data-testid="approval-allow"]')

    await allow.trigger('click')
    await allow.trigger('click')
    expect(resolve).toHaveBeenCalledOnce()
    expect(resolve).toHaveBeenCalledWith('approval-1', { status: 'approved', scope: 'once' })
    expect(wrapper.get('[data-testid="approval-allow"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="approval-reject"]').attributes('disabled')).toBeDefined()
    finish()
    await nextTick()
  })
})
