import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class {}
}))

vi.mock('electron-updater', () => ({
  autoUpdater: { logger: null }
}))

import { shouldEnableUpdater } from '../updater'

describe('shouldEnableUpdater', () => {
  it('is disabled in dev mode regardless of platform', () => {
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
