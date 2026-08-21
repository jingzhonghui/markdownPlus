import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

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

import { registerFileHandlers } from '../file-handlers'
import { IPC_CHANNELS } from '../channels'

describe('folder:read', () => {
  beforeEach(() => {
    electronMocks.handlers.clear()
    registerFileHandlers()
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
})
