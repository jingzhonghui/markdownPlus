// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AiConversationSidebar from '../AiConversationSidebar.vue'
import { useAiStore } from '../../../stores/ai'
import { requestDialog } from '../../../utils/dialog'

vi.mock('../../../utils/dialog', () => ({
  requestDialog: vi.fn(async () => 0)
}))

const electronAPI = {
  listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
  onAiRunEvent: vi.fn(() => () => undefined)
}

function mountSidebar() {
  return mount(AiConversationSidebar, { attachTo: document.body })
}

describe('AI conversation sidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('electronAPI', electronAPI)
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: electronAPI })
  })

  it('renders the conversation list with titles', async () => {
    const store = useAiStore()
    store.conversations.push(
      { id: 'conv_a', title: '第一个会话', createdAt: 1, updatedAt: 100, messageCount: 2 },
      { id: 'conv_b', title: '第二个会话', createdAt: 2, updatedAt: 200, messageCount: 4 }
    )
    const wrapper = mountSidebar()
    await nextTick()

    expect(wrapper.findAll('[data-testid="ai-conversation-item"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('第一个会话')
    expect(wrapper.text()).toContain('第二个会话')
  })

  it('creates a new conversation via the header button', async () => {
    const store = useAiStore()
    const wrapper = mountSidebar()
    await wrapper.get('[data-testid="ai-new-conversation"]').trigger('click')

    expect(store.activeConversationId).toBeNull()
  })

  it('opens a conversation on click', async () => {
    const store = useAiStore()
    const open = vi.spyOn(store, 'openConversation').mockResolvedValue()
    store.conversations.push({ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })
    const wrapper = mountSidebar()
    await nextTick()

    await wrapper.get('[data-testid="ai-conversation-item"]').trigger('click')

    expect(open).toHaveBeenCalledWith('conv_a')
  })

  it('shows a rename/delete context menu on right-click', async () => {
    const store = useAiStore()
    store.conversations.push({ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })
    const wrapper = mountSidebar()
    await nextTick()

    await wrapper.get('[data-testid="ai-conversation-item"]').trigger('contextmenu')

    expect(wrapper.text()).toContain('重命名')
    expect(wrapper.text()).toContain('删除')
  })

  it('deletes a conversation after confirmation', async () => {
    const store = useAiStore()
    const del = vi.spyOn(store, 'deleteConversation').mockResolvedValue()
    store.conversations.push({ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })
    const wrapper = mountSidebar()
    await nextTick()

    await wrapper.get('[data-testid="ai-conversation-item"]').trigger('contextmenu')
    await wrapper.findAll('.context-menu-item')[1].trigger('click')
    await nextTick()

    expect(requestDialog).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('conv_a')
  })
})
