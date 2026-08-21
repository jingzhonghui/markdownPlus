// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AiPanel from '../AiPanel.vue'
import { useAiStore } from '../../../stores/ai'

const electronAPI = {
  getAiConfig: vi.fn(),
  startAiRun: vi.fn(),
  cancelAiRun: vi.fn(),
  onAiRunEvent: vi.fn(() => () => undefined)
}

function mountPanel(ready = true) {
  return mount(AiPanel, { props: { ready }, attachTo: document.body })
}

describe('AI panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    electronAPI.getAiConfig.mockResolvedValue({
      success: true,
      data: { baseUrl: 'https://example.test/v1', model: 'writer', temperature: 0.4, hasApiKey: true }
    })
    vi.stubGlobal('electronAPI', electronAPI)
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: electronAPI })
  })

  it('renders ordered user and assistant Markdown while streaming remains one message', async () => {
    const store = useAiStore()
    store.messages.push(
      { id: 'u1', role: 'user', content: '**提问**' },
      { id: 'a1', role: 'assistant', content: '第一段' }
    )
    const wrapper = mountPanel()
    await nextTick()

    const messages = wrapper.findAll('[data-testid="ai-message"]')
    expect(messages).toHaveLength(2)
    expect(messages[0].html()).toContain('<strong>提问</strong>')
    expect(messages[1].text()).toContain('第一段')

    store.activeRunId = 'run-1'
    store.running = true
    store.$state.messages[1].content += '，第二段'
    await nextTick()
    expect(wrapper.findAll('[data-testid="ai-message"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="ai-message"]')[1].text()).toContain('第一段，第二段')
  })

  it('streams analysis content into the analysis card instead of the answer body', async () => {
    const store = useAiStore()
    store.messages.push({ id: 'a1', role: 'assistant', content: '正在探索工作区结构。' })
    const wrapper = mountPanel()
    await nextTick()

    store.activeRunId = 'run-1'
    store.running = true
    store.$state.messages[0].content += '\n继续查找工作记录。'
    await nextTick()

    const analysisCard = wrapper.get('[data-testid="ai-analysis-card"]')
    expect(analysisCard.text()).toContain('正在分析...')
    expect(analysisCard.text()).toContain('正在探索工作区结构。')
    expect(analysisCard.text()).toContain('继续查找工作记录。')
    expect(wrapper.find('.message-body').exists()).toBe(false)
  })

  it('moves analysis into the card and answer into the body once end-analysis appears', async () => {
    const store = useAiStore()
    store.messages.push({ id: 'a1', role: 'assistant', content: '<!-- analysis -->\n已找到记录。\n<!-- end-analysis -->\n**正式回答**' })
    const wrapper = mountPanel()
    await nextTick()

    const analysisCard = wrapper.get('[data-testid="ai-analysis-card"]')
    expect(analysisCard.text()).toContain('分析过程')
    expect(analysisCard.text()).toContain('已找到记录')
    expect(wrapper.get('.message-body').text()).toContain('正式回答')
  })

  it('parses variant analysis tags so raw markers never leak into the card or body', async () => {
    const store = useAiStore()
    store.messages.push({
      id: 'a1',
      role: 'assistant',
      content: '当前日期是 2026-08-20。\n<!-- analysis -- >\n当前日期为 2026-08-20。\n<!-- end-analysis -->\n根据记录回答如下。'
    })
    const wrapper = mountPanel()
    await nextTick()

    const analysisCard = wrapper.get('[data-testid="ai-analysis-card"]')
    expect(analysisCard.text()).toContain('当前日期是 2026-08-20。')
    expect(analysisCard.text()).toContain('当前日期为 2026-08-20。')
    expect(analysisCard.text()).not.toContain('<!-- analysis')
    expect(wrapper.get('.message-body').text()).toContain('根据记录回答如下。')
    expect(wrapper.get('.message-body').text()).not.toContain('<!-- end-analysis')
  })

  it('keeps multiple analysis blocks in the card and only the final answer in the body', async () => {
    const store = useAiStore()
    store.messages.push({
      id: 'a1',
      role: 'assistant',
      content: '<!-- analysis -->\n第一次分析。\n<!-- end-analysis --><!-- analysis -->\n第二次分析。\n<!-- end-analysis -->\n\n根据工作记录正式回答。'
    })
    const wrapper = mountPanel()
    await nextTick()

    const analysisCard = wrapper.get('[data-testid="ai-analysis-card"]')
    expect(analysisCard.text()).toContain('第一次分析。')
    expect(analysisCard.text()).toContain('第二次分析。')
    expect(analysisCard.text()).not.toContain('<!-- analysis')
    expect(wrapper.get('.message-body').text()).toBe('根据工作记录正式回答。')
    expect(wrapper.get('.message-body').text()).not.toContain('<!--')
  })

  it('escapes raw HTML and renders every URL as non-navigating text', async () => {
    const store = useAiStore()
    store.messages.push({
      id: 'a1', role: 'assistant',
      content: '<img src=x onerror="alert(1)"> [web](https://example.com) [relative](/docs) [protocol](//example.com) [mail](mailto:test@example.com) [bad](javascript:alert(1))'
    })
    const body = mountPanel().get('.message-body')

    expect(body.find('img').exists()).toBe(false)
    expect(body.text()).toContain('<img src=x onerror=')
    expect(body.text()).toContain('alert(1)')
    expect(body.find('a').exists()).toBe(false)
    expect(body.text()).toContain('web')
    expect(body.text()).toContain('relative')
    expect(body.text()).toContain('protocol')
    expect(body.text()).toContain('mail')
  })

  it('reacts to readiness changes and disables send during an active run', async () => {
    const wrapper = mountPanel()
    const send = wrapper.get('[data-testid="ai-send"]')
    expect(send.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="ai-input"]').setValue('请续写')
    await nextTick()
    expect(send.attributes('disabled')).toBeUndefined()

    await wrapper.setProps({ ready: false })
    expect(send.attributes('disabled')).toBeDefined()
    await wrapper.setProps({ ready: true })
    expect(send.attributes('disabled')).toBeUndefined()

    const store = useAiStore()
    store.running = true
    await nextTick()
    expect(wrapper.find('[data-testid="ai-send"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="ai-stop"]').exists()).toBe(true)
  })

  it('does not submit Enter while an IME composition is active', async () => {
    const store = useAiStore()
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue()
    const wrapper = mountPanel()
    const input = wrapper.get('[data-testid="ai-input"]')
    await input.setValue('中文输入')

    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(send).not.toHaveBeenCalled()
    await input.trigger('keydown', { key: 'Enter', isComposing: false })
    expect(send).toHaveBeenCalledWith('中文输入')
  })

  it('stops generation through cancelRun and renders tool name and status', async () => {
    const store = useAiStore()
    const cancel = vi.spyOn(store, 'cancelRun').mockResolvedValue(true)
    store.running = true
    store.messages.push({ id: 'msg-1', role: 'assistant', content: '' })
    store.toolCalls.push({ toolCallId: 'tool-1', toolName: 'read_document', status: 'running', messageId: 'msg-1' })
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="ai-stop"]').trigger('click')

    expect(cancel).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="ai-tool-call"]').text()).toContain('read_document')
    expect(wrapper.get('[data-testid="ai-tool-call"]').text()).toContain('运行中')
  })

  it('renders a meaningful tool result instead of an object coercion', () => {
    const store = useAiStore()
    store.messages.push({ id: 'msg-2', role: 'assistant', content: '' })
    store.toolCalls.push({
      toolCallId: 'tool-1', toolName: 'read_document', status: 'completed',
      result: { status: 'completed', data: { title: '研究笔记', characterCount: 42 } },
      messageId: 'msg-2'
    })
    const card = mountPanel().get('[data-testid="ai-tool-call"]')

    expect(card.text()).toContain('研究笔记')
    expect(card.text()).toContain('42')
    expect(card.text()).not.toContain('[object Object]')
  })

  it('renders without a clear button', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="ai-clear"]').exists()).toBe(false)
  })

  it('renders conversation sidebar and workbench side by side without source registration controls', () => {
    const wrapper = mountPanel()

    const panel = wrapper.get('.ai-panel')
    expect(panel.element.children).toHaveLength(2)
    expect(panel.element.firstElementChild).toBe(wrapper.get('aside').element)
    expect(wrapper.get('aside').element.nextElementSibling).toBe(wrapper.get('.workbench').element)
    expect(wrapper.find('[data-testid="material-url-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="material-add-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="material-dropzone"]').exists()).toBe(false)
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
  })

  it('emits settings while preserving the conversation workbench', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="ai-settings"]').trigger('click')

    expect(wrapper.emitted('openSettings')).toHaveLength(1)
    expect(wrapper.get('.workbench').exists()).toBe(true)
  })

  it('shows a generating card while the workspace summary is being built', async () => {
    const store = useAiStore()
    store.summaryStatus = 'generating'
    const wrapper = mountPanel()
    await nextTick()

    const card = wrapper.get('[data-testid="ai-summary-status"]')
    expect(card.text()).toContain('正在生成工作区概要')
  })

  it('shows a failure hint when the summary generation fails', async () => {
    const store = useAiStore()
    store.summaryStatus = 'failed'
    const wrapper = mountPanel()
    await nextTick()

    const card = wrapper.get('[data-testid="ai-summary-status"]')
    expect(card.text()).toContain('概要生成失败')
  })

  it('hides the card when the summary status is idle', async () => {
    const store = useAiStore()
    store.summaryStatus = 'idle'
    const wrapper = mountPanel()
    await nextTick()

    expect(wrapper.find('[data-testid="ai-summary-status"]').exists()).toBe(false)
  })

  it('auto-scrolls the message list to the bottom when messages change', async () => {
    const store = useAiStore()
    store.messages.push({ id: 'm1', role: 'user', content: '提问' })
    const wrapper = mountPanel()
    await nextTick()

    const list = wrapper.get('.message-list').element as HTMLElement
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 2000 })
    list.scrollTop = 0

    store.messages.push({ id: 'm2', role: 'assistant', content: '回答' })
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(list.scrollTop).toBe(2000)
  })
})
