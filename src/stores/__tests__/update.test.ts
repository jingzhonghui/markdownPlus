import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUpdateStore } from '../update'

type Listener = (payload?: unknown) => void

interface MockApi {
  checkForUpdates: ReturnType<typeof vi.fn>
  downloadUpdate: ReturnType<typeof vi.fn>
  quitAndInstall: ReturnType<typeof vi.fn>
  onUpdateAvailable: (cb: Listener) => () => void
  onUpdateNotAvailable: (cb: Listener) => () => void
  onUpdateProgress: (cb: Listener) => () => void
  onUpdateDownloaded: (cb: Listener) => () => void
  onUpdateError: (cb: Listener) => () => void
  handlers: Record<string, Listener>
}

function createMockApi(): MockApi {
  const handlers: Record<string, Listener> = {}
  const makeListener = (name: string) => (cb: Listener) => {
    handlers[name] = cb
    return () => {
      delete handlers[name]
    }
  }
  return {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    onUpdateAvailable: makeListener('available'),
    onUpdateNotAvailable: makeListener('not-available'),
    onUpdateProgress: makeListener('progress'),
    onUpdateDownloaded: makeListener('downloaded'),
    onUpdateError: makeListener('error'),
    handlers
  }
}

describe('update store', () => {
  let api: MockApi

  beforeEach(() => {
    setActivePinia(createPinia())
    api = createMockApi()
    vi.stubGlobal('window', { electronAPI: api })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reacts to available event by opening the dialog', () => {
    const store = useUpdateStore()
    store.init()

    api.handlers.available({ version: '2.0.0', releaseNotes: '# 更新日志' })

    expect(store.status).toBe('available')
    expect(store.dialogOpen).toBe(true)
    expect(store.info?.version).toBe('2.0.0')
    expect(store.info?.releaseNotes).toBe('# 更新日志')
  })

  it('updates progress and status on progress event', () => {
    const store = useUpdateStore()
    store.init()

    api.handlers.progress({ percent: 42.5, bytesPerSecond: 1024, transferred: 1024, total: 2048 })

    expect(store.status).toBe('downloading')
    expect(store.progress?.percent).toBe(42.5)
    expect(store.progress?.total).toBe(2048)
  })

  it('opens the dialog on downloaded event', () => {
    const store = useUpdateStore()
    store.init()

    api.handlers.downloaded({ version: '2.0.0' })

    expect(store.status).toBe('downloaded')
    expect(store.dialogOpen).toBe(true)
    expect(store.progress).toBeNull()
  })

  it('sets error status and message on error event', () => {
    const store = useUpdateStore()
    store.init()

    api.handlers.error({ message: 'network down' })

    expect(store.status).toBe('error')
    expect(store.errorMessage).toBe('network down')
  })

  it('returns not-available status after a successful check with no update', async () => {
    const store = useUpdateStore()
    store.init()
    api.checkForUpdates.mockResolvedValue({ success: true })

    const promise = store.check()
    expect(store.status).toBe('checking')
    api.handlers['not-available']({})

    await expect(promise).resolves.toBe('not-available')
  })

  it('returns error status when checkForUpdates fails', async () => {
    const store = useUpdateStore()
    store.init()
    api.checkForUpdates.mockResolvedValue({ success: false, error: '当前环境不支持自动更新' })

    const result = await store.check()

    expect(result).toBe('error')
    expect(store.errorMessage).toBe('当前环境不支持自动更新')
  })

  it('dismiss resets available state back to idle', () => {
    const store = useUpdateStore()
    store.init()
    api.handlers.available({ version: '2.0.0' })
    expect(store.dialogOpen).toBe(true)

    store.dismiss()

    expect(store.dialogOpen).toBe(false)
    expect(store.status).toBe('idle')
  })

  it('confirmDownload sets downloading and invokes downloadUpdate', async () => {
    const store = useUpdateStore()
    store.init()
    api.downloadUpdate.mockResolvedValue({ success: true })

    const promise = store.confirmDownload()

    expect(store.status).toBe('downloading')
    await promise
    expect(api.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('dispose unregisters all event listeners', () => {
    const store = useUpdateStore()
    store.init()
    store.dispose()

    expect(Object.keys(api.handlers)).toHaveLength(0)
  })
})
