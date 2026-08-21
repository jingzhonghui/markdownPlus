import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolApprovalRequest } from '../../../shared/ai/types'
import { ApprovalManager } from '../approval-manager'

function makeRequest(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    id: 'approval-1',
    runId: 'run-1',
    toolCallId: 'call-1',
    toolName: 'replace_current_document',
    title: '替换当前文档',
    description: '替换当前文档内容',
    effect: 'write',
    riskLevel: 'high',
    preview: { type: 'document', title: '示例.md', content: '新内容' },
    execution: { location: 'main' },
    createdAt: 0,
    expiresAt: 0,
    ...overrides
  }
}

describe('ApprovalManager', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes an approval and keeps the promise pending until resolved', async () => {
    const manager = new ApprovalManager()
    const req = makeRequest()
    const onPublish = vi.fn()
    let settled = false

    const promise = manager.request(req, onPublish).then(() => {
      settled = true
    })

    expect(onPublish).toHaveBeenCalledWith(req)
    await Promise.resolve()
    expect(settled).toBe(false)

    manager.resolve(req.id, { status: 'approved', scope: 'once' })
    await promise
    expect(settled).toBe(true)
  })

  it('resolves the pending promise with an approved decision', async () => {
    const manager = new ApprovalManager()
    const req = makeRequest()

    const promise = manager.request(req, vi.fn())
    manager.resolve(req.id, { status: 'approved', scope: 'once' })

    await expect(promise).resolves.toEqual({ status: 'approved', scope: 'once' })
  })

  it('resolves with a structured rejected decision', async () => {
    const manager = new ApprovalManager()
    const req = makeRequest()

    const promise = manager.request(req, vi.fn())
    manager.resolve(req.id, { status: 'rejected', reason: '用户拒绝' })

    await expect(promise).resolves.toEqual({ status: 'rejected', reason: '用户拒绝' })
  })

  it('expires an approval after five minutes', async () => {
    vi.useFakeTimers()
    const manager = new ApprovalManager()
    const req = makeRequest()

    const promise = manager.request(req, vi.fn())
    await vi.advanceTimersByTimeAsync(300_000)

    await expect(promise).resolves.toEqual({ status: 'expired' })
  })

  it('uses the injectable timeout duration', async () => {
    vi.useFakeTimers()
    const manager = new ApprovalManager({ approvalTimeoutMs: 1_000 })
    const req = makeRequest()

    const promise = manager.request(req, vi.fn())
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(promise).resolves.toEqual({ status: 'expired' })
  })

  it('atomically expires instead of resolving an approval at its deadline', async () => {
    vi.useFakeTimers()
    const manager = new ApprovalManager({ approvalTimeoutMs: 1_000 })
    const req = makeRequest()
    const promise = manager.request(req, vi.fn())

    vi.setSystemTime(req.expiresAt)

    expect(manager.resolve(req.id, { status: 'approved', scope: 'once' })).toBeUndefined()
    await expect(promise).resolves.toEqual({ status: 'expired' })
  })

  it('atomically expires instead of claiming an approval at its deadline', async () => {
    vi.useFakeTimers()
    const manager = new ApprovalManager({ approvalTimeoutMs: 1_000 })
    const req = makeRequest({ execution: { location: 'renderer', operation: {
      type: 'create-document', title: 'A', content: '', format: 'markdown', reason: ''
    } } })
    const promise = manager.request(req, vi.fn())

    vi.setSystemTime(req.expiresAt)

    expect(() => manager.claim(req.id)).toThrow('审批不存在或已失效')
    await expect(promise).resolves.toEqual({ status: 'expired' })
  })

  it('cancelRun only cancels approvals matching the run id', async () => {
    const manager = new ApprovalManager()
    const reqA = makeRequest({ id: 'a', runId: 'run-1' })
    const reqB = makeRequest({ id: 'b', runId: 'run-2' })

    const promiseA = manager.request(reqA, vi.fn())
    const promiseB = manager.request(reqB, vi.fn())

    manager.cancelRun('run-1')

    await expect(promiseA).resolves.toEqual({ status: 'cancelled' })

    manager.resolve('b', { status: 'approved', scope: 'once' })
    await expect(promiseB).resolves.toEqual({ status: 'approved', scope: 'once' })
  })

  it('does not publish queued approvals while cancelling their run', async () => {
    const manager = new ApprovalManager()
    const published: string[] = []
    const first = manager.request(makeRequest({ id: 'a1' }), (request) =>
      published.push(request.id)
    )
    const second = manager.request(makeRequest({ id: 'a2' }), (request) =>
      published.push(request.id)
    )

    manager.cancelRun('run-1')

    await expect(first).resolves.toEqual({ status: 'cancelled' })
    await expect(second).resolves.toEqual({ status: 'cancelled' })
    expect(published).toEqual(['a1'])
  })

  it('dispose settles all pending approvals as cancelled', async () => {
    const manager = new ApprovalManager()
    const promiseA = manager.request(makeRequest({ id: 'a' }), vi.fn())
    const promiseB = manager.request(makeRequest({ id: 'b' }), vi.fn())

    manager.dispose()

    await expect(promiseA).resolves.toEqual({ status: 'cancelled' })
    await expect(promiseB).resolves.toEqual({ status: 'cancelled' })
  })

  it('publishes only the queue head, then publishes the next approval after settlement', async () => {
    const manager = new ApprovalManager()
    const published: string[] = []

    const first = manager.request(makeRequest({ id: 'a1' }), (req) => published.push(req.id))
    const second = manager.request(makeRequest({ id: 'a2' }), (req) => published.push(req.id))
    manager.request(makeRequest({ id: 'a3' }), (req) => published.push(req.id))

    expect(published).toEqual(['a1'])
    manager.resolve('a1', { status: 'approved', scope: 'once' })
    await first
    expect(published).toEqual(['a1', 'a2'])
    manager.resolve('a2', { status: 'rejected' })
    await second
    expect(published).toEqual(['a1', 'a2', 'a3'])
  })

  it('reports whether an approval was still pending when resolved', () => {
    const manager = new ApprovalManager()
    const req = makeRequest()
    manager.request(req, vi.fn())

    expect(manager.resolve(req.id, { status: 'rejected' })).toBe(req)
    expect(manager.resolve(req.id, { status: 'rejected' })).toBeUndefined()
  })

  it('claims a published pending approval only once without advancing FIFO', () => {
    const manager = new ApprovalManager()
    const published: string[] = []
    const first = makeRequest({ id: 'a1', execution: { location: 'renderer', operation: {
      type: 'create-document', title: 'A', content: '', format: 'markdown', reason: ''
    } } })
    manager.request(first, (request) => published.push(request.id))
    manager.request(makeRequest({ id: 'a2' }), (request) => published.push(request.id))

    expect(manager.claim(first.id)).toBe(first)
    expect(() => manager.claim(first.id)).toThrow('审批已被认领')
    expect(published).toEqual(['a1'])
  })

  it('starts each approval timeout only when that approval is published', async () => {
    vi.useFakeTimers()
    const manager = new ApprovalManager({ approvalTimeoutMs: 1_000 })
    const published: string[] = []
    const first = manager.request(makeRequest({ id: 'a1' }), (req) => published.push(req.id))
    const second = manager.request(makeRequest({ id: 'a2' }), (req) => published.push(req.id))

    await vi.advanceTimersByTimeAsync(1_000)
    await expect(first).resolves.toEqual({ status: 'expired' })
    expect(published).toEqual(['a1', 'a2'])

    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(secondSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(second).resolves.toEqual({ status: 'expired' })
  })
})
