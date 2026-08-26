import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUpdateStore } from '../update'

type Listener = (payload?: unknown) => void

interface MockApi {
  checkForUpdates: ReturnType<typeof vi.fn>
  openReleasesPage: ReturnType<typeof vi.fn>
  onUpdateAvailable: (cb: Listener) => () => void
  onUpdateNotAvailable: (cb: Listener) => () => void
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
    openReleasesPage: vi.fn(),
    onUpdateAvailable: makeListener('available'),
    onUpdateNotAvailable: makeListener('not-available'),
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

  it('openReleases opens the releases page and closes the dialog on success', async () => {
    const store = useUpdateStore()
    store.init()
    api.handlers.available({ version: '2.0.0' })
    api.openReleasesPage.mockResolvedValue({ success: true })

    await store.openReleases()

    expect(api.openReleasesPage).toHaveBeenCalledTimes(1)
    expect(store.dialogOpen).toBe(false)
    expect(store.status).toBe('idle')
  })

  it('openReleases keeps the dialog open and shows an error on failure', async () => {
    const store = useUpdateStore()
    store.init()
    api.handlers.available({ version: '2.0.0' })
    api.openReleasesPage.mockResolvedValue({ success: false, error: '打开发布页失败' })

    await store.openReleases()

    expect(store.status).toBe('error')
    expect(store.errorMessage).toBe('打开发布页失败')
    expect(store.dialogOpen).toBe(true)
  })

  it('dispose unregisters all event listeners', () => {
    const store = useUpdateStore()
    store.init()
    store.dispose()

    expect(Object.keys(api.handlers)).toHaveLength(0)
  })
})
