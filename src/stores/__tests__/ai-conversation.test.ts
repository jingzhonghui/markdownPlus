import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiStore } from '../ai'
import type { AiRunEvent } from '../../../shared/ai/types'

function makeStore() {
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  })
  let eventHandler: ((event: AiRunEvent) => void) | null = null
  const electronApi = {
    listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
    loadAiConversation: vi.fn(),
    saveAiConversation: vi.fn(async () => ({ success: true })),
    deleteAiConversation: vi.fn(async () => ({ success: true })),
    summarizeAiConversation: vi.fn(async () => ({ success: true, data: { title: 'LLM标题' } })),
    startAiRun: vi.fn(async () => ({ success: true, data: { runId: 'r1' } })),
    cancelAiRun: vi.fn(async () => ({ success: true })),
    claimAiApproval: vi.fn(async () => ({ success: true })),
    resolveAiApproval: vi.fn(async () => ({ success: true })),
    getAiConfig: vi.fn(),
    onAiRunEvent: vi.fn((cb: (event: AiRunEvent) => void) => {
      eventHandler = cb
      return () => {
        eventHandler = null
      }
    }),
    onWorkspaceSummaryGenerating: vi.fn(() => () => undefined)
  }
  vi.stubGlobal('window', { electronAPI: electronApi })
  return {
    electronApi,
    emit: (event: AiRunEvent): void => eventHandler!(event)
  }
}

describe('ai store conversation records', () => {
  it('creates a conversation on first send with a truncated placeholder title', async () => {
    vi.useFakeTimers()
    const { electronApi } = makeStore()
    const store = useAiStore()

    await store.sendMessage('这是一段非常长的第一条用户消息，用来测试截取标题')
    await vi.runOnlyPendingTimersAsync()

    expect(store.activeConversationId).toMatch(/^conv_/)
    expect(store.conversationTitle).toBe('这是一段非常长的第一条用户消息，用来测试…')
    expect(store.messages).toHaveLength(1)
    expect(electronApi.saveAiConversation).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('appends analysis markers and persists after a terminal run event', async () => {
    vi.useFakeTimers()
    const { electronApi, emit } = makeStore()
    const store = useAiStore()
    store.init()

    await store.sendMessage('你好')
    emit({ type: 'run-completed', runId: 'r1' })
    await vi.runOnlyPendingTimersAsync()

    expect(electronApi.saveAiConversation).toHaveBeenCalled()
    expect(electronApi.summarizeAiConversation).toHaveBeenCalledWith('你好')
    expect(store.conversationTitle).toBe('LLM标题')
    vi.useRealTimers()
  })

  it('loadConversations restores the last active conversation', async () => {
    const { electronApi } = makeStore()
    electronApi.listAiConversations.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'conv_x', title: '历史', createdAt: 1, updatedAt: 2, messageCount: 2 }]
    })
    electronApi.loadAiConversation.mockResolvedValueOnce({
      success: true,
      data: {
        version: 1,
        id: 'conv_x',
        title: '历史',
        createdAt: 1,
        updatedAt: 2,
        messageCount: 2,
        messages: [
          { id: 'm1', role: 'user', content: '旧问题', createdAt: 1 },
          { id: 'm2', role: 'assistant', content: '旧答案', createdAt: 2 }
        ],
        toolSummaries: [
          { toolCallId: 'tc1', toolName: 'read_current_document', status: 'completed', messageId: 'm2' },
          { toolCallId: 'tc2', toolName: 'read_current_document', status: 'completed' }
        ]
      }
    })
    const store = useAiStore()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ aiActiveConversationId: 'conv_x' })),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })

    await store.loadConversations(null)

    expect(store.activeConversationId).toBe('conv_x')
    expect(store.messages).toHaveLength(2)
    // 带 messageId 的精确恢复；缺失 messageId 的兜底挂到第一条 assistant 消息
    expect(store.toolCalls).toEqual([
      { toolCallId: 'tc1', toolName: 'read_current_document', status: 'completed', messageId: 'm2' },
      { toolCallId: 'tc2', toolName: 'read_current_document', status: 'completed', messageId: 'm2' }
    ])
  })

  it('newConversation clears the active state', async () => {
    makeStore()
    const store = useAiStore()
    store.activeConversationId = 'conv_1'
    store.messages.push({ id: 'm1', role: 'user', content: 'hi' })

    store.newConversation()

    expect(store.activeConversationId).toBeNull()
    expect(store.messages).toEqual([])
  })

  it('does not reuse message ids after loading a conversation', async () => {
    const { electronApi } = makeStore()
    electronApi.listAiConversations.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'conv_x', title: '历史', createdAt: 1, updatedAt: 2, messageCount: 2 }]
    })
    electronApi.loadAiConversation.mockResolvedValueOnce({
      success: true,
      data: {
        version: 1,
        id: 'conv_x',
        title: '历史',
        createdAt: 1,
        updatedAt: 2,
        messageCount: 2,
        messages: [
          { id: 'msg_1', role: 'user', content: '旧问题', createdAt: 1 },
          { id: 'msg_2', role: 'assistant', content: '旧答案', createdAt: 2 }
        ],
        toolSummaries: []
      }
    })
    const store = useAiStore()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ aiActiveConversationId: 'conv_x' })),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
    await store.loadConversations(null)

    await store.sendMessage('新问题')

    expect(store.messages).toHaveLength(3)
    expect(store.messages[0].id).toBe('msg_1')
    expect(store.messages[1].id).toBe('msg_2')
    expect(store.messages[2].id).not.toBe('msg_1')
    expect(store.messages[2].id).not.toBe('msg_2')
    expect(store.messages[2].id).toBe('msg_3')
  })

  it('deleteConversation removes the record and starts a new conversation when active', async () => {
    const { electronApi } = makeStore()
    const store = useAiStore()
    store.activeConversationId = 'conv_1'
    store.conversations.push({ id: 'conv_1', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })

    await store.deleteConversation('conv_1')

    expect(electronApi.deleteAiConversation).toHaveBeenCalledWith(null, 'conv_1')
    expect(store.activeConversationId).toBeNull()
  })

  it('renameConversation marks the title as custom for the active conversation', async () => {
    vi.useFakeTimers()
    const { electronApi } = makeStore()
    const store = useAiStore()
    store.activeConversationId = 'conv_1'

    await store.renameConversation('conv_1', '  自定义标题  ')
    await vi.runOnlyPendingTimersAsync()

    expect(store.conversationTitle).toBe('自定义标题')
    expect(store.titleSource).toBe('custom')
    expect(electronApi.saveAiConversation).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
