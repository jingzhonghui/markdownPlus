import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clipboardMock = vi.hoisted(() => ({
  read: vi.fn(() => ''),
  readBuffer: vi.fn(() => Buffer.from('')),
  writeBuffer: vi.fn()
}))

const clipboardExMock = vi.hoisted(() => ({
  readFilePaths: vi.fn(() => [] as string[]),
  writeFilePaths: vi.fn(() => [] as string[])
}))

vi.mock('electron', () => ({ clipboard: clipboardMock }))
vi.mock('electron-clipboard-ex', () => clipboardExMock)

const originalPlatform = process.platform
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

async function loadModule(): Promise<typeof import('../file-clipboard')> {
  vi.resetModules()
  return import('../file-clipboard')
}

describe('uri list helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('serializes absolute paths to file URIs joined by CRLF', async () => {
    const mod = await loadModule()
    expect(mod.pathsToUriList(['/a/b.md', '/c d/e.md'])).toBe('file:///a/b.md\r\nfile:///c%20d/e.md')
  })

  it('encodes reserved filename characters', async () => {
    const mod = await loadModule()
    expect(mod.pathsToUriList(['/a/a#b?c.md'])).toBe('file:///a/a%23b%3Fc.md')
  })

  it('parses file URIs, skipping comments and blank lines', async () => {
    const mod = await loadModule()
    const text = '# comment\r\nfile:///a/b.md\r\n\r\nfile:///c%20d/e.md\r\n'
    expect(mod.uriListToPaths(text)).toEqual(['/a/b.md', '/c d/e.md'])
  })

  it('decodes reserved filename characters and tolerates malformed escapes', async () => {
    const mod = await loadModule()
    expect(mod.uriListToPaths('file:///a/a%23b%3Fc.md')).toEqual(['/a/a#b?c.md'])
    expect(mod.uriListToPaths('file:///a/100%.md')).toEqual(['/a/100%.md'])
  })

  it('ignores non-file URIs such as https links', async () => {
    const mod = await loadModule()
    expect(mod.uriListToPaths('https://example.com/x')).toEqual([])
  })

  it('writes text/uri-list on linux and cut marker for cut mode', async () => {
    setPlatform('linux')
    const mod = await loadModule()
    await mod.writeClipboardFilePaths(['/a/b.md'], 'cut')
    expect(clipboardMock.writeBuffer).toHaveBeenCalledWith('text/uri-list', Buffer.from('file:///a/b.md', 'utf8'))
    expect(clipboardMock.writeBuffer).toHaveBeenCalledWith(
      'x-special/gnome-copied-files',
      Buffer.from('cut\nfile:///a/b.md', 'utf8')
    )
  })

  it('reads text/uri-list on linux', async () => {
    setPlatform('linux')
    clipboardMock.read.mockReturnValue('file:///a/b.md\r\nfile:///c/d.md')
    const mod = await loadModule()
    await expect(mod.readClipboardFilePaths()).resolves.toEqual(['/a/b.md', '/c/d.md'])
  })

  it('uses electron-clipboard-ex on win32', async () => {
    setPlatform('win32')
    clipboardExMock.readFilePaths.mockReturnValue(['C:\\a.md'])
    clipboardExMock.writeFilePaths.mockReturnValue(['C:\\a.md'])
    const mod = await loadModule()
    await expect(mod.readClipboardFilePaths()).resolves.toEqual(['C:\\a.md'])
    await mod.writeClipboardFilePaths(['C:\\a.md'], 'copy')
    expect(clipboardExMock.writeFilePaths).toHaveBeenCalledWith(['C:\\a.md'])
  })
})
