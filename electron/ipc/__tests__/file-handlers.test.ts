import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { IPC_CHANNELS } from '../channels'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-folder-'))

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
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
  BrowserWindow: class {},
  app: { getPath: () => tmpDir },
  shell: { showItemInFolder: vi.fn(), openPath: vi.fn() }
}))

/** 重新加载 file-handlers 模块以重置模块级缓存，并注册 handlers */
async function registerHandlersFresh(): Promise<void> {
  electronMocks.handlers.clear()
  vi.resetModules()
  const mod = await import('../file-handlers')
  mod.registerFileHandlers()
}

describe('folder:read', () => {
  beforeEach(async () => {
    await registerHandlersFresh()
  })

  it('filters dot-prefixed directories like .markdownPlus', async () => {
    const dir = path.join(tmpDir, 'ws')
    fs.mkdirSync(path.join(dir, '.markdownPlus'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'readme.md'), '# hi', 'utf8')

    const handler = electronMocks.handlers.get(IPC_CHANNELS.FOLDER.READ)!
    const result = (await handler({}, dir)) as { success: boolean; data: Array<{ name: string; isDirectory: boolean }> }

    expect(result.success).toBe(true)
    const names = result.data.map((item) => item.name)
    expect(names).toContain('docs')
    expect(names).toContain('readme.md')
    expect(names).not.toContain('.markdownPlus')
  })

  it('lists all regular files regardless of extension', async () => {
    const dir = path.join(tmpDir, 'ws-all')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'a.md'), 'x', 'utf8')
    fs.writeFileSync(path.join(dir, 'b.mdx'), 'x', 'utf8')
    fs.writeFileSync(path.join(dir, 'c.txt'), 'x', 'utf8')
    fs.writeFileSync(path.join(dir, 'd.json'), '{}', 'utf8')
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'x', 'utf8')

    const handler = electronMocks.handlers.get(IPC_CHANNELS.FOLDER.READ)!
    const result = (await handler({}, dir)) as { success: boolean; data: Array<{ name: string; isDirectory: boolean }> }

    expect(result.success).toBe(true)
    const names = result.data.map((item) => item.name)
    expect(names).toHaveLength(5)
    for (const expected of ['LICENSE', 'a.md', 'b.mdx', 'c.txt', 'd.json']) {
      expect(names).toContain(expected)
    }
  })
})

describe('file:rename', () => {
  beforeEach(async () => {
    await registerHandlersFresh()
  })

  it('renames a folder on disk and keeps its contents', async () => {
    const dir = path.join(tmpDir, 'rename-folder')
    fs.mkdirSync(path.join(dir, 'A'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'A', 'x.mdx'), 'x', 'utf8')

    const handler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RENAME)!
    const result = (await handler({}, { oldPath: path.join(dir, 'A'), newName: 'B' })) as { success: boolean }

    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(dir, 'B'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'A'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'B', 'x.mdx'))).toBe(true)
  })

  it('rejects renaming to an existing path', async () => {
    const dir = path.join(tmpDir, 'rename-folder-conflict')
    fs.mkdirSync(path.join(dir, 'A'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'B'), { recursive: true })

    const handler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RENAME)!
    const result = (await handler({}, { oldPath: path.join(dir, 'A'), newName: 'B' })) as {
      success: boolean
      error?: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toBe('目标已存在')
  })

  it('allows renaming a folder to a different-cased name (Windows case-insensitive)', async () => {
    const dir = path.join(tmpDir, 'rename-folder-case')
    fs.mkdirSync(path.join(dir, 'Docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'Docs', 'x.mdx'), 'x', 'utf8')

    const handler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RENAME)!
    const result = (await handler({}, { oldPath: path.join(dir, 'Docs'), newName: 'docs' })) as {
      success: boolean
      error?: string
    }

    // Windows NTFS 不区分大小写：仅大小写变化时 fs.existsSync 会误判“目标已存在”
    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(dir, 'docs', 'x.mdx'))).toBe(true)
  })
})

