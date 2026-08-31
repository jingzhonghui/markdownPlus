// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import SyncPanel from '../SyncPanel.vue'
import { useSyncStore } from '../../../stores/sync'

function createMockElectronAPI(overrides: Record<string, unknown> = {}) {
  return {
    syncAttachFolder: vi.fn(async () => ({ success: true, data: { status: 'upToDate', error: null, configured: true, isGitRepo: true, branch: 'main', upstream: 'origin/main' } })),
    syncDetachFolder: vi.fn(async () => ({ success: true })),
    getSyncStatus: vi.fn(async () => ({ success: true, data: { status: 'upToDate', error: null, configured: true, isGitRepo: true, branch: 'main', upstream: 'origin/main' } })),
    syncPull: vi.fn(async () => ({ success: true })),
    syncPush: vi.fn(async () => ({ success: true })),
    syncContinueRebase: vi.fn(async () => ({ success: true })),
    syncAbortRebase: vi.fn(async () => ({ success: true })),
    enableSync: vi.fn(async () => ({ success: true })),
    disableSync: vi.fn(async () => ({ success: true })),
    getSyncConfig: vi.fn(async () => ({ success: true, data: { version: 1, provider: 'git', autoCommit: true, autoPull: true, autoPush: false } })),
    setSyncConfig: vi.fn(async (_patch: unknown) => ({ success: true, data: { version: 1, provider: 'git', autoCommit: true, autoPull: true, autoPush: false } })),
    onSyncEvent: vi.fn(() => () => {}),
    onSyncFileChanged: vi.fn(() => () => {}),
    readFolder: vi.fn(async () => ({ success: true, data: [] })),
    openFile: vi.fn(),
    showOpenDialog: vi.fn(async () => ({ success: true, data: ['C:/ws'] })),
    authorizeWorkspaceRoot: vi.fn(async () => ({ success: true })),
    getRecentFiles: vi.fn(async () => ({ success: true, data: [] })),
    addRecentFile: vi.fn(async () => ({ success: true })),
    listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
    ...overrides
  }
}

