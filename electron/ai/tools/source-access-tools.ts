import { z } from 'zod'
import type { LocalFileReadResult, WebSourceReadResult } from '../../../shared/ai/types'
import { SourceAccessError, type SourceAccessService, type SourceFileInspection } from '../source-access-service'
import { normalizeAuthorizedWebUrl, normalizeAuthorizedLocalPath } from '../source-authorization'
import { defineTool, type ToolDefinition, type ToolExecutionContext } from '../tool-registry'

interface WebInput {
  url: string
  reason: string
}

interface LocalInput {
  path: string
  reason: string
}

export interface SourceAccessToolRegistry {
  readWebUrl: ToolDefinition<WebInput, WebSourceReadResult>
  readLocalFile: ToolDefinition<LocalInput, LocalFileReadResult>
}

function requireSignal(context: ToolExecutionContext): AbortSignal {
  const signal = context.abortSignal
  if (!signal) throw new SourceAccessError('SOURCE_INVALID', '来源读取缺少中止信号')
  if (signal.aborted) throw new SourceAccessError('SOURCE_INVALID', '来源读取已中止')
  return signal
}

export function createSourceAccessTools(service: SourceAccessService): SourceAccessToolRegistry {
  const approvedInspections = new WeakMap<ToolExecutionContext, SourceFileInspection>()
  const readWebUrl = defineTool<WebInput, WebSourceReadResult>({
    name: 'read_web_url',
    description: '在用户逐次批准后读取其消息中明确提供的 HTTPS 网页。',
    inputSchema: z.object({ url: z.string().min(1), reason: z.string().trim().min(1) }),
    policy: { effect: 'network', approval: 'always', riskLevel: 'medium', supportsRememberDecision: false },
    execution: 'main',
    createApprovalPreview: async (input, _context) => {
      const url = normalizeAuthorizedWebUrl(input.url)
      if (!url) throw new SourceAccessError('SOURCE_INVALID', '来源 URL 格式无效')
      return { type: 'network-request', method: 'GET', url, reason: input.reason }
    },
    execute: async (input, context) => {
      const url = normalizeAuthorizedWebUrl(input.url)
      if (!url) throw new SourceAccessError('SOURCE_INVALID', '来源 URL 格式无效')
      return service.readWebUrl(url, requireSignal(context))
    }
  })

  const readLocalFile = defineTool<LocalInput, LocalFileReadResult>({
    name: 'read_local_file',
    description: '在用户逐次批准后读取其消息中明确提供的本地 PDF、Markdown、MDX 或文本文件。',
    inputSchema: z.object({ path: z.string().min(1), reason: z.string().trim().min(1) }),
    policy: { effect: 'read', approval: 'always', riskLevel: 'medium', supportsRememberDecision: false },
    execution: 'main',
    createApprovalPreview: async (input, context) => {
      const normalizedPath = normalizeAuthorizedLocalPath(input.path)
      if (!normalizedPath) throw new SourceAccessError('SOURCE_INVALID', '来源文件路径格式无效')
      const inspection = await service.inspectLocalFile(normalizedPath)
      approvedInspections.set(context, inspection)
      return {
        type: 'local-file-read',
        requestedPath: input.path,
        normalizedPath: inspection.normalizedPath,
        fileType: inspection.fileType,
        size: inspection.size,
        reason: input.reason
      }
    },
    execute: async (input, context) => {
      const normalizedPath = normalizeAuthorizedLocalPath(input.path)
      if (!normalizedPath) throw new SourceAccessError('SOURCE_INVALID', '来源文件路径格式无效')
      const signal = requireSignal(context)
      const inspection = approvedInspections.get(context)
      if (!inspection) throw new SourceAccessError('SOURCE_POLICY_BLOCKED', '来源文件缺少获批时的身份快照')
      approvedInspections.delete(context)
      return service.readLocalFile(normalizedPath, signal, inspection)
    }
  })

  return { readWebUrl, readLocalFile }
}
