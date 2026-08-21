import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiStore } from '../ai'
import { useFileStore } from '../file'
import { createExecutionSnapshot } from '../../utils/ai/workspace-context'
import * as workspaceContext from '../../utils/ai/workspace-context'
import { requestDialog } from '../../utils/dialog'
import type { AiRunEvent, ToolApprovalRequest } from '../../../shared/ai/types'
import { aiRunInputSchema } from '../../../shared/ai/contracts'

vi.mock('../../utils/dialog', () => ({
  requestDialog: vi.fn()
}))

function makeApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    id: 'approval-1',
    runId: 'r1',
    toolCallId: 'tc1',
    toolName: 'edit_document',
    title: '编辑文档',
    description: 'desc',
    effect: 'write',
    riskLevel: 'medium',
    preview: { type: 'markdown-diff', title: 'diff', before: '', after: '' },
    execution: { location: 'main' },
    createdAt: Date.now(),
    expiresAt: Date.now() + 10_000,
    ...overrides
  }
}

describe('ai store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let electronApi: Record<string, any>
  let eventHandler: ((event: AiRunEvent) => void) | null
  let summaryHandler: (() => void) | null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })

    eventHandler = null
    summaryHandler = null
    electronApi = {
      getAiConfig: vi.fn(),
      setAiConfig: vi.fn(),
      testAiConfig: vi.fn(),
      startAiRun: vi.fn(),
      cancelAiRun: vi.fn(),
      claimAiApproval: vi.fn(),
      resolveAiApproval: vi.fn(),
      listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
      loadAiConversation: vi.fn(),
      saveAiConversation: vi.fn(async () => ({ success: true })),
      deleteAiConversation: vi.fn(async () => ({ success: true })),
      summarizeAiConversation: vi.fn(async () => ({ success: true, data: { title: '标题' } })),
      onAiRunEvent: vi.fn((cb: (event: AiRunEvent) => void) => {
        eventHandler = cb
        return () => {
          eventHandler = null
        }
      }),
      onWorkspaceSummaryGenerating: vi.fn((cb: () => void) => {
        summaryHandler = cb
        return () => {
          summaryHandler = null
        }
      })
    }
    electronApi.claimAiApproval.mockResolvedValue({ success: true })
    vi.stubGlobal('window', { electronAPI: electronApi })
  })

  const emit = (event: AiRunEvent): void => {
    eventHandler!(event)
  }

  describe('tab lifecycle', () => {
    it('defaults to hidden, inactive, empty conversation state', () => {
      const store = useAiStore()

      expect(store.panelOpen).toBe(false)
      expect(store.panelActive).toBe(false)
      expect(store.messages).toEqual([])
      expect(store).not.toHaveProperty('materials')
      expect(store.activeRunId).toBeNull()
      expect(store.running).toBe(false)
      expect(store.pendingApprovals).toEqual([])
      expect(store.activeConversationId).toBeNull()
      expect(store.conversations).toEqual([])
    })

    it('openPanel sets both panelOpen and panelActive', () => {
      const store = useAiStore()

      store.openPanel()

      expect(store.panelOpen).toBe(true)
      expect(store.panelActive).toBe(true)
    })

    it('activatePanel and deactivatePanel toggle only panelActive', () => {
      const store = useAiStore()

      store.activatePanel()
      expect(store.panelActive).toBe(true)
      expect(store.panelOpen).toBe(false)

      store.deactivatePanel()
      expect(store.panelActive).toBe(false)
    })

    it('requestClosePanel hides the tab but retains messages when idle', async () => {
      const store = useAiStore()
      store.openPanel()
      store.messages.push({ id: 'm1', role: 'user', content: 'hi' })

      await store.requestClosePanel()

      expect(store.panelOpen).toBe(false)
      expect(store.panelActive).toBe(false)
      expect(store.messages).toHaveLength(1)
    })

    it('reopening the panel restores the retained session', async () => {
      const store = useAiStore()
      store.openPanel()
      store.messages.push({ id: 'm1', role: 'user', content: 'hi' })

      await store.requestClosePanel()
      expect(store.panelOpen).toBe(false)

      store.openPanel()
      expect(store.panelOpen).toBe(true)
      expect(store.panelActive).toBe(true)
      expect(store.messages).toHaveLength(1)
    })
  })

  describe('requestClosePanel while running', () => {
    it('leaves the tab and run untouched when the dialog is cancelled', async () => {
      const store = useAiStore()
      store.openPanel()
      store.activeRunId = 'r1'
      store.running = true
      vi.mocked(requestDialog).mockResolvedValue(1) // 取消

      await store.requestClosePanel()

      expect(store.panelOpen).toBe(true)
      expect(store.panelActive).toBe(true)
      expect(store.running).toBe(true)
      expect(store.activeRunId).toBe('r1')
      expect(electronApi.cancelAiRun).not.toHaveBeenCalled()
    })

    it('confirms, cancels the run, clears approvals, then closes the tab', async () => {
      const store = useAiStore()
      store.openPanel()
      store.activeRunId = 'r1'
      store.running = true
      store.pendingApprovals.push(makeApproval({ id: 'a1', runId: 'r1' }))
      vi.mocked(requestDialog).mockResolvedValue(0) // 确认关闭
      electronApi.cancelAiRun.mockResolvedValue({ success: true })

      await store.requestClosePanel()

      expect(electronApi.cancelAiRun).toHaveBeenCalledWith('r1')
      expect(store.pendingApprovals).toEqual([])
      expect(store.panelOpen).toBe(false)
      expect(store.panelActive).toBe(false)
      expect(store.running).toBe(false)
    })

    it('keeps the panel and run state when cancellation is rejected', async () => {
      const store = useAiStore()
      store.openPanel()
      store.activeRunId = 'r1'
      store.running = true
      store.pendingApprovals.push(makeApproval({ id: 'a1', runId: 'r1' }))
      vi.mocked(requestDialog).mockResolvedValue(0)
      electronApi.cancelAiRun.mockResolvedValue({ success: false, error: 'cancel failed' })

      await store.requestClosePanel()

      expect(store.panelOpen).toBe(true)
      expect(store.panelActive).toBe(true)
      expect(store.running).toBe(true)
      expect(store.activeRunId).toBe('r1')
      expect(store.pendingApprovals).toHaveLength(1)
      expect(store.error).toBe('cancel failed')
    })

    it('waits for a pending start and cancels its eventual run before closing', async () => {
      const store = useAiStore()
      store.openPanel()
      vi.mocked(requestDialog).mockResolvedValue(0)
      let resolveStart!: (value: { success: true; data: { runId: string } }) => void
      electronApi.startAiRun.mockImplementation(
        () => new Promise((resolve) => {
          resolveStart = resolve
        })
      )
      electronApi.cancelAiRun.mockResolvedValue({ success: true })

      const sendPromise = store.sendMessage('hello')
      const closePromise = store.requestClosePanel()
      await Promise.resolve()

      expect(store.panelOpen).toBe(true)
      resolveStart({ success: true, data: { runId: 'r1' } })
      await Promise.all([sendPromise, closePromise])

      expect(electronApi.cancelAiRun).toHaveBeenCalledWith('r1')
      expect(store.panelOpen).toBe(false)
      expect(store.activeRunId).toBeNull()
      expect(store.running).toBe(false)
    })

    it('waits for start ownership before closing after an early terminal event', async () => {
      const store = useAiStore()
      store.init()
      store.openPanel()
      vi.mocked(requestDialog).mockResolvedValue(0)
      let resolveStart!: (value: { success: true; data: { runId: string } }) => void
      electronApi.startAiRun.mockImplementation(
        () => new Promise((resolve) => {
          resolveStart = resolve
        })
      )
      electronApi.cancelAiRun.mockResolvedValue({ success: true })

      const send = store.sendMessage('hello')
      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'run-completed', runId: 'r1' })
      const close = store.requestClosePanel()
      await Promise.resolve()

      expect(store.panelOpen).toBe(true)
      resolveStart({ success: true, data: { runId: 'r1' } })
      await Promise.all([send, close])
      expect(store.panelOpen).toBe(false)
    })
  })

  describe('init / dispose', () => {
    it('subscribes once on init and unsubscribes on dispose', () => {
      const store = useAiStore()

      store.init()
      store.init()

      expect(electronApi.onAiRunEvent).toHaveBeenCalledTimes(1)
      expect(eventHandler).not.toBeNull()

      store.dispose()
      expect(eventHandler).toBeNull()
    })
  })

  describe('run event reduction', () => {
    it('reduces run-started/text-delta/tool-call/approval/run-completed events', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      expect(store.activeRunId).toBe('r1')
      expect(store.running).toBe(true)

      emit({ type: 'text-delta', runId: 'r1', text: 'Hello' })
      emit({ type: 'text-delta', runId: 'r1', text: ' world' })
      expect(store.messages).toHaveLength(1)
      expect(store.messages[0].role).toBe('assistant')
      expect(store.messages[0].content).toBe('Hello world')

      emit({ type: 'tool-call-started', runId: 'r1', toolCallId: 'tc1', toolName: 'search' })
      expect(store.toolCalls).toHaveLength(1)
      expect(store.toolCalls[0].toolName).toBe('search')
      expect(store.toolCalls[0].status).toBe('running')

      emit({ type: 'tool-call-completed', runId: 'r1', toolCallId: 'tc1', result: { status: 'completed' } })
      expect(store.toolCalls[0].status).toBe('completed')
      expect(store.toolCalls[0].result).toEqual({ status: 'completed' })

      emit({ type: 'approval-required', runId: 'r1', approval: makeApproval() })
      expect(store.pendingApprovals).toHaveLength(1)

      emit({ type: 'run-completed', runId: 'r1' })
      expect(store.running).toBe(false)
      expect(store.activeRunId).toBeNull()
      expect(store.pendingApprovals).toEqual([])
    })

    it('inserts a missing analysis end marker before text generated after the last tool call', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'text-delta', runId: 'r1', text: '<!-- analysis -->\n正在查找工作记录。' })
      emit({ type: 'tool-call-started', runId: 'r1', toolCallId: 'tc1', toolName: 'search' })
      emit({ type: 'tool-call-completed', runId: 'r1', toolCallId: 'tc1', result: { status: 'completed' } })
      emit({ type: 'text-delta', runId: 'r1', text: '\n今天的工作内容是完成文档修改。' })
      emit({ type: 'run-completed', runId: 'r1' })

      expect(store.messages[0].content).toBe(
        '<!-- analysis -->\n正在查找工作记录。\n<!-- end-analysis -->\n今天的工作内容是完成文档修改。'
      )
    })

    it('inserts both analysis markers when LLM outputs no markers at all', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'text-delta', runId: 'r1', text: '正在查找工作记录。' })
      emit({ type: 'tool-call-started', runId: 'r1', toolCallId: 'tc1', toolName: 'search' })
      emit({ type: 'tool-call-completed', runId: 'r1', toolCallId: 'tc1', result: { status: 'completed' } })
      emit({ type: 'text-delta', runId: 'r1', text: '\n今天的工作内容是完成文档修改。' })
      emit({ type: 'run-completed', runId: 'r1' })

      expect(store.messages[0].content).toBe(
        '<!-- analysis -->\n正在查找工作记录。\n<!-- end-analysis -->\n今天的工作内容是完成文档修改。'
      )
    })

    it('recognizes a variant opening tag and only inserts the missing end marker', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'text-delta', runId: 'r1', text: '<!-- analysis -- >\n正在查找工作记录。' })
      emit({ type: 'tool-call-started', runId: 'r1', toolCallId: 'tc1', toolName: 'search' })
      emit({ type: 'tool-call-completed', runId: 'r1', toolCallId: 'tc1', result: { status: 'completed' } })
      emit({ type: 'text-delta', runId: 'r1', text: '\n今天的工作内容是完成文档修改。' })
      emit({ type: 'run-completed', runId: 'r1' })

      expect(store.messages[0].content).toBe(
        '<!-- analysis -- >\n正在查找工作记录。\n<!-- end-analysis -->\n今天的工作内容是完成文档修改。'
      )
    })

    it('leaves a complete variant tag pair untouched', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'text-delta', runId: 'r1', text: '<!-- analysis -- >\n分析内容。\n<!-- end-analysis -- >\n正式回答。' })
      emit({ type: 'run-completed', runId: 'r1' })

      expect(store.messages[0].content).toBe(
        '<!-- analysis -- >\n分析内容。\n<!-- end-analysis -- >\n正式回答。'
      )
    })

    it('reduces run-failed to an error message and stops running', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'text-delta', runId: 'r1', text: 'partial' })
      emit({ type: 'run-failed', runId: 'r1', error: { code: 'PROVIDER_UNAVAILABLE', message: 'boom' } })

      expect(store.running).toBe(false)
      expect(store.activeRunId).toBeNull()
      const last = store.messages[store.messages.length - 1]
      expect(last.role).toBe('assistant')
      expect(last.content).toBe('boom')
      expect(store.pendingApprovals).toEqual([])
    })

    it('reduces run-cancelled and clears approvals for that run', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'approval-required', runId: 'r1', approval: makeApproval({ id: 'a1', runId: 'r1' }) })
      emit({ type: 'run-cancelled', runId: 'r1' })

      expect(store.running).toBe(false)
      expect(store.activeRunId).toBeNull()
      expect(store.pendingApprovals).toEqual([])
    })

    it('ignores events whose runId is not the active run', () => {
      const store = useAiStore()
      store.init()

      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'text-delta', runId: 'r2', text: 'stale' })
      expect(store.messages).toHaveLength(0)

      emit({ type: 'run-started', runId: 'r2' })
      expect(store.activeRunId).toBe('r2')
    })
  })

  describe('sendMessage', () => {
    it('appends user message, builds snapshot, and starts the run', async () => {
      const store = useAiStore()
      store.init()
      electronApi.startAiRun.mockImplementation(async (input: unknown) => {
        const parsed = aiRunInputSchema.safeParse(input)
        return parsed.success
          ? { success: true, data: { runId: 'r1' } }
          : { success: false, error: parsed.error.message }
      })

      await store.sendMessage('hello')

      expect(store.messages).toHaveLength(1)
      expect(store.messages[0].role).toBe('user')
      expect(store.messages[0].content).toBe('hello')

      expect(electronApi.startAiRun).toHaveBeenCalledTimes(1)
      const input = electronApi.startAiRun.mock.calls[0][0]
      expect(input.conversationId).toBe(store.activeConversationId)
      expect(input.message).toBe('hello')
      expect(input.history).toEqual([])
      expect(input.snapshot).not.toHaveProperty('materialIds')
      expect(input.snapshot.conversationId).toBe(store.activeConversationId)
      expect(input.snapshot).not.toHaveProperty('runId')

      expect(store.activeRunId).toBe('r1')
      expect(store.running).toBe(true)
    })

    it('ensures the workspace summary and passes it to the run when a folder is open', async () => {
      const store = useAiStore()
      store.init()
      const fileStore = useFileStore()
      fileStore.openedFolderPath = 'C:\\ws'
      electronApi.ensureWorkspaceSummary = vi.fn(async () => ({
        success: true,
        data: { summary: '云原生运维知识库', status: 'ok' }
      }))
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      await store.sendMessage('k8s 如何安装')

      expect(electronApi.ensureWorkspaceSummary).toHaveBeenCalledWith('C:\\ws')
      const input = electronApi.startAiRun.mock.calls[0][0]
      expect(input.workspaceSummary).toContain('云原生运维')
      expect(store.summaryStatus).toBe('idle')
    })

    it('uses the complete file index from the summary as the snapshot workspace files', async () => {
      const store = useAiStore()
      store.init()
      const fileStore = useFileStore()
      fileStore.openedFolderPath = 'C:\\ws'
      // 模拟懒加载的 fileTree：深层目录为空，即使有标签也不覆盖注入索引
      fileStore.fileTree = [
        {
          name: 'notemdx',
          path: 'C:\\ws',
          isDirectory: true,
          isExpanded: true,
          isLoading: false,
          children: [
            { name: '云', path: 'C:\\ws\\云', isDirectory: true, isExpanded: false, isLoading: false, children: [] }
          ]
        }
      ]
      electronApi.ensureWorkspaceSummary = vi.fn(async () => ({
        success: true,
        data: {
          summary: '云原生运维知识库',
          status: 'ok',
          files: [
            { name: 'newben-guide.mdx', path: 'C:/ws/云/newben-guide.mdx', isOpen: false, parentDirs: ['云'] },
            { name: 'k8s.md', path: 'C:/ws/docs/k8s.md', isOpen: false, parentDirs: ['docs'] }
          ]
        }
      }))
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      await store.sendMessage('newben 怎么安装')

      const input = electronApi.startAiRun.mock.calls[0][0]
      expect(input.snapshot.workspaceFiles).toEqual([
        { name: 'newben-guide.mdx', path: 'C:/ws/云/newben-guide.mdx', isOpen: false, parentDirs: ['云'] },
        { name: 'k8s.md', path: 'C:/ws/docs/k8s.md', isOpen: false, parentDirs: ['docs'] }
      ])
    })

    it('sets summaryStatus to generating when the main process pushes the generating event', async () => {
      const store = useAiStore()
      store.init()
      const fileStore = useFileStore()
      fileStore.openedFolderPath = 'C:\\ws'
      let resolveSummary!: (value: unknown) => void
      electronApi.ensureWorkspaceSummary = vi.fn(
        () => new Promise((resolve) => {
          resolveSummary = resolve
        })
      )
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      const sendPromise = store.sendMessage('newben 怎么安装')
      await Promise.resolve()

      expect(store.summaryStatus).toBe('idle')
      summaryHandler!()
      expect(store.summaryStatus).toBe('generating')

      resolveSummary({ success: true, data: { summary: '概要', status: 'ok', generated: true, files: null } })
      await sendPromise
      expect(store.summaryStatus).toBe('idle')
    })

    it('does not show generating when the summary cache is used', async () => {
      const store = useAiStore()
      store.init()
      const fileStore = useFileStore()
      fileStore.openedFolderPath = 'C:\\ws'
      electronApi.ensureWorkspaceSummary = vi.fn(async () => ({
        success: true,
        data: { summary: '缓存概要', status: 'ok', generated: false, files: null }
      }))
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      await store.sendMessage('hello')

      expect(store.summaryStatus).toBe('idle')
      // 缓存命中不应触发 generating 事件
      expect(electronApi.onWorkspaceSummaryGenerating).toHaveBeenCalled()
      expect(store.summaryStatus).not.toBe('generating')
    })

    it('does not fetch a summary when no workspace folder is open', async () => {
      const store = useAiStore()
      store.init()
      electronApi.ensureWorkspaceSummary = vi.fn(async () => ({
        success: true,
        data: { summary: '不应有', status: 'ok' }
      }))
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      await store.sendMessage('hello')

      expect(electronApi.ensureWorkspaceSummary).not.toHaveBeenCalled()
      const input = electronApi.startAiRun.mock.calls[0][0]
      expect(input.workspaceSummary).toBeUndefined()
      expect(store.summaryStatus).toBe('idle')
    })

    it('skips the summary on failure but still starts the run', async () => {
      const store = useAiStore()
      store.init()
      const fileStore = useFileStore()
      fileStore.openedFolderPath = 'C:\\ws'
      electronApi.ensureWorkspaceSummary = vi.fn(async () => ({
        success: false,
        error: 'LLM 不可用'
      }))
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      await store.sendMessage('k8s 如何安装')

      expect(electronApi.ensureWorkspaceSummary).toHaveBeenCalledWith('C:\\ws')
      const input = electronApi.startAiRun.mock.calls[0][0]
      expect(input.workspaceSummary).toBeUndefined()
      expect(store.summaryStatus).toBe('failed')
    })

    it('is a no-op for empty text or when already running', async () => {
      const store = useAiStore()
      store.init()

      await store.sendMessage('   ')
      expect(electronApi.startAiRun).not.toHaveBeenCalled()
      expect(store.messages).toHaveLength(0)

      store.running = true
      await store.sendMessage('hello')
      expect(electronApi.startAiRun).not.toHaveBeenCalled()
    })

    it('passes URL and path text to Main byte-for-byte without source metadata', async () => {
      const store = useAiStore()
      const message = '结合 `C:\\Docs\\Quarterly Report.pdf` 与 https://example.com/a?x=1 总结'
      electronApi.startAiRun.mockResolvedValue({ success: true, data: { runId: 'r1' } })

      await store.sendMessage(message)

      const input = electronApi.startAiRun.mock.calls[0][0]
      expect(input.message).toBe(message)
      expect(input.history).toEqual([])
      expect(input).not.toHaveProperty('attachments')
      expect(input.snapshot).not.toHaveProperty('materialIds')
      expect(JSON.stringify(input)).toContain(message.replaceAll('\\', '\\\\'))
    })

    it('surfaces an error message when starting the run fails', async () => {
      const store = useAiStore()
      store.init()
      electronApi.startAiRun.mockResolvedValue({ success: false, error: 'no config' })

      await store.sendMessage('hello')

      expect(store.running).toBe(false)
      expect(store.activeRunId).toBeNull()
      const last = store.messages[store.messages.length - 1]
      expect(last.role).toBe('assistant')
      expect(last.content).toBe('no config')
    })

    it('does not overwrite a synchronous terminal event with the start response', async () => {
      const store = useAiStore()
      store.init()
      electronApi.startAiRun.mockImplementation(async () => {
        emit({ type: 'run-started', runId: 'r1' })
        emit({ type: 'run-completed', runId: 'r1' })
        return { success: true, data: { runId: 'r1' } }
      })

      await store.sendMessage('hello')

      expect(store.running).toBe(false)
      expect(store.activeRunId).toBeNull()
    })

    it('blocks a second send while the first start request is pending', async () => {
      const store = useAiStore()
      store.init()
      let resolveStart!: (value: { success: true; data: { runId: string } }) => void
      electronApi.startAiRun.mockImplementation(
        () => new Promise((resolve) => {
          resolveStart = resolve
        })
      )

      const first = store.sendMessage('first')
      await store.sendMessage('second')

      expect(electronApi.startAiRun).toHaveBeenCalledTimes(1)
      expect(store.messages.filter((message) => message.role === 'user')).toHaveLength(1)

      resolveStart({ success: true, data: { runId: 'r1' } })
      await first
    })

    it('keeps ownership and blocks a second send after a terminal event while start IPC is pending', async () => {
      const store = useAiStore()
      store.init()
      let resolveStart!: (value: { success: true; data: { runId: string } }) => void
      electronApi.startAiRun.mockImplementation(
        () => new Promise((resolve) => {
          resolveStart = resolve
        })
      )

      const first = store.sendMessage('first')
      emit({ type: 'run-started', runId: 'r1' })
      emit({ type: 'run-completed', runId: 'r1' })
      const second = store.sendMessage('second')
      await Promise.resolve()

      expect(electronApi.startAiRun).toHaveBeenCalledTimes(1)
      expect(store.messages.filter((message) => message.role === 'user')).toHaveLength(1)

      resolveStart({ success: true, data: { runId: 'r1' } })
      await Promise.all([first, second])
    })

    it('does not retain a terminal run id after a failed start response', async () => {
      const store = useAiStore()
      store.init()
      electronApi.startAiRun
        .mockImplementationOnce(async () => {
          emit({ type: 'run-started', runId: 'r1' })
          emit({ type: 'run-completed', runId: 'r1' })
          return { success: false, error: 'failed' }
        })
        .mockResolvedValueOnce({ success: true, data: { runId: 'r1' } })

      await store.sendMessage('first')
      await store.sendMessage('second')

      expect(store.running).toBe(true)
      expect(store.activeRunId).toBe('r1')
    })
  })

  describe('cancelRun', () => {
    it('clears approvals for the cancelled run immediately after successful IPC', async () => {
      const store = useAiStore()
      store.activeRunId = 'r1'
      store.running = true
      store.pendingApprovals.push(makeApproval({ id: 'a1', runId: 'r1' }))
      electronApi.cancelAiRun.mockResolvedValue({ success: true })

      await store.cancelRun()

      expect(store.pendingApprovals).toEqual([])
      expect(store.activeRunId).toBeNull()
      expect(store.running).toBe(false)
    })

    it('waits for a pending start and cancels its eventual run id', async () => {
      const store = useAiStore()
      let resolveStart!: (value: { success: true; data: { runId: string } }) => void
      electronApi.startAiRun.mockImplementation(
        () => new Promise((resolve) => {
          resolveStart = resolve
        })
      )
      electronApi.cancelAiRun.mockResolvedValue({ success: true })

      const send = store.sendMessage('hello')
      const cancel = store.cancelRun()
      await Promise.resolve()
      expect(electronApi.cancelAiRun).not.toHaveBeenCalled()

      resolveStart({ success: true, data: { runId: 'r1' } })
      await Promise.all([send, cancel])

      expect(electronApi.cancelAiRun).toHaveBeenCalledWith('r1')
      expect(store.running).toBe(false)
    })
  })

  describe('resolveApproval', () => {
    it('approves a main approval without claiming or returning a renderer result', async () => {
      const store = useAiStore()
      const apply = vi.spyOn(workspaceContext, 'applyDocumentOperation')
      store.pendingApprovals.push(makeApproval({ id: 'a1', execution: { location: 'main' } }))
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(electronApi.resolveAiApproval).toHaveBeenCalledWith(
        'a1',
        { status: 'approved', scope: 'once' }
      )
      expect(electronApi.claimAiApproval).not.toHaveBeenCalled()
      expect(apply).not.toHaveBeenCalled()
      expect(store.pendingApprovals).toEqual([])
    })

    it.each(['main', 'renderer'] as const)(
      'rejects a %s approval without claiming or applying it',
      async (location) => {
        const store = useAiStore()
        const apply = vi.spyOn(workspaceContext, 'applyDocumentOperation')
        const execution = location === 'main'
          ? { location } as const
          : {
              location,
              operation: {
                type: 'create-document' as const,
                title: '标题',
                content: '正文',
                format: 'markdown' as const,
                reason: ''
              }
            }
        store.pendingApprovals.push(makeApproval({ id: 'a1', execution }))
        electronApi.resolveAiApproval.mockResolvedValue({ success: true })

        await store.resolveApproval('a1', { status: 'rejected' })

        expect(electronApi.resolveAiApproval).toHaveBeenCalledWith('a1', { status: 'rejected' })
        expect(electronApi.claimAiApproval).not.toHaveBeenCalled()
        expect(apply).not.toHaveBeenCalled()
      }
    )

    it('rejects an expired renderer approval before mutating the document', async () => {
      const fileStore = useFileStore()
      const tab = fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)
      const store = useAiStore()
      store.pendingApprovals.push(makeApproval({
        id: 'a1',
        expiresAt: Date.now() - 1,
        execution: {
          location: 'renderer',
          operation: { type: 'replace-document', target: snap.activeDocument!, content: 'new', reason: '' }
        }
      }))
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(tab.content).toBe('old')
      expect(electronApi.resolveAiApproval).toHaveBeenCalledWith('a1', { status: 'expired' })
      expect(store.pendingApprovals).toEqual([])
    })

    it('forwards a rejected decision and removes the approval', async () => {
      const store = useAiStore()
      store.init()
      store.pendingApprovals.push(makeApproval({ id: 'a1' }))
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })

      await store.resolveApproval('a1', { status: 'rejected', reason: 'no' })

      expect(electronApi.resolveAiApproval).toHaveBeenCalledWith('a1', { status: 'rejected', reason: 'no' })
      expect(store.pendingApprovals).toEqual([])
    })

    it('claims an approved renderer approval before applying the operation', async () => {
      const fileStore = useFileStore()
      const tab = fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)

      const store = useAiStore()
      store.init()
      store.pendingApprovals.push(
        makeApproval({
          id: 'a1',
          runId: 'r1',
          execution: {
            location: 'renderer',
            operation: {
              type: 'replace-document',
              target: snap.activeDocument!,
              content: 'new',
              reason: ''
            }
          }
        })
      )
      electronApi.claimAiApproval.mockResolvedValue({ success: true })
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(tab.content).toBe('new')
      expect(electronApi.claimAiApproval).toHaveBeenCalledWith('a1')
      expect(electronApi.claimAiApproval.mock.invocationCallOrder[0]).toBeLessThan(
        electronApi.resolveAiApproval.mock.invocationCallOrder[0]
      )
      expect(electronApi.resolveAiApproval).toHaveBeenCalledWith(
        'a1',
        { status: 'approved', scope: 'once' },
        { status: 'applied' }
      )
      expect(store.pendingApprovals).toEqual([])
    })

    it('does not mutate when the renderer approval claim is rejected', async () => {
      const fileStore = useFileStore()
      const tab = fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)
      const store = useAiStore()
      store.pendingApprovals.push(makeApproval({
        id: 'a1',
        execution: {
          location: 'renderer',
          operation: { type: 'replace-document', target: snap.activeDocument!, content: 'new', reason: '' }
        }
      }))
      electronApi.claimAiApproval.mockResolvedValue({ success: false, error: '审批不存在或已失效' })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(tab.content).toBe('old')
      expect(electronApi.resolveAiApproval).not.toHaveBeenCalled()
      expect(store.pendingApprovals).toHaveLength(1)
    })

    it('keeps an approval and resends the applied result when IPC resolution fails', async () => {
      const fileStore = useFileStore()
      const tab = fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)

      const store = useAiStore()
      store.pendingApprovals.push(
        makeApproval({
          id: 'a1',
          execution: {
            location: 'renderer',
            operation: {
              type: 'replace-document',
              target: snap.activeDocument!,
              content: 'new',
              reason: ''
            }
          }
        })
      )
      electronApi.resolveAiApproval
        .mockResolvedValueOnce({ success: false, error: 'resolve failed' })
        .mockResolvedValueOnce({ success: true })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(tab.content).toBe('new')
      expect(tab.revision).toBe(1)
      expect(store.pendingApprovals).toHaveLength(1)
      expect(store.error).toBe('resolve failed')

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(tab.revision).toBe(1)
      expect(electronApi.resolveAiApproval).toHaveBeenLastCalledWith(
        'a1',
        { status: 'approved', scope: 'once' },
        { status: 'applied' }
      )
      expect(store.pendingApprovals).toEqual([])
    })

    it('clears cached renderer results when a terminal event discards an approval', async () => {
      const fileStore = useFileStore()
      const tab = fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const firstSnap = createExecutionSnapshot(fileStore)

      const store = useAiStore()
      store.init()
      emit({ type: 'run-started', runId: 'r1' })
      store.pendingApprovals.push(
        makeApproval({
          id: 'a1',
          runId: 'r1',
          execution: {
            location: 'renderer',
            operation: {
              type: 'replace-document',
              target: firstSnap.activeDocument!,
              content: 'new',
              reason: ''
            }
          }
        })
      )
      electronApi.resolveAiApproval.mockResolvedValueOnce({ success: false, error: 'resolve failed' })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })
      emit({ type: 'run-failed', runId: 'r1', error: { code: 'PROVIDER_UNAVAILABLE', message: 'boom' } })

      const secondSnap = createExecutionSnapshot(fileStore)
      store.pendingApprovals.push(
        makeApproval({
          id: 'a1',
          runId: 'r2',
          execution: {
            location: 'renderer',
            operation: {
              type: 'replace-document',
              target: secondSnap.activeDocument!,
              content: 'newer',
              reason: ''
            }
          }
        })
      )
      electronApi.resolveAiApproval.mockResolvedValueOnce({ success: true })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(tab.content).toBe('newer')
      expect(tab.revision).toBe(2)
    })

    it('removes a resolved approval by id when the list changes during IPC', async () => {
      const store = useAiStore()
      store.pendingApprovals.push(makeApproval({ id: 'a1' }), makeApproval({ id: 'a2' }))
      let resolveIpc!: (value: { success: true }) => void
      electronApi.resolveAiApproval.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveIpc = resolve
        })
      )

      const resolving = store.resolveApproval('a2', { status: 'rejected', reason: 'no' })
      store.pendingApprovals.splice(0, 1)
      store.pendingApprovals.push(makeApproval({ id: 'a3' }))
      resolveIpc({ success: true })
      await resolving

      expect(store.pendingApprovals.map((approval) => approval.id)).toEqual(['a3'])
    })

    it('locks the first approval decision while it is in flight', async () => {
      const fileStore = useFileStore()
      const tab = fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)
      const store = useAiStore()
      store.pendingApprovals.push(makeApproval({
        id: 'a1',
        execution: {
          location: 'renderer',
          operation: { type: 'replace-document', target: snap.activeDocument!, content: 'new', reason: '' }
        }
      }))
      const resolvers: Array<(value: { success: true }) => void> = []
      electronApi.resolveAiApproval.mockImplementation(
        () => new Promise((resolve) => {
          resolvers.push(resolve)
        })
      )

      const approved = store.resolveApproval('a1', { status: 'approved', scope: 'once' })
      const rejected = store.resolveApproval('a1', { status: 'rejected', reason: 'too late' })
      await vi.waitFor(() => expect(resolvers).toHaveLength(1))
      resolvers.forEach((resolve) => resolve({ success: true }))
      await Promise.all([approved, rejected])

      expect(tab.content).toBe('new')
      expect(tab.revision).toBe(1)
      expect(electronApi.resolveAiApproval).toHaveBeenCalledTimes(1)
      expect(electronApi.resolveAiApproval.mock.calls[0][1]).toEqual({ status: 'approved', scope: 'once' })
    })

    it('snapshots the approval decision before awaiting renderer work', async () => {
      const fileStore = useFileStore()
      fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)
      const store = useAiStore()
      store.pendingApprovals.push(makeApproval({
        id: 'a1',
        execution: {
          location: 'renderer',
          operation: { type: 'replace-document', target: snap.activeDocument!, content: 'new', reason: '' }
        }
      }))
      const decision = { status: 'approved', scope: 'once' } as const
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })

      const resolving = store.resolveApproval('a1', decision)
      ;(decision as { status: string }).status = 'rejected'
      await resolving

      expect(electronApi.resolveAiApproval.mock.calls[0][1]).toEqual({ status: 'approved', scope: 'once' })
    })

    it('does not cache a renderer result after a terminal event discarded its approval', async () => {
      const fileStore = useFileStore()
      fileStore.createGeneratedDocument('标题', 'old', 'markdown')
      const snap = createExecutionSnapshot(fileStore)
      let resolveApply!: (value: { status: 'applied' }) => void
      const apply = vi.spyOn(workspaceContext, 'applyDocumentOperation')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveApply = resolve
        }))
        .mockResolvedValueOnce({ status: 'applied' })
      const store = useAiStore()
      store.init()
      emit({ type: 'run-started', runId: 'r1' })
      const approval = makeApproval({
        id: 'a1',
        runId: 'r1',
        execution: {
          location: 'renderer',
          operation: { type: 'replace-document', target: snap.activeDocument!, content: 'new', reason: '' }
        }
      })
      store.pendingApprovals.push(approval)
      electronApi.resolveAiApproval.mockResolvedValue({ success: false, error: 'stale' })

      const staleResolution = store.resolveApproval('a1', { status: 'approved', scope: 'once' })
      await vi.waitFor(() => expect(resolveApply).toBeTypeOf('function'))
      emit({ type: 'run-cancelled', runId: 'r1' })
      resolveApply({ status: 'applied' })
      await staleResolution

      store.pendingApprovals.push({ ...approval, runId: 'r2' })
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })
      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(apply).toHaveBeenCalledTimes(2)
    })

    it('deactivates AI after an approved generated document is created', async () => {
      const store = useAiStore()
      store.openPanel()
      store.pendingApprovals.push(makeApproval({
        id: 'a1',
        execution: {
          location: 'renderer',
          operation: {
            type: 'create-document',
            title: 'Generated',
            content: 'visible content',
            format: 'markdown',
            reason: ''
          }
        }
      }))
      electronApi.resolveAiApproval.mockResolvedValue({ success: true })

      await store.resolveApproval('a1', { status: 'approved', scope: 'once' })

      expect(store.panelActive).toBe(false)
      expect(useFileStore().fileContent).toBe('visible content')
    })
  })
})