describe('recent files', () => {
  const recentStorePath = path.join(tmpDir, 'recent-files.json')

  beforeEach(async () => {
    if (fs.existsSync(recentStorePath)) {
      fs.unlinkSync(recentStorePath)
    }
    await registerHandlersFresh()
  })

  afterEach(() => {
    if (fs.existsSync(recentStorePath)) {
      fs.unlinkSync(recentStorePath)
    }
  })

  it('adds a file to the recent list with type file', async () => {
    const file = path.join(tmpDir, 'note.md')
    fs.writeFileSync(file, 'hello', 'utf8')

    const addHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT_ADD)!
    const addResult = (await addHandler({}, file)) as { success: boolean }
    expect(addResult.success).toBe(true)

    const getHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT)!
    const getResult = (await getHandler({})) as { success: boolean; data: Array<{ path: string; type: string }> }
    expect(getResult.success).toBe(true)
    expect(getResult.data).toHaveLength(1)
    expect(getResult.data[0]).toEqual({ path: path.resolve(file), type: 'file' })
  })

  it('adds a folder to the recent list with type folder', async () => {
    const folder = path.join(tmpDir, 'docs')
    fs.mkdirSync(folder, { recursive: true })

    const addHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT_ADD)!
    const addResult = (await addHandler({}, folder, 'folder')) as { success: boolean }
    expect(addResult.success).toBe(true)

    const getHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT)!
    const getResult = (await getHandler({})) as { success: boolean; data: Array<{ path: string; type: string }> }
    expect(getResult.data[0]).toEqual({ path: path.resolve(folder), type: 'folder' })
  })

  it('migrates legacy string[] data on disk to file-type items', async () => {
    const legacyPath = path.join(tmpDir, 'legacy.md')
    fs.writeFileSync(legacyPath, 'x', 'utf8')
    fs.writeFileSync(recentStorePath, JSON.stringify([legacyPath]), 'utf8')

    const getHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT)!
    const getResult = (await getHandler({})) as { success: boolean; data: Array<{ path: string; type: string }> }
    expect(getResult.data[0]).toEqual({ path: legacyPath, type: 'file' })
  })

  it('filters out recent items whose file no longer exists', async () => {
    fs.writeFileSync(recentStorePath, JSON.stringify([
      { path: path.join(tmpDir, 'gone.md'), type: 'file' },
      { path: path.join(tmpDir, 'present.md'), type: 'file' }
    ]), 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'present.md'), 'x', 'utf8')

    const getHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT)!
    const getResult = (await getHandler({})) as { success: boolean; data: Array<{ path: string }> }
    expect(getResult.data).toHaveLength(1)
    expect(getResult.data[0].path).toBe(path.join(tmpDir, 'present.md'))
  })

  it('deduplicates the same path and moves it to the front', async () => {
    const a = path.join(tmpDir, 'a.md')
    const b = path.join(tmpDir, 'b.md')
    fs.writeFileSync(a, 'a', 'utf8')
    fs.writeFileSync(b, 'b', 'utf8')

    const addHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT_ADD)!
    await addHandler({}, a)
    await addHandler({}, b)
    await addHandler({}, a)

    const getHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT)!
    const getResult = (await getHandler({})) as { success: boolean; data: Array<{ path: string }> }
    expect(getResult.data).toHaveLength(2)
    expect(getResult.data[0].path).toBe(path.resolve(a))
    expect(getResult.data[1].path).toBe(path.resolve(b))
  })

  it('clears the recent list', async () => {
    const file = path.join(tmpDir, 'note.md')
    fs.writeFileSync(file, 'hello', 'utf8')

    const addHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT_ADD)!
    await addHandler({}, file)
    const clearHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT_CLEAR)!
    const clearResult = (await clearHandler({})) as { success: boolean }
    expect(clearResult.success).toBe(true)

    const getHandler = electronMocks.handlers.get(IPC_CHANNELS.FILE.RECENT)!
    const getResult = (await getHandler({})) as { success: boolean; data: Array<{ path: string }> }
    expect(getResult.data).toHaveLength(0)
  })
})
