import * as path from 'path'
import { describe, expect, it, vi } from 'vitest'

import { openUserGuide, resolveUserGuidePath, type UserGuideDependencies } from '../user-guide'

function dependencies(overrides: Partial<UserGuideDependencies> = {}): UserGuideDependencies {
  return {
    isPackaged: false,
    appPath: path.join('workspace', 'markdown-plus'),
    resourcesPath: path.join('installed', 'resources'),
    existsSync: vi.fn(() => true),
    openPath: vi.fn(async () => ''),
    ...overrides
  }
}

describe('user guide', () => {
  it('resolves the development PDF from the application resources directory', () => {
    expect(resolveUserGuidePath(dependencies())).toBe(
      path.join('workspace', 'markdown-plus', 'resources', 'Markdown+ 使用教程.pdf')
    )
  })

  it('resolves the packaged PDF from the extra resources directory', () => {
    expect(resolveUserGuidePath(dependencies({ isPackaged: true }))).toBe(
      path.join('installed', 'resources', 'user-guide', 'Markdown+ 使用教程.pdf')
    )
  })

  it('opens an existing guide with the system PDF reader', async () => {
    const deps = dependencies()
    const guidePath = resolveUserGuidePath(deps)

    await expect(openUserGuide(deps)).resolves.toEqual({ success: true })
    expect(deps.existsSync).toHaveBeenCalledWith(guidePath)
    expect(deps.openPath).toHaveBeenCalledWith(guidePath)
  })

  it('reports the exact reinstall message when the guide is missing', async () => {
    const deps = dependencies({ existsSync: vi.fn(() => false) })
    const guidePath = resolveUserGuidePath(deps)

    await expect(openUserGuide(deps)).resolves.toEqual({
      success: false,
      error: '内置使用教程不存在，请重新安装 Markdown+。'
    })
    expect(deps.existsSync).toHaveBeenCalledWith(guidePath)
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('reports shell errors returned while opening the guide', async () => {
    const deps = dependencies({ openPath: vi.fn(async () => 'No PDF application is associated') })

    const result = await openUserGuide(deps)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('无法打开使用教程')
      expect(result.error).toContain('No PDF application is associated')
    }
  })

  it('reports rejected shell attempts while opening the guide', async () => {
    const deps = dependencies({
      openPath: vi.fn(() => Promise.reject(new Error('PDF reader failed to launch')))
    })

    const result = await openUserGuide(deps)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('无法打开使用教程')
      expect(result.error).toContain('PDF reader failed to launch')
    }
  })

  it('reports synchronous shell failures while opening the guide', async () => {
    const deps = dependencies({
      openPath: vi.fn(() => {
        throw new Error('Synchronous shell failure')
      })
    })

    const result = await openUserGuide(deps)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('无法打开使用教程')
      expect(result.error).toContain('Synchronous shell failure')
    }
  })
})
