import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../channels'
import type { SyncEngine } from '../../sync/engine'
import type { SyncConfig, SyncStatusView } from '../../sync/types'

type Handler = (...args: unknown[]) => unknown

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    })
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler
  },
  BrowserWindow: class {}
}))

function makeStatusView(overrides: Partial<SyncStatusView> = {}): SyncStatusView {
  return {
    status: 'upToDate',
    error: null,
    configured: true,
    isGitRepo: true,
    branch: 'main',
    upstream: 'origin/main',
    ...overrides
  }
}

describe('sync-handlers', () => {
  let engine: Pick<SyncEngine, 'getStatusView' | 'pull' | 'push' | 'enable' | 'disable' | 'getConfig' | 'setConfig' | 'attach' | 'detach' | 'onEvent' | 'onFileChanged' | 'continueRebase' | 'abortRebase'>

  beforeEach(async () => {
    electronMocks.handlers.clear()
    vi.resetModules()
    const engineMock = {
      getStatusView: vi.fn(() => makeStatusView()),
      pull: vi.fn(async () => ({ success: true })),
      push: vi.fn(async () => ({ success: true })),
      enable: vi.fn(async () => ({ success: true })),
      disable: vi.fn(),
      getConfig: vi.fn(() => null),
      setConfig: vi.fn((patch: unknown): SyncConfig => ({ version: 1, provider: 'git', autoCommit: true, autoPull: true, autoPush: false, ...(patch as object) })),
      attach: vi.fn(async () => {}),
      detach: vi.fn(),
      continueRebase: vi.fn(async () => ({ success: true })),
      abortRebase: vi.fn(async () => ({ success: true })),
      onEvent: vi.fn(),
      onFileChanged: vi.fn()
    }
    engine = engineMock
    const mod = await import('../sync-handlers')
    mod.registerSyncHandlers(engineMock as unknown as SyncEngine, () => null)
  })

  it('STATUS returns the engine status view', async () => {
    const handler = electronMocks.handlers.get(IPC_CHANNELS.SYNC.STATUS)!
    const result = (await handler({})) as { success: boolean; data: SyncStatusView }
    expect(result.success).toBe(true)
    expect(result.data.status).toBe('upToDate')
  })

  it('PULL forwards to engine.pull', async () => {
    const handler = electronMocks.handlers.get(IPC_CHANNELS.SYNC.PULL)!
    const result = (await handler({})) as { success: boolean }
    expect(result.success).toBe(true)
    expect(engine.pull).toHaveBeenCalled()
  })

  it('ENABLE forwards workspace path and options to engine.enable', async () => {
    const handler = electronMocks.handlers.get(IPC_CHANNELS.SYNC.ENABLE)!
    await handler({}, 'C:/ws', { remoteUrl: 'https://x.git', autoPush: true })
    expect(engine.enable).toHaveBeenCalledWith('C:/ws', { remoteUrl: 'https://x.git', autoPush: true })
  })

  it('CONFIG.SET forwards patch to engine.setConfig', async () => {
    const handler = electronMocks.handlers.get(IPC_CHANNELS.SYNC.CONFIG.SET)!
    const result = (await handler({}, { autoPush: true })) as { success: boolean; data?: { autoPush: boolean } }
    expect(result.success).toBe(true)
    expect(result.data?.autoPush).toBe(true)
  })

  it('CONTINUE_REBASE forwards to engine.continueRebase', async () => {
    const handler = electronMocks.handlers.get(IPC_CHANNELS.SYNC.CONTINUE_REBASE)!
    const result = (await handler({})) as { success: boolean }
    expect(result.success).toBe(true)
    expect(engine.continueRebase).toHaveBeenCalled()
  })

  it('ABORT_REBASE forwards to engine.abortRebase', async () => {
    const handler = electronMocks.handlers.get(IPC_CHANNELS.SYNC.ABORT_REBASE)!
    const result = (await handler({})) as { success: boolean }
    expect(result.success).toBe(true)
    expect(engine.abortRebase).toHaveBeenCalled()
  })
})
