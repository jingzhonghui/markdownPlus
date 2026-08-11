import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMdxDocument } from '../../types/mdx'
import { useFileStore } from '../file'

function installElectronApi(overrides: Record<string, unknown> = {}) {
  const api = {
    getRecentFiles: vi.fn().mockResolvedValue({ success: true, data: [] }),
    openFile: vi.fn().mockResolvedValue({
      success: true,
      data: {
        document: createMdxDocument('Test', 'initial'),
        filePath: 'C:\\test.mdx',
        format: 'mdx'
      }
    }),
    saveFile: vi.fn().mockResolvedValue({ success: true }),
    writeRecovery: vi.fn().mockResolvedValue({ success: true }),
    clearRecovery: vi.fn().mockResolvedValue({ success: true }),
    ...overrides
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electronAPI: api }
  })
  return api
}

describe('file store auto-save', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  it('writes a recovery snapshot shortly after editing', async () => {
    const api = installElectronApi()
    const store = useFileStore()
    await store.openFile('C:\\test.mdx')

    store.updateContent('changed')
    await vi.advanceTimersByTimeAsync(1000)

    expect(api.writeRecovery).toHaveBeenCalledWith(expect.objectContaining({
      tabs: [expect.objectContaining({ content: 'changed' })]
    }))
  })

  it('keeps a newer edit dirty when an older auto-save finishes', async () => {
    let finishSave: ((value: { success: boolean }) => void) | undefined
    const saveFile = vi.fn().mockReturnValue(new Promise((resolve) => {
      finishSave = resolve
    }))
    installElectronApi({ saveFile })
    const store = useFileStore()
    await store.openFile('C:\\test.mdx')
    store.updateContent('first edit')

    const saving = store.autoSave()
    await Promise.resolve()
    store.updateContent('newer edit')
    finishSave?.({ success: true })
    await saving

    expect(store.fileContent).toBe('newer edit')
    expect(store.isModified).toBe(true)
  })
})
