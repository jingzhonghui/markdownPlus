import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { createDocumentTools } from '../tools/document-tools'
import { createTimeTools } from '../tools/time-tools'
import { AiRuntime } from '../runtime'
import { ToolRegistry, type ToolExecutionContext } from '../tool-registry'
import { ApprovalManager } from '../approval-manager'
import { SourceAccessService } from '../source-access-service'
import { createSourceAuthorizationContext } from '../source-authorization'
import { SYSTEM_PROMPT } from '../prompts'
import type { LlmProvider, AiProviderEvent, ProviderTool } from '../provider'
import type {
  AiDocumentSnapshot,
  AiExecutionSnapshot,
  AiRunEvent,
  AiRunInput,
  AiRuntimeConfig,
  AiSelectionSnapshot
} from '../../../shared/ai/types'

function makeDoc(overrides: Partial<AiDocumentSnapshot> = {}): AiDocumentSnapshot {
  return {
    id: 'doc-1',
    title: '测试文档',
    path: null,
    format: 'markdown',
    content: '# 标题\n\n正文内容',
    revision: 3,
    contentHash: 'hash-abc',
    modified: false,
    ...overrides
  }
}

function makeSnapshot(
  doc: AiDocumentSnapshot | null = makeDoc(),
  selection: AiSelectionSnapshot | null = null,
  cursor: number | null = null
): AiExecutionSnapshot {
  return {
    runId: randomUUID(),
    conversationId: 'conv-1',
    activeDocument: doc,
    selection,
    cursor,
  }
}

function makeConfig(): AiRuntimeConfig {
  return {
    baseUrl: 'https://api.example.com/v1',
    model: 'demo',
    apiKey: 'secret',
    temperature: 0.7
  }
}

function makeRunInput(snapshot: AiExecutionSnapshot): AiRunInput {
  return {
    conversationId: snapshot.conversationId,
    message: '请总结文档',
    history: [],
    snapshot
  }
}

interface CapturedRun {
  tools: Record<string, ProviderTool>
  messages: unknown[]
  system: string
  maxSteps: number
}

class FakeProvider implements LlmProvider {
  captured: CapturedRun | null = null
  private events: AiProviderEvent[] = []
  private _finish: (() => void) | null = null
  readonly finished = new Promise<void>((resolve) => {
    this._finish = resolve
  })

  setEvents(events: AiProviderEvent[]): void {
    this.events = events
  }

  finish(): void {
    this._finish?.()
  }

  async *run(input: {
    config: AiRuntimeConfig
    system: string
    messages: unknown[]
    tools: Record<string, ProviderTool>
    maxSteps: number
    abortSignal: AbortSignal
  }): AsyncIterable<AiProviderEvent> {
    this.captured = {
      tools: input.tools,
      messages: input.messages,
      system: input.system,
      maxSteps: input.maxSteps
    }
    let abortReject: ((error: Error) => void) | null = null
    const abortPromise = new Promise<never>((_, reject) => {
      abortReject = reject
    })
    const onAbort = (): void => abortReject?.(new Error('aborted'))
    input.abortSignal.addEventListener('abort', onAbort, { once: true })
    try {
      for (const event of this.events) {
        if (input.abortSignal.aborted) throw new Error('aborted')
        yield event
      }
      await Promise.race([this.finished, abortPromise])
      yield { type: 'completed' }
    } finally {
      input.abortSignal.removeEventListener('abort', onAbort)
    }
  }

  async testConnection(): Promise<{ textGeneration: boolean; toolCalling: boolean }> {
    return { textGeneration: true, toolCalling: true }
  }

  async summarize(): Promise<string> {
    return 'fake'
  }
}

