import { chmodSync, mkdtempSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ensureChromeSandboxPermissions from '../../build/after-pack.cjs'

function createAppOutDir() {
  const appOutDir = mkdtempSync(join(tmpdir(), 'markdown-plus-after-pack-'))
  mkdirSync(appOutDir, { recursive: true })
  return appOutDir
}

describe('ensureChromeSandboxPermissions', () => {
  it.skipIf(process.platform === 'win32')('sets chrome-sandbox to root-compatible 4755 permissions on Linux', () => {
    const appOutDir = createAppOutDir()
    const sandboxPath = join(appOutDir, 'chrome-sandbox')
    writeFileSync(sandboxPath, 'sandbox')
    chmodSync(sandboxPath, 0o755)

    ensureChromeSandboxPermissions({ electronPlatformName: 'linux', appOutDir })

    expect(statSync(sandboxPath).mode & 0o7777).toBe(0o4755)
  })

  it('does not change the helper on non-Linux platforms', () => {
    const appOutDir = createAppOutDir()
    const sandboxPath = join(appOutDir, 'chrome-sandbox')
    writeFileSync(sandboxPath, 'sandbox')
    chmodSync(sandboxPath, 0o755)
    const initialMode = statSync(sandboxPath).mode & 0o7777

    ensureChromeSandboxPermissions({ electronPlatformName: 'win32', appOutDir })

    expect(statSync(sandboxPath).mode & 0o7777).toBe(initialMode)
  })

  it('fails when the Linux helper is missing', () => {
    const appOutDir = createAppOutDir()

    expect(() => ensureChromeSandboxPermissions({ electronPlatformName: 'linux', appOutDir })).toThrow(
      'Missing Chromium sandbox helper'
    )
  })
})
