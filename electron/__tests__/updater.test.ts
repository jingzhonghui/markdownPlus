import { describe, expect, it, vi } from 'vitest'

const appState = vi.hoisted(() => ({ isPackaged: true }))

vi.mock('electron', () => ({
  app: {
    get isPackaged(): boolean {
      return appState.isPackaged
    }
  },
  BrowserWindow: class {}
}))

vi.mock('electron-updater', () => ({
  autoUpdater: { logger: null }
}))

import { checkForUpdates, initUpdater, shouldEnableUpdater } from '../updater'

describe('shouldEnableUpdater', () => {
  it('does not enable real updater in dev mode', () => {
    expect(shouldEnableUpdater(false)).toBe(false)
  })

  it('is enabled on all platforms when packaged', () => {
    expect(shouldEnableUpdater(true)).toBe(true)
  })
})

describe('development update preview', () => {
  it('emits a simulated available update without using electron-updater', async () => {
    const send = vi.fn()
    appState.isPackaged = false
    initUpdater(() => ({ isDestroyed: () => false, webContents: { send } }) as never)

    await expect(checkForUpdates()).resolves.toEqual({ success: true })

    expect(send).toHaveBeenCalledWith('update:available', expect.objectContaining({
      version: '1.0.1-debug'
    }))
    appState.isPackaged = true
  })
})