function makeRuntime(
  provider: LlmProvider,
  options: { maxSteps?: number; toolTimeoutMs?: number; approvalTimeoutMs?: number } = {},
  sourceAccessService = new SourceAccessService()
): AiRuntime {
  const approvalTimeoutMs = options.approvalTimeoutMs ?? 60_000
  return new AiRuntime({
    provider,
    registry: new ToolRegistry(),
    approvalManager: new ApprovalManager({ approvalTimeoutMs }),
    sourceAccessService,
    config: makeConfig(),
    ...options,
    approvalTimeoutMs
  })
}

async function waitRunEnd(
  events: AiRunEvent[],
  type: 'run-completed' | 'run-cancelled'
): Promise<void> {
  await vi.waitFor(() => expect(events.some((e) => e.type === type)).toBe(true))
}

describe('document tools', () => {
  const service = new SourceAccessService()
  const tools = createDocumentTools(service)
  const searchFiles = tools.searchWorkspaceFiles as unknown as {
    execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
  }
  const readFile = tools.readWorkspaceFile as unknown as {
    execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
  }
  const readSel = tools.readSelectedText as unknown as {
    execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
  }

  function contextWith(
    snapshot: AiExecutionSnapshot,
    abortSignal?: AbortSignal
  ): ToolExecutionContext {
    return {
      snapshot,
      sourceAuthorization: createSourceAuthorizationContext({ message: '', history: [] }),
      abortSignal
    }
  }

  it('search_workspace_files 按名称返回匹配的文件', async () => {
    const snapshot = makeSnapshot(null)
    snapshot.workspaceFiles = [
      { name: 'notes.md', path: '/docs/notes.md', isOpen: true, parentDirs: ['docs'] },
      { name: 'report.md', path: '/docs/report.md', isOpen: false, parentDirs: ['docs'] },
      { name: 'draft.mdx', path: '/docs/draft.mdx', isOpen: false, parentDirs: ['docs'] }
    ]
    const result = await searchFiles.execute({ query: 'report' }, contextWith(snapshot))
    expect(result).toEqual({
      query: 'report',
      matches: [{ name: 'report.md', path: '/docs/report.md', isOpen: false, parentDirs: ['docs'] }],
      total: 1,
      matchedDirs: []
    })
  })

  it('search_workspace_files 无匹配时返回空列表', async () => {
    const result = await searchFiles.execute({ query: 'missing' }, contextWith(makeSnapshot(null)))
    expect(result).toEqual({ query: 'missing', matches: [], total: 0, matchedDirs: [] })
  })

  it('read_workspace_file 读取工作区中的文件', async () => {
    const readLocalFile = vi.fn().mockResolvedValue({
      requestedPath: '/docs/notes.md',
      normalizedPath: '/docs/notes.md',
      fileType: 'markdown',
      content: '# 内容'
    })
    const fakeService = { readLocalFile } as unknown as SourceAccessService
    const localTools = createDocumentTools(fakeService)
    const snapshot = makeSnapshot(null)
    snapshot.workspaceFiles = [{ name: 'notes.md', path: '/docs/notes.md', isOpen: true, parentDirs: ['docs'] }]
    const result = await (localTools.readWorkspaceFile as unknown as {
      execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
    }).execute({ path: '/docs/notes.md' }, contextWith(snapshot, new AbortController().signal))
    expect(readLocalFile).toHaveBeenCalledWith('/docs/notes.md', expect.any(AbortSignal))
    expect(result).toMatchObject({ normalizedPath: '/docs/notes.md', content: '# 内容' })
  })

  it('read_workspace_file 拒绝读取工作区外的路径', async () => {
    const snapshot = makeSnapshot(null)
    snapshot.workspaceFiles = [{ name: 'notes.md', path: '/docs/notes.md', isOpen: true, parentDirs: ['docs'] }]
    await expect(
      readFile.execute({ path: '/etc/passwd' }, contextWith(snapshot, new AbortController().signal))
    ).rejects.toThrow('工作区')
  })

  it('read_selected_text 返回选区', async () => {
    const doc = makeDoc()
    const selection: AiSelectionSnapshot = { text: '正文', from: 5, to: 7, cursor: 7 }
    const context = contextWith(makeSnapshot(doc, selection, 7))
    const result = await readSel.execute({}, context)
    expect(result).toEqual({
      available: true,
      documentId: 'doc-1',
      text: '正文',
      from: 5,
      to: 7
    })
  })

  it('read_selected_text 无选区时返回 not_available', async () => {
    const context = contextWith(makeSnapshot(makeDoc(), null))
    const result = await readSel.execute({}, context)
    expect(result).toEqual({ available: false })
  })
})

