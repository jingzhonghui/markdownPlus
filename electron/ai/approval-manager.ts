import type { ApprovalDecision, ToolApprovalRequest } from '../../shared/ai/types'

interface PendingApproval {
  request: ToolApprovalRequest
  resolve: (decision: ApprovalDecision) => void
  timer?: ReturnType<typeof setTimeout>
  onPublish: (request: ToolApprovalRequest) => void
  claimed: boolean
}

export interface ApprovalManagerOptions {
  approvalTimeoutMs?: number
}

export class ApprovalManager {
  private readonly pending = new Map<string, PendingApproval>()
  private readonly queue: string[] = []
  private readonly approvalTimeoutMs: number

  constructor(options: ApprovalManagerOptions = {}) {
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 300_000
  }

  request(
    request: ToolApprovalRequest,
    onPublish: (req: ToolApprovalRequest) => void
  ): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      const pending: PendingApproval = {
        request,
        resolve,
        onPublish,
        timer: undefined,
        claimed: false
      }
      this.pending.set(request.id, pending)
      this.queue.push(request.id)
      if (this.queue.length === 1) {
        this.publish(pending)
      }
    })
  }

  get(id: string): ToolApprovalRequest | undefined {
    return this.pending.get(id)?.request
  }

  resolve(id: string, decision: ApprovalDecision): ToolApprovalRequest | undefined {
    const pending = this.pending.get(id)
    if (pending?.timer && pending.request.expiresAt <= Date.now()) {
      this.settle(id, { status: 'expired' })
      return undefined
    }
    return this.settle(id, decision)
  }

  claim(id: string): ToolApprovalRequest {
    const pending = this.pending.get(id)
    if (!pending || !pending.timer) {
      throw new Error('审批不存在或已失效')
    }
    if (pending.request.expiresAt <= Date.now()) {
      this.settle(id, { status: 'expired' })
      throw new Error('审批不存在或已失效')
    }
    if (pending.claimed) throw new Error('审批已被认领')
    pending.claimed = true
    return pending.request
  }

  isClaimed(id: string): boolean {
    return this.pending.get(id)?.claimed === true
  }

  cancelRun(runId: string): void {
    for (const pending of [...this.pending.values()]) {
      if (pending.request.runId === runId) {
        this.settle(pending.request.id, { status: 'cancelled' }, false)
      }
    }
    const next = this.queue[0]
    if (next) {
      const nextPending = this.pending.get(next)
      if (nextPending && !nextPending.timer) this.publish(nextPending)
    }
  }

  dispose(): void {
    for (const pending of [...this.pending.values()]) {
      this.settle(pending.request.id, { status: 'cancelled' }, false)
    }
  }

  private settle(
    id: string,
    decision: ApprovalDecision,
    publishNext = true
  ): ToolApprovalRequest | undefined {
    const pending = this.pending.get(id)
    if (!pending) return undefined

    this.pending.delete(id)
    const index = this.queue.indexOf(id)
    if (index !== -1) {
      this.queue.splice(index, 1)
    }
    if (pending.timer) clearTimeout(pending.timer)
    pending.resolve(decision)
    if (publishNext && index === 0) {
      const next = this.queue[0]
      if (next) {
        const nextPending = this.pending.get(next)
        if (nextPending) this.publish(nextPending)
      }
    }
    return pending.request
  }

  private publish(pending: PendingApproval): void {
    pending.request.expiresAt = Date.now() + this.approvalTimeoutMs
    pending.timer = setTimeout(() => {
      this.settle(pending.request.id, { status: 'expired' })
    }, this.approvalTimeoutMs)
    pending.onPublish(pending.request)
  }
}
