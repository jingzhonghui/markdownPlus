import { z } from 'zod'
import type {
  AiExecutionSnapshot,
  ApprovalPreview,
  ApprovedDocumentOperation,
  ToolPolicy,
  ToolExecutionResult
} from '../../shared/ai/types'
import type { ProviderTool } from './provider'
import type { SourceAuthorizationContext } from './source-authorization'

export interface ToolExecutionContext {
  readonly snapshot: AiExecutionSnapshot
  readonly sourceAuthorization: SourceAuthorizationContext
  readonly abortSignal?: AbortSignal
}

export interface ToolDefinitionBase<TInput> {
  name: string
  description: string
  inputSchema: z.ZodType
  policy: ToolPolicy

  createApprovalPreview?: (input: TInput, context: ToolExecutionContext) => Promise<ApprovalPreview>
}

export type ToolDefinition<TInput, TResult> =
  | (ToolDefinitionBase<TInput> & {
      execution: 'main'
      execute(input: TInput, context: ToolExecutionContext): Promise<TResult>
    })
  | (ToolDefinitionBase<TInput> & {
      execution: 'renderer'
      createRendererOperation(
        input: TInput,
        context: ToolExecutionContext
      ): Promise<ApprovedDocumentOperation>
    })

export function defineTool<TInput, TResult>(
  def: ToolDefinition<TInput, TResult>
): ToolDefinition<TInput, TResult> {
  return def
}

type AnyToolDefinition = ToolDefinition<unknown, unknown>

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>()

  register<TInput, TResult>(def: ToolDefinition<TInput, TResult>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`工具已注册：${def.name}`)
    }
    this.tools.set(def.name, def as AnyToolDefinition)
  }

  all(): AnyToolDefinition[] {
    return [...this.tools.values()]
  }

  toProviderTools(context: ToolExecutionContext): Record<string, ProviderTool> {
    const result: Record<string, ProviderTool> = {}
    for (const def of this.tools.values()) {
      result[def.name] = {
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input: unknown): Promise<ToolExecutionResult> => {
          const parsed = def.inputSchema.safeParse(input)
          if (!parsed.success) {
            return { status: 'failed', message: `工具输入无效：${parsed.error.message}` }
          }
          if (def.execution === 'main') {
            const data = await def.execute(parsed.data, context)
            return { status: 'completed', data }
          }
          const operation = await def.createRendererOperation(parsed.data, context)
          return { status: 'completed', data: operation }
        }
      }
    }
    return result
  }
}