describe('time tools', () => {
  const tools = createTimeTools()
  const getNow = tools.getCurrentDatetime as unknown as {
    execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
  }

  function contextWith(
    snapshot: AiExecutionSnapshot
  ): ToolExecutionContext {
    return {
      snapshot,
      sourceAuthorization: createSourceAuthorizationContext({ message: '', history: [] })
    }
  }

  it('get_current_datetime 返回当前日期、星期和时区', async () => {
    const before = Date.now()
    const result = await getNow.execute({}, contextWith(makeSnapshot(null)))
    const after = Date.now()
    const data = result as Record<string, unknown>

    expect(typeof data.year).toBe('number')
    expect(typeof data.month).toBe('number')
    expect(typeof data.day).toBe('number')
    expect(typeof data.weekday).toBe('string')
    expect(typeof data.hour).toBe('number')
    expect(typeof data.minute).toBe('number')
    expect(typeof data.second).toBe('number')
    expect(typeof data.timezone).toBe('string')
    expect(['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']).toContain(data.weekday)

    const isoTime = new Date(data.iso as string).getTime()
    expect(isoTime).toBeGreaterThanOrEqual(before)
    expect(isoTime).toBeLessThanOrEqual(after)
  })
})

describe('runtime approval flow', () => {
  it('registers exactly eight tools and pops approval for any valid URL', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const input = makeRunInput(makeSnapshot())
    input.message = '读取 https://example.com/current'
    input.history = [
      { id: 'u1', role: 'user', content: '也读取 `C:\\Docs\\History.pdf`' },
      { id: 'a1', role: 'assistant', content: 'https://evil.example/assistant' }
    ]
    const events: AiRunEvent[] = []
    void runtime.start(input, (event) => events.push(event))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())

    expect(Object.keys(provider.captured!.tools)).toEqual([
      'list_workspace_root', 'search_workspace_files', 'read_workspace_directory', 'read_workspace_file',
      'read_selected_text', 'get_current_datetime', 'read_web_url', 'read_local_file',
      'replace_current_document', 'insert_into_current_document', 'create_document'
    ])
    const web = provider.captured!.tools.read_web_url!
    const execution = web.execute({ url: 'https://evil.example/assistant', reason: 'bad' }, { toolCallId: 'evil-call' })
    // 审批弹窗弹出（不再做白名单检查，格式有效即弹出）
    await vi.waitFor(() => expect(events.some((e) => e.type === 'approval-required')).toBe(true))
    const request = events.find((e) => e.type === 'approval-required')!.approval
    runtime.resolveApproval(request.id, { status: 'rejected' })
    await expect(execution).resolves.toEqual({ status: 'rejected', message: '用户拒绝了该操作' })
    runtime.dispose()
  })

  it.each([
    ['rejected', { status: 'rejected' } as const],
    ['cancelled', { status: 'cancelled' } as const]
  ])('%s source approval performs no body read', async (_label, decision) => {
    const provider = new FakeProvider()
    const readWebUrl = vi.fn()
    const service = { inspectLocalFile: vi.fn(), readLocalFile: vi.fn(), readWebUrl } as unknown as SourceAccessService
    const runtime = makeRuntime(provider, {}, service)
    const input = makeRunInput(makeSnapshot())
    input.message = '读取 https://example.com/report'
    const events: AiRunEvent[] = []
    void runtime.start(input, (event) => events.push(event))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const execution = provider.captured!.tools.read_web_url!.execute(
      { url: 'https://example.com/report', reason: '总结' }, { toolCallId: 'source-call' }
    )
    await vi.waitFor(() => expect(events.some((event) => event.type === 'approval-required')).toBe(true))
    const request = events.find((event) => event.type === 'approval-required')!.approval
    runtime.resolveApproval(request.id, decision)
    await execution
    expect(readWebUrl).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('approved Main source read needs no claim/result, re-authorizes, and reaches Provider', async () => {
    const provider = new FakeProvider()
    const result = { url: 'https://example.com/report', content: 'body' }
    const readWebUrl = vi.fn().mockResolvedValue(result)
    const service = { inspectLocalFile: vi.fn(), readLocalFile: vi.fn(), readWebUrl } as unknown as SourceAccessService
    const runtime = makeRuntime(provider, {}, service)
    const input = makeRunInput(makeSnapshot())
    input.message = '读取 https://example.com/report'
    const events: AiRunEvent[] = []
    void runtime.start(input, (event) => events.push(event))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const execution = provider.captured!.tools.read_web_url!.execute(
      { url: 'https://example.com/report', reason: '总结' }, { toolCallId: 'source-call' }
    )
    await vi.waitFor(() => expect(events.some((event) => event.type === 'approval-required')).toBe(true))
    const request = events.find((event) => event.type === 'approval-required')!.approval
    expect(request.preview).toEqual({ type: 'network-request', method: 'GET', url: 'https://example.com/report', reason: '总结' })
    expect(request.execution).toEqual({ location: 'main' })
    expect(() => runtime.claimApproval(request.id)).toThrow(/无需渲染进程/)
    runtime.resolveApproval(request.id, { status: 'approved', scope: 'once' })
    await expect(execution).resolves.toEqual({ status: 'completed', data: result })
    expect(readWebUrl).toHaveBeenCalledOnce()
    expect(readWebUrl.mock.calls[0]![1]).toBeInstanceOf(AbortSignal)
    runtime.dispose()
  })

  it('expired source approval performs zero local body reads after metadata-only preview', async () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const inspectLocalFile = vi.fn().mockResolvedValue({ requestedPath: 'C:\\Docs\\Report.pdf', normalizedPath: 'C:\\Docs\\Report.pdf', fileType: 'pdf', size: 10 })
    const readLocalFile = vi.fn()
    const service = { inspectLocalFile, readLocalFile, readWebUrl: vi.fn() } as unknown as SourceAccessService
    const runtime = makeRuntime(provider, { approvalTimeoutMs: 20 }, service)
    const input = makeRunInput(makeSnapshot())
    input.message = '读取 `C:\\Docs\\Report.pdf`'
    void runtime.start(input, () => {})
    await vi.advanceTimersByTimeAsync(1)
    const execution = provider.captured!.tools.read_local_file!.execute({ path: 'C:\\Docs\\Report.pdf', reason: '总结' })
    await vi.advanceTimersByTimeAsync(20)
    await expect(execution).resolves.toMatchObject({ status: 'cancelled', message: '审批超时' })
    expect(inspectLocalFile).toHaveBeenCalledOnce()
    expect(readLocalFile).not.toHaveBeenCalled()
    runtime.dispose()
    vi.useRealTimers()
  })

  it('approved local read executes against the exact identity inspected for its preview', async () => {
    const provider = new FakeProvider()
    const inspection = {
      requestedPath: 'C:\\Docs\\Report.pdf', normalizedPath: 'C:\\Docs\\Report.pdf', resolvedPath: 'C:\\Docs\\Report.pdf',
      fileType: 'pdf' as const, size: 10, dev: 1, ino: 2, mode: 0, mtimeMs: 3, ctimeMs: 4
    }
    const service = {
      inspectLocalFile: vi.fn().mockResolvedValue(inspection), readLocalFile: vi.fn().mockResolvedValue({ content: 'body' }), readWebUrl: vi.fn()
    } as unknown as SourceAccessService
    const runtime = makeRuntime(provider, {}, service)
    const input = makeRunInput(makeSnapshot())
    input.message = '读取 `C:\\Docs\\Report.pdf`'
    const events: AiRunEvent[] = []
    void runtime.start(input, (event) => events.push(event))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const execution = provider.captured!.tools.read_local_file!.execute({ path: 'C:\\Docs\\Report.pdf', reason: '总结' })
    await vi.waitFor(() => expect(events.some((event) => event.type === 'approval-required')).toBe(true))
    const request = events.find((event) => event.type === 'approval-required')!.approval
    expect(request.preview).not.toHaveProperty('dev')
    runtime.resolveApproval(request.id, { status: 'approved', scope: 'once' })
    await execution
    expect(service.readLocalFile).toHaveBeenCalledWith('C:\\Docs\\Report.pdf', expect.any(AbortSignal), inspection)
    runtime.dispose()
  })

  it('replace_current_document 发出 markdown-diff 审批并应用 renderer 结果', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const doc = makeDoc()
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(doc)), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const replaceTool = provider.captured!.tools['replace_current_document']!

    const executePromise = replaceTool.execute({ content: '新内容', reason: '测试替换' })

    await vi.waitFor(() => expect(events.some((e) => e.type === 'approval-required')).toBe(true))
    const approvalEvent = events.find((e) => e.type === 'approval-required')!
    expect(approvalEvent.type).toBe('approval-required')

    const req = approvalEvent.approval
    expect(req.preview).toEqual({
      type: 'markdown-diff',
      title: '测试文档',
      before: '# 标题\n\n正文内容',
      after: '新内容'
    })
    expect(req.execution).toEqual({
      location: 'renderer',
      operation: {
        type: 'replace-document',
        target: doc,
        content: '新内容',
        reason: '测试替换'
      }
    })

    runtime.claimApproval(req.id)
    runtime.resolveApproval(req.id, { status: 'approved', scope: 'once' }, { status: 'applied' })
    const result = await executePromise
    expect(result).toEqual({ status: 'applied' })

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('拒绝的审批返回 rejected 且不执行 renderer 操作', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const replaceTool = provider.captured!.tools['replace_current_document']!

    const executePromise = replaceTool.execute({ content: '新内容', reason: '测试替换' })
    await vi.waitFor(() => expect(events.some((e) => e.type === 'approval-required')).toBe(true))
    const req = events.find((e) => e.type === 'approval-required')!.approval

    runtime.resolveApproval(req.id, { status: 'rejected', reason: '用户不同意' })
    const result = await executePromise
    expect(result.status).toBe('rejected')

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('cancels pending approvals when a run finalizes', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (event) => events.push(event))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const execution = provider.captured!.tools['replace_current_document']!.execute(
      { content: '新内容', reason: '测试替换' },
      { toolCallId: 'pending-call' }
    )
    await vi.waitFor(() => expect(events.some((event) => event.type === 'approval-required')).toBe(true))

    provider.finish()

    await waitRunEnd(events, 'run-completed')
    await expect(execution).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('renderer approval without an execution result fails immediately', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())

    const execution = provider.captured!.tools['replace_current_document']!.execute(
      { content: '新内容', reason: '测试替换' },
      { toolCallId: 'renderer-call' }
    )
    await vi.waitFor(() => expect(events.some((e) => e.type === 'approval-required')).toBe(true))
    const request = events.find((e) => e.type === 'approval-required')!.approval

    expect(() =>
      runtime.resolveApproval(request.id, { status: 'approved', scope: 'once' })
    ).toThrow('渲染进程执行结果缺失')
    await runtime.cancel(request.runId)
    await expect(execution).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('requires a one-time claim before resolving an approved renderer operation', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (event) => events.push(event))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const execution = provider.captured!.tools['replace_current_document']!.execute(
      { content: '新内容', reason: '测试替换' },
      { toolCallId: 'renderer-call' }
    )
    await vi.waitFor(() => expect(events.some((event) => event.type === 'approval-required')).toBe(true))
    const request = events.find((event) => event.type === 'approval-required')!.approval

    expect(() =>
      runtime.resolveApproval(request.id, { status: 'approved', scope: 'once' }, { status: 'applied' })
    ).toThrow('渲染进程审批尚未认领')
    expect(runtime.claimApproval(request.id)).toBe(request)
    expect(() => runtime.claimApproval(request.id)).toThrow('审批已被认领')
    runtime.resolveApproval(request.id, { status: 'approved', scope: 'once' }, { status: 'applied' })

    await expect(execution).resolves.toEqual({ status: 'applied' })
    runtime.dispose()
  })

  it('renderer approval rejects a non-renderer execution result contract', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())

    const execution = provider.captured!.tools['replace_current_document']!.execute(
      { content: '新内容', reason: '测试替换' },
      { toolCallId: 'renderer-call' }
    )
    await vi.waitFor(() => expect(events.some((e) => e.type === 'approval-required')).toBe(true))
    const request = events.find((e) => e.type === 'approval-required')!.approval

    runtime.claimApproval(request.id)
    expect(() =>
      runtime.resolveApproval(
        request.id,
        { status: 'approved', scope: 'once' },
        { status: 'completed' }
      )
    ).toThrow('渲染进程执行结果无效')
    await runtime.cancel(request.runId)
    await expect(execution).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('unknown or expired approval resolution fails instead of succeeding silently', async () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider, { approvalTimeoutMs: 20 })

    expect(() => runtime.resolveApproval('missing', { status: 'rejected' })).toThrow(
      '审批不存在或已失效'
    )

    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.advanceTimersByTimeAsync(1)
    const execution = provider.captured!.tools['replace_current_document']!.execute(
      { content: '新内容', reason: '测试替换' },
      { toolCallId: 'expired-call' }
    )
    await vi.advanceTimersByTimeAsync(20)
    const request = events.find((e) => e.type === 'approval-required')!.approval
    await expect(execution).resolves.toMatchObject({ status: 'cancelled', message: '审批超时' })
    expect(() => runtime.resolveApproval(request.id, { status: 'rejected' })).toThrow(
      '审批不存在或已失效'
    )
    runtime.dispose()
    vi.useRealTimers()
  })

  it('associates parallel approvals with each SDK execute toolCallId', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const tool = provider.captured!.tools['replace_current_document']!

    const first = tool.execute({ content: '一', reason: 'first' }, { toolCallId: 'call-a' })
    const second = tool.execute({ content: '二', reason: 'second' }, { toolCallId: 'call-b' })
    await vi.waitFor(() =>
      expect(events.filter((e) => e.type === 'approval-required')).toHaveLength(1)
    )
    const firstRequest = events.find((e) => e.type === 'approval-required')!.approval
    expect(firstRequest.toolCallId).toBe('call-a')
    runtime.resolveApproval(firstRequest.id, { status: 'rejected' })
    await first

    await vi.waitFor(() =>
      expect(events.filter((e) => e.type === 'approval-required')).toHaveLength(2)
    )
    const approvals = events.filter((e) => e.type === 'approval-required')
    const secondRequest = approvals[1]!.approval
    expect(secondRequest.toolCallId).toBe('call-b')
    runtime.resolveApproval(secondRequest.id, { status: 'rejected' })
    await second
    runtime.dispose()
  })

  it('search_workspace_files 经 runtime 返回 completed + 匹配结果', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const snapshot = makeSnapshot(makeDoc())
    snapshot.workspaceFiles = [{ name: '测试文档.md', path: '/docs/测试文档.md', isOpen: true, parentDirs: ['docs'] }]
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(snapshot), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const searchTool = provider.captured!.tools['search_workspace_files']!
    const result = await searchTool.execute({ query: '测试文档' })
    expect(result).toEqual({
      status: 'completed',
      data: {
        query: '测试文档',
        matches: [{ name: '测试文档.md', path: '/docs/测试文档.md', isOpen: true, parentDirs: ['docs'] }],
        total: 1,
        matchedDirs: []
      }
    })

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('always uses the built-in system prompt and cannot be overridden', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    expect(provider.captured!.system).toBe(SYSTEM_PROMPT)

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('文档内容不出现在初始 Provider 消息中', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const doc = makeDoc()
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(doc)), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const serialized = JSON.stringify(provider.captured!.messages)
    expect(serialized).not.toContain('正文内容')
    expect(provider.captured!.system).not.toContain('正文内容')

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })
})

