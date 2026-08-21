import { describe, expect, it, vi } from 'vitest'
import type { AiExecutionSnapshot, LocalFileReadResult, WebSourceReadResult } from '../../../shared/ai/types'
import { createSourceAuthorizationContext } from '../source-authorization'
import { SourceAccessService } from '../source-access-service'
import { createSourceAccessTools } from '../tools/source-access-tools'
import type { ToolExecutionContext } from '../tool-registry'

const snapshot: AiExecutionSnapshot = {
  conversationId: 'conv-1',
  activeDocument: null,
  selection: null,
  cursor: null
}

function context(message: string, signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return {
    snapshot,
    sourceAuthorization: createSourceAuthorizationContext({ message, history: [] }),
    abortSignal: signal
  }
}

describe('source access tools', () => {
  it('defines read_web_url with the exact schema, policy and inert preview', async () => {
    const service = {
      inspectLocalFile: vi.fn(),
      readLocalFile: vi.fn(),
      readWebUrl: vi.fn()
    } as unknown as SourceAccessService
    const tool = createSourceAccessTools(service).readWebUrl

    expect(tool.inputSchema.safeParse({ url: '', reason: 'ok' }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: 'https://example.com/report', reason: '  ' }).success).toBe(false)
    expect(tool.execution).toBe('main')
    expect(tool.policy).toEqual({ effect: 'network', approval: 'always', riskLevel: 'medium', supportsRememberDecision: false })
    await expect(tool.createApprovalPreview?.(
      { url: 'https://example.com/report', reason: '总结报告' },
      context('读取 https://example.com/report')
    )).resolves.toEqual({ type: 'network-request', method: 'GET', url: 'https://example.com/report', reason: '总结报告' })
    expect(service.readWebUrl).not.toHaveBeenCalled()
    expect(service.inspectLocalFile).not.toHaveBeenCalled()
  })

  it('normalizes before local inspection and defers authorization to execute', async () => {
    const inspectLocalFile = vi.fn().mockResolvedValue({
      requestedPath: 'C:\\Docs\\Report.pdf', normalizedPath: 'C:\\Docs\\Report.pdf', fileType: 'pdf', size: 42
    })
    const service = { inspectLocalFile, readLocalFile: vi.fn(), readWebUrl: vi.fn() } as unknown as SourceAccessService
    const tool = createSourceAccessTools(service).readLocalFile
    const authorized = context('读取 `C:\\Docs\\Report.pdf`')

    expect(tool.policy).toEqual({ effect: 'read', approval: 'always', riskLevel: 'medium', supportsRememberDecision: false })
    await expect(tool.createApprovalPreview?.(
      { path: 'c:/Docs/Report.pdf', reason: '总结文件' }, authorized
    )).resolves.toEqual({
      type: 'local-file-read', requestedPath: 'c:/Docs/Report.pdf', normalizedPath: 'C:\\Docs\\Report.pdf', fileType: 'pdf', size: 42, reason: '总结文件'
    })
    expect(inspectLocalFile).toHaveBeenCalledWith('C:\\Docs\\Report.pdf')
    expect(service.readLocalFile).not.toHaveBeenCalled()

    // 格式有效的路径在 createApprovalPreview 中不再因未授权而抛异常
    // 授权检查推迟到 execute 阶段
    inspectLocalFile.mockClear()
    await expect(tool.createApprovalPreview?.(
      { path: 'C:\\Docs\\Other.pdf', reason: '待审' }, authorized
    )).resolves.toBeDefined()
    expect(inspectLocalFile).toHaveBeenCalled()
  })

  it('executes body read with a live abort signal and rejects invalid formats', async () => {
    const webResult = { url: 'https://example.com/report' } as WebSourceReadResult
    const localResult = { requestedPath: 'C:\\Docs\\Report.pdf' } as LocalFileReadResult
    const service = {
      inspectLocalFile: vi.fn(),
      readWebUrl: vi.fn().mockResolvedValue(webResult),
      readLocalFile: vi.fn().mockResolvedValue(localResult)
    } as unknown as SourceAccessService
    const tools = createSourceAccessTools(service)
    const controller = new AbortController()
    if (tools.readWebUrl.execution !== 'main' || tools.readLocalFile.execution !== 'main') {
      throw new Error('source tools must execute in main')
    }

    await expect(tools.readWebUrl.execute(
      { url: 'https://example.com/report', reason: '总结' }, context('https://example.com/report', controller.signal)
    )).resolves.toBe(webResult)
    const localContext = context('`C:\\Docs\\Report.pdf`', controller.signal)
    service.inspectLocalFile = vi.fn().mockResolvedValue({
      requestedPath: 'C:\\Docs\\Report.pdf', normalizedPath: 'C:\\Docs\\Report.pdf', resolvedPath: 'C:\\Docs\\Report.pdf', fileType: 'pdf', size: 1
    })
    await tools.readLocalFile.createApprovalPreview?.({ path: 'c:/Docs/Report.pdf', reason: '总结' }, localContext)
    await expect(tools.readLocalFile.execute(
      { path: 'c:/Docs/Report.pdf', reason: '总结' }, localContext
    )).resolves.toBe(localResult)
    expect(service.readWebUrl).toHaveBeenCalledWith('https://example.com/report', controller.signal)
    expect(service.readLocalFile).toHaveBeenCalledWith('C:\\Docs\\Report.pdf', controller.signal, expect.objectContaining({ resolvedPath: 'C:\\Docs\\Report.pdf' }))

    // 格式无效的 URL 仍拒绝
    await expect(tools.readWebUrl.execute(
      { url: 'http://example.com/insecure', reason: '无效' }, context('https://example.com/report')
    )).rejects.toMatchObject({ code: 'SOURCE_INVALID' })
    // 缺少中止信号时拒绝
    const authorized = context('https://example.com/report')
    const noSignal: ToolExecutionContext = {
      snapshot: authorized.snapshot,
      sourceAuthorization: authorized.sourceAuthorization
    }
    await expect(tools.readWebUrl.execute(
      { url: 'https://example.com/report', reason: '总结' }, noSignal
    )).rejects.toThrow(/中止信号/)
    controller.abort()
    await expect(tools.readLocalFile.execute(
      { path: 'C:\\Docs\\Report.pdf', reason: '总结' }, context('`C:\\Docs\\Report.pdf`', controller.signal)
    )).rejects.toThrow(/中止/)
  })

  it('carries the metadata-only approval identity into Main execution', async () => {
    const inspection = {
      requestedPath: 'C:\\Docs\\Report.pdf', normalizedPath: 'C:\\Docs\\Report.pdf', resolvedPath: 'C:\\Docs\\Report.pdf',
      fileType: 'pdf' as const, size: 42, dev: 1, ino: 2, mode: 0, mtimeMs: 3, ctimeMs: 4
    }
    const service = {
      inspectLocalFile: vi.fn().mockResolvedValue(inspection),
      readLocalFile: vi.fn().mockResolvedValue({ content: 'ok' }),
      readWebUrl: vi.fn()
    } as unknown as SourceAccessService
    const tool = createSourceAccessTools(service).readLocalFile
    if (tool.execution !== 'main') throw new Error('source tool must execute in main')
    const executionContext = context('读取 `C:\\Docs\\Report.pdf`')
    const preview = await tool.createApprovalPreview?.({ path: 'C:\\Docs\\Report.pdf', reason: '总结' }, executionContext)
    expect(preview).not.toHaveProperty('dev')
    await tool.execute({ path: 'C:\\Docs\\Report.pdf', reason: '总结' }, executionContext)
    expect(service.readLocalFile).toHaveBeenCalledWith('C:\\Docs\\Report.pdf', executionContext.abortSignal, inspection)
  })
})
