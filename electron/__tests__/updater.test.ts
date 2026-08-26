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
  it('does not enable real updater in dev mode regardless of platform', () => {
    expect(shouldEnableUpdater(false, 'win32')).toBe(false)
    expect(shouldEnableUpdater(false, 'linux', '/tmp/app.AppImage')).toBe(false)
    expect(shouldEnableUpdater(false, 'darwin')).toBe(false)
  })

  it('is enabled on Windows when packaged', () => {
    expect(shouldEnableUpdater(true, 'win32')).toBe(true)
  })

  it('is enabled on macOS when packaged', () => {
    expect(shouldEnableUpdater(true, 'darwin')).toBe(true)
  })

  it('is enabled on Linux only when running as AppImage', () => {
    expect(shouldEnableUpdater(true, 'linux')).toBe(false)
    expect(shouldEnableUpdater(true, 'linux', undefined)).toBe(false)
    expect(shouldEnableUpdater(true, 'linux', '')).toBe(false)
    expect(shouldEnableUpdater(true, 'linux', '/usr/bin/markdown-plus.AppImage')).toBe(true)
  })

  it('is disabled on unsupported platforms', () => {
    expect(shouldEnableUpdater(true, 'freebsd')).toBe(false)
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
