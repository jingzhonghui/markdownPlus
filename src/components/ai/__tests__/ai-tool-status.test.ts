// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import AiToolCallCard from '../AiToolCallCard.vue'
import { useAiStore } from '../../../stores/ai'

function mountCard(call: {
  toolCallId: string
  toolName: string
  status: 'running' | 'completed' | 'failed'
  result?: unknown
}) {
  return mount(AiToolCallCard, {
    props: { call },
    attachTo: document.body
  })
}

describe('AI tool call status card', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('U2a 运行中：未匹配到审批时显示「运行中」', () => {
    const wrapper = mountCard({ toolCallId: 'tool-1', toolName: 'read_document', status: 'running' })
    expect(wrapper.get('[data-testid="ai-tool-call"]').text()).toContain('read_document')
    expect(wrapper.get('.tool-badge').text()).toContain('运行中')
  })

  it('U2b 运行中且存在匹配审批：显示「等待审批」而非「运行中」', () => {
    const store = useAiStore()
    store.pendingApprovals.push({
      id: 'approval-1',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'read_document',
      title: '读取文档',
      description: '',
      effect: 'read',
      riskLevel: 'medium',
      preview: { type: 'document', title: '文档', content: 'x' },
      execution: { location: 'main' },
      createdAt: 1,
      expiresAt: 2
    })
    const wrapper = mountCard({ toolCallId: 'tool-1', toolName: 'read_document', status: 'running' })
    expect(wrapper.get('.tool-badge').text()).toContain('等待审批')
  })

  it('U2c 运行中 → 完成：携带结构化结果后显示「已完成」并渲染结果正文', () => {
    const wrapper = mountCard({
      toolCallId: 'tool-1',
      toolName: 'read_document',
      status: 'completed',
      result: { status: 'completed', data: { title: '研究笔记', characterCount: 42 } }
    })
    expect(wrapper.get('.tool-badge').text()).toContain('已完成')
    expect(wrapper.text()).toContain('研究笔记')
    expect(wrapper.text()).toContain('42')
  })

  it('U2d 运行中 → 失败：返回 failed 后显示「失败」并渲染错误消息', () => {
    const wrapper = mountCard({
      toolCallId: 'tool-1',
      toolName: 'read_document',
      status: 'failed',
      result: { status: 'failed', message: '工具输入无效：query 必填' }
    })
    expect(wrapper.get('.tool-badge').text()).toContain('失败')
    expect(wrapper.text()).toContain('工具输入无效')
  })

  it('U2e 已拒绝：渲染「已拒绝」徽标与拒绝原因', () => {
    const wrapper = mountCard({
      toolCallId: 'tool-1',
      toolName: 'replace_document',
      status: 'failed',
      result: { status: 'rejected', message: '用户拒绝了该操作' }
    })
    expect(wrapper.get('.tool-badge').text()).toContain('已拒绝')
    expect(wrapper.text()).toContain('用户拒绝了该操作')
  })

  it('U2f 冲突：渲染「冲突」徽标与冲突提示', () => {
    const wrapper = mountCard({
      toolCallId: 'tool-1',
      toolName: 'replace_document',
      status: 'failed',
      result: { status: 'conflict', message: '文档已被修改' }
    })
    expect(wrapper.get('.tool-badge').text()).toContain('冲突')
    expect(wrapper.text()).toContain('文档已被修改')
  })

  it('U2g 已应用：渲染「已应用」徽标', () => {
    const wrapper = mountCard({
      toolCallId: 'tool-1',
      toolName: 'replace_document',
      status: 'completed',
      result: { status: 'applied', data: { revision: 8 } }
    })
    expect(wrapper.get('.tool-badge').text()).toContain('已应用')
  })
})