describe('SyncPanel', () => {
  let pinia: Pinia
  let api: ReturnType<typeof createMockElectronAPI>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    api = createMockElectronAPI()
    vi.stubGlobal('electronAPI', api)
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: api })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders unconfigured guide when not configured', async () => {
    api.getSyncStatus.mockResolvedValue({ success: true, data: { status: 'uninitialized', error: null, configured: false, isGitRepo: true, branch: null, upstream: null } })
    const store = useSyncStore()
    await store.init()
    const { useFileStore } = await import('../../../stores/file')
    useFileStore().openedFolderPath = 'C:/ws'
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('配置同步')
  })

  it('prompts to open a folder when no workspace folder is open', async () => {
    api.getSyncStatus.mockResolvedValue({ success: true, data: { status: 'uninitialized', error: null, configured: false, isGitRepo: false, branch: null, upstream: null } })
    const store = useSyncStore()
    await store.init()
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('尚未打开工作区文件夹')
    expect(wrapper.find('[data-test="sync-open-folder"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('配置同步')
  })

  it('opens a folder from the sync panel', async () => {
    api.getSyncStatus.mockResolvedValue({ success: true, data: { status: 'uninitialized', error: null, configured: false, isGitRepo: false, branch: null, upstream: null } })
    const store = useSyncStore()
    await store.init()
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    const openBtn = wrapper.find('[data-test="sync-open-folder"]')
    await openBtn.trigger('click')
    await vi.waitFor(() => expect(api.showOpenDialog).toHaveBeenCalled())
    await vi.waitFor(() => expect(wrapper.text()).toContain('配置同步'))
  })

  it('calls enableSync with remote url and toggles', async () => {
    api.getSyncStatus.mockResolvedValue({ success: true, data: { status: 'uninitialized', error: null, configured: false, isGitRepo: false, branch: null, upstream: null } })
    const store = useSyncStore()
    await store.init()
    const { useFileStore } = await import('../../../stores/file')
    useFileStore().openedFolderPath = 'C:/ws'
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    const configBtn = wrapper.findAll('button').find((b) => b.text().includes('配置同步'))!
    await configBtn.trigger('click')
    const input = wrapper.find('input[placeholder="远程仓库地址（可选）"]')
    await input.setValue('https://example.com/repo.git')
    const enableBtn = wrapper.findAll('button').find((b) => b.text().includes('启用同步'))!
    await enableBtn.trigger('click')
    await vi.waitFor(() => expect(api.enableSync).toHaveBeenCalled())
    expect(api.enableSync).toHaveBeenCalledWith('C:/ws', expect.objectContaining({ remoteUrl: 'https://example.com/repo.git' }))
  })

  it('renders pull/push buttons and toggles when configured', async () => {
    const store = useSyncStore()
    await store.init()
    await store.refresh()
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('拉取')
    expect(wrapper.text()).toContain('推送')
  })

  it('surfaces action error when pull fails', async () => {
    const store = useSyncStore()
    await store.init()
    await store.refresh()
    api.syncPull.mockResolvedValueOnce({ success: false, error: '拉取失败测试' })
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    const pullBtn = wrapper.findAll('button').find((b) => b.text().includes('拉取'))!
    await pullBtn.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="sync-action-error"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="sync-action-error"]').text()).toBe('拉取失败测试')
  })

  it('clears action error on panel close', async () => {
    const store = useSyncStore()
    await store.init()
    await store.refresh()
    api.syncPull.mockResolvedValueOnce({ success: false, error: '拉取失败测试' })
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    const pullBtn = wrapper.findAll('button').find((b) => b.text().includes('拉取'))!
    await pullBtn.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="sync-action-error"]').exists()).toBe(true))
    const closeBtn = wrapper.find('.sync-panel-close')
    await closeBtn.trigger('click')
    expect(wrapper.find('[data-test="sync-action-error"]').exists()).toBe(false)
  })

  it('renders conflict files and continue/abort buttons when in conflict', async () => {
    api.getSyncStatus.mockResolvedValue({
      success: true,
      data: {
        status: 'conflict',
        error: null,
        configured: true,
        isGitRepo: true,
        branch: null,
        upstream: null,
        conflictedFiles: ['C:/ws/docs/a.md'],
        inRebase: true
      }
    })
    const store = useSyncStore()
    await store.init()
    await store.refresh()
    const { useFileStore } = await import('../../../stores/file')
    useFileStore().openedFolderPath = 'C:/ws'
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    expect(wrapper.find('[data-test="conflict-files"]').text()).toContain('docs/a.md')
    expect(wrapper.text()).toContain('继续')
    expect(wrapper.text()).toContain('中止')
    expect(wrapper.text()).toContain('删除冲突标记行')
    expect(wrapper.findAll('button').find((b) => b.text().includes('拉取'))).toBeUndefined()
    expect(wrapper.findAll('button').find((b) => b.text().includes('推送'))).toBeUndefined()
  })

  it('calls syncContinueRebase when continue clicked', async () => {
    api.getSyncStatus.mockResolvedValue({
      success: true,
      data: {
        status: 'conflict',
        error: null,
        configured: true,
        isGitRepo: true,
        branch: null,
        upstream: null,
        conflictedFiles: ['C:/ws/docs/a.md'],
        inRebase: true
      }
    })
    const store = useSyncStore()
    await store.init()
    await store.refresh()
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    const continueBtn = wrapper.findAll('button').find((b) => b.text().includes('继续'))!
    await continueBtn.trigger('click')
    await vi.waitFor(() => expect(api.syncContinueRebase).toHaveBeenCalled())
  })

  it('calls syncAbortRebase when abort clicked', async () => {
    api.getSyncStatus.mockResolvedValue({
      success: true,
      data: {
        status: 'conflict',
        error: null,
        configured: true,
        isGitRepo: true,
        branch: null,
        upstream: null,
        conflictedFiles: ['C:/ws/docs/a.md'],
        inRebase: true
      }
    })
    const store = useSyncStore()
    await store.init()
    await store.refresh()
    const wrapper = mount(SyncPanel, { global: { plugins: [pinia] } })
    const abortBtn = wrapper.findAll('button').find((b) => b.text().includes('中止'))!
    await abortBtn.trigger('click')
    await vi.waitFor(() => expect(api.syncAbortRebase).toHaveBeenCalled())
  })
})