describe('runtime lifecycle', () => {
  it('同一时间只允许一个激活运行', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())

    await expect(runtime.start(makeRunInput(makeSnapshot(makeDoc())), () => {})).rejects.toThrow(
      '已有激活的 AI 运行'
    )

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('cancel 中止 Provider 并取消审批', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const replaceTool = provider.captured!.tools['replace_current_document']!
    const executePromise = replaceTool.execute({ content: '新内容', reason: '测试替换' })

    await vi.waitFor(() => expect(events.some((e) => e.type === 'approval-required')).toBe(true))
    const runId = (events.find((e) => e.type === 'run-started') as { runId: string }).runId

    await runtime.cancel(runId)
    const result = await executePromise
    expect(result.status).toBe('cancelled')

    await waitRunEnd(events, 'run-cancelled')
  })

  it('传递 maxSteps 给 Provider', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider, { maxSteps: 5 })
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    expect(provider.captured!.maxSteps).toBe(5)
    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('默认 maxSteps 为 20', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    expect(provider.captured!.maxSteps).toBe(20)
    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('第 13 个工具步骤产生 TOOL_LIMIT_REACHED', async () => {
    const provider = new FakeProvider()
    const toolCalls = Array.from({ length: 13 }, (_, i) => ({
      type: 'tool-call-started' as const,
      toolCallId: `tc-${i}`,
      toolName: 'search_workspace_files'
    }))
    provider.setEvents(toolCalls)
    const runtime = makeRuntime(provider, { maxSteps: 12 })
    const events: AiRunEvent[] = []
    await runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))

    await vi.waitFor(() => expect(events.some((e) => e.type === 'run-failed')).toBe(true))
    const failed = events.find((e) => e.type === 'run-failed')
    expect(failed && failed.type === 'run-failed' ? failed.error.code : '').toBe(
      'TOOL_LIMIT_REACHED'
    )
  })

  it('工具超时不包含审批等待时间', async () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider, { toolTimeoutMs: 20, approvalTimeoutMs: 100 })
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.advanceTimersByTimeAsync(1)
    const replaceTool = provider.captured!.tools['replace_current_document']!
    const execution = replaceTool.execute(
      { content: '新内容', reason: '测试替换' },
      { toolCallId: 'waiting-call' }
    )
    await vi.advanceTimersByTimeAsync(50)
    expect(events.some((e) => e.type === 'run-failed')).toBe(false)
    const request = events.find((e) => e.type === 'approval-required')!.approval
    runtime.resolveApproval(request.id, { status: 'rejected' })
    await expect(execution).resolves.toMatchObject({ status: 'rejected' })
    runtime.dispose()
    vi.useRealTimers()
  })

  it('actual tool timeout aborts the signal passed to the underlying execute', async () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const registry = new ToolRegistry()
    let receivedSignal: AbortSignal | undefined
    registry.register({
      name: 'slow_tool',
      description: 'slow',
      inputSchema: { safeParse: () => ({ success: true, data: {} }) } as never,
      policy: {
        effect: 'read',
        approval: 'never',
        riskLevel: 'low',
        supportsRememberDecision: false
      },
      execution: 'main',
      execute: async (_input, context) => {
        receivedSignal = context.abortSignal
        await new Promise<void>(() => {})
      }
    })
    const runtime = new AiRuntime({
      provider,
      registry,
      approvalManager: new ApprovalManager(),
      sourceAccessService: new SourceAccessService(),
      config: makeConfig(),
      toolTimeoutMs: 20
    })
    void runtime.start(makeRunInput(makeSnapshot()), () => {})
    await vi.advanceTimersByTimeAsync(1)
    const execution = provider.captured!.tools.slow_tool!.execute({}, { toolCallId: 'slow-call' })
    const assertion = expect(execution).rejects.toThrow('工具执行超时')
    await vi.advanceTimersByTimeAsync(20)

    await assertion
    expect(receivedSignal?.aborted).toBe(true)
    runtime.dispose()
    vi.useRealTimers()
  })

  it('run cancellation aborts the signal passed to an executing tool', async () => {
    const provider = new FakeProvider()
    const registry = new ToolRegistry()
    let receivedSignal: AbortSignal | undefined
    let release: (() => void) | undefined
    registry.register({
      name: 'cancelled_tool',
      description: 'cancelled',
      inputSchema: { safeParse: () => ({ success: true, data: {} }) } as never,
      policy: {
        effect: 'read',
        approval: 'never',
        riskLevel: 'low',
        supportsRememberDecision: false
      },
      execution: 'main',
      execute: async (_input, context) => {
        receivedSignal = context.abortSignal
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
    })
    const runtime = new AiRuntime({
      provider,
      registry,
      approvalManager: new ApprovalManager(),
      sourceAccessService: new SourceAccessService(),
      config: makeConfig()
    })
    const started = await runtime.start(makeRunInput(makeSnapshot()), () => {})
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const execution = provider.captured!.tools.cancelled_tool!.execute(
      {},
      { toolCallId: 'cancel-call' }
    )
    await vi.waitFor(() => expect(receivedSignal).toBeDefined())

    await runtime.cancel(started.runId)
    expect(receivedSignal?.aborted).toBe(true)
    release?.()
    await execution
    runtime.dispose()
  })

  it('dispose 取消所有激活运行', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(makeSnapshot(makeDoc())), (e) => events.push(e))
    await vi.waitFor(() => expect(provider.captured).not.toBeNull())

    runtime.dispose()
    await waitRunEnd(events, 'run-cancelled')
  })
})

describe('workspace summary injection', () => {
  it('prepends a hidden summary message before the history when workspaceSummary is present', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const snapshot = makeSnapshot(makeDoc())
    const input = {
      ...makeRunInput(snapshot),
      workspaceSummary: '该工作区是云原生运维知识库，包含 k8s、docker 相关文档。'
    }
    const events: AiRunEvent[] = []
    void runtime.start(input, (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const messages = provider.captured!.messages as { role: string; content: string }[]
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('云原生运维')
    expect(messages[0].content).toContain('工作区')
    expect(messages[1].content).toBe('请总结文档')

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })

  it('keeps the original messages unchanged when workspaceSummary is absent', async () => {
    const provider = new FakeProvider()
    const runtime = makeRuntime(provider)
    const snapshot = makeSnapshot(makeDoc())
    const events: AiRunEvent[] = []
    void runtime.start(makeRunInput(snapshot), (e) => events.push(e))

    await vi.waitFor(() => expect(provider.captured).not.toBeNull())
    const messages = provider.captured!.messages as { role: string; content: string }[]
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('请总结文档')

    provider.finish()
    await waitRunEnd(events, 'run-completed')
  })
})
