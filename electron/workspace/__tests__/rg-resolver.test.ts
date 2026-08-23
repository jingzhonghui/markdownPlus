import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { resolveRgPath, platformRgDirName, rgBinaryName } from '../rg-resolver'
import { authorizeWorkspaceRoot, getAuthorizedWorkspaceRoot, isPathWithinRoot } from '../workspace-authorization'

const NO_FIND = (): string | null => null

describe('rg-resolver', () => {
  it('resolves the packaged binary from resourcesPath in packaged mode', () => {
    const result = resolveRgPath({
      isPackaged: true,
      appPath: '/app',
      resourcesPath: '/app/resources',
      platform: 'win32',
      arch: 'x64',
      existsSync: (p) => p === path.join('/app/resources', 'rg', 'win32-x64', 'rg.exe'),
      env: {},
      findOnPath: NO_FIND
    })
    expect(result).toBe(path.join('/app/resources', 'rg', 'win32-x64', 'rg.exe'))
  })

  it('resolves the dev binary from appPath/resources for win32', () => {
    const result = resolveRgPath({
      isPackaged: false,
      appPath: 'D:/repo',
      resourcesPath: '/unused',
      platform: 'win32',
      arch: 'x64',
      existsSync: (p) => p === path.join('D:/repo', 'resources', 'rg', 'win32-x64', 'rg.exe'),
      env: {},
      findOnPath: NO_FIND
    })
    expect(result).toBe(path.join('D:/repo', 'resources', 'rg', 'win32-x64', 'rg.exe'))
  })

  it('returns null when the binary is missing and no system fallback', () => {
    const result = resolveRgPath({
      isPackaged: true,
      appPath: '/app',
      resourcesPath: '/app/resources',
      platform: 'win32',
      arch: 'x64',
      existsSync: () => false,
      env: {},
      findOnPath: NO_FIND
    })
    expect(result).toBeNull()
  })

  it('does not fall back to system PATH in packaged mode', () => {
    const result = resolveRgPath({
      isPackaged: true,
      appPath: '/app',
      resourcesPath: '/app/resources',
      platform: 'win32',
      arch: 'x64',
      existsSync: () => false,
      env: {},
      findOnPath: () => 'C:/system/rg.exe'
    })
    expect(result).toBeNull()
  })

  it('falls back to the system PATH rg in dev mode when the bundled binary is missing', () => {
    const result = resolveRgPath({
      isPackaged: false,
      appPath: '/app',
      resourcesPath: '/unused',
      platform: 'darwin',
      arch: 'arm64',
      existsSync: (p) => p === '/usr/local/bin/rg',
      env: {},
      findOnPath: () => '/usr/local/bin/rg'
    })
    expect(result).toBe('/usr/local/bin/rg')
  })

  it('prefers the env override when it points to an existing file', () => {
    const result = resolveRgPath({
      isPackaged: true,
      appPath: '/app',
      resourcesPath: '/app/resources',
      platform: 'win32',
      arch: 'x64',
      existsSync: (p) => p === 'C:/custom/rg.exe',
      env: { MARKDOWN_PLUS_RG_PATH: 'C:/custom/rg.exe' },
      findOnPath: NO_FIND
    })
    expect(result).toBe('C:/custom/rg.exe')
  })

  it('maps platform/arch to a resource directory name', () => {
    expect(platformRgDirName('win32', 'x64')).toBe('win32-x64')
    expect(platformRgDirName('darwin', 'arm64')).toBe('darwin-arm64')
    expect(platformRgDirName('darwin', 'x64')).toBe('darwin-x64')
    expect(platformRgDirName('linux', 'x64')).toBe('linux-x64')
    expect(platformRgDirName('freebsd', 'x64')).toBeNull()
  })

  it('chooses the binary name by platform', () => {
    expect(rgBinaryName('win32')).toBe('rg.exe')
    expect(rgBinaryName('darwin')).toBe('rg')
  })
})

describe('workspace-authorization', () => {
  it('authorizes and retrieves a real directory root per sender', () => {
    const real = process.cwd()
    authorizeWorkspaceRoot(1, real, { realpathSync: (p) => p })
    expect(getAuthorizedWorkspaceRoot(1)).toBe(real)
  })

  it('revokes when authorized with null', () => {
    authorizeWorkspaceRoot(2, process.cwd(), { realpathSync: (p) => p })
    authorizeWorkspaceRoot(2, null, { realpathSync: (p) => p })
    expect(getAuthorizedWorkspaceRoot(2)).toBeNull()
  })

  it('refuses to authorize a non-directory', () => {
    authorizeWorkspaceRoot(3, path.join(process.cwd(), 'package.json'), { realpathSync: (p) => p })
    expect(getAuthorizedWorkspaceRoot(3)).toBeNull()
  })

  it('isPathWithinRoot accepts the root and descendants, rejects siblings', () => {
    const root = path.resolve('/ws')
    expect(isPathWithinRoot(root, path.join(root, 'a', 'b.md'))).toBe(true)
    expect(isPathWithinRoot(root, root)).toBe(true)
    expect(isPathWithinRoot(root, path.join(root, '..', 'other'))).toBe(false)
  })
})
