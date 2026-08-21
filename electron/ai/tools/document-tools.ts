import * as path from 'node:path'
import { z } from 'zod'
import type { AiDocumentSnapshot, AiSelectionSnapshot, LocalFileReadResult } from '../../../shared/ai/types'
import type { SourceAccessService } from '../source-access-service'
import { defineTool, type ToolDefinition } from '../tool-registry'

function applyInsert(
  base: string,
  text: string,
  position: 'selection' | 'cursor' | 'start' | 'end',
  selection: AiSelectionSnapshot | null,
  cursor: number | null
): string {
  switch (position) {
    case 'start':
      return text + base
    case 'end':
      return base + text
    case 'selection':
      if (!selection) return base + text
      return base.slice(0, selection.from) + text + base.slice(selection.to)
    case 'cursor': {
      const at = cursor ?? base.length
      return base.slice(0, at) + text + base.slice(at)
    }
  }
}

function describeTarget(doc: AiDocumentSnapshot | null): AiDocumentSnapshot {
  if (!doc) {
    throw new Error('当前没有活动文档')
  }
  return doc
}

function isSameWorkspacePath(left: string, right: string): boolean {
  const normalize = (value: string): string => path.resolve(value).replace(/[\\/]+$/, '')
  return process.platform === 'win32'
    ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right)
}

const SEARCH_RESULT_LIMIT = 50

export interface DocumentToolRegistry {
  searchWorkspaceFiles: ToolDefinition<{ query: string }, unknown>
  listWorkspaceRoot: ToolDefinition<Record<string, never>, unknown>
  readWorkspaceDirectory: ToolDefinition<{ path: string }, unknown>
  readWorkspaceFile: ToolDefinition<{ path: string }, LocalFileReadResult>
  readSelectedText: ToolDefinition<Record<string, never>, unknown>
  replaceCurrentDocument: ToolDefinition<unknown, unknown>
  insertIntoCurrentDocument: ToolDefinition<unknown, unknown>
  createDocument: ToolDefinition<unknown, unknown>
}

export function createDocumentTools(sourceAccessService: SourceAccessService): DocumentToolRegistry {
  const searchWorkspaceFiles = defineTool<{ query: string }, unknown>({
    name: 'search_workspace_files',
    description: '按关键词搜索当前工作区中的文件和文件夹。搜索范围包括文件名和所属目录名（例如搜索"工作"可匹配"工作"文件夹下的所有文件，即使文件名不含"工作"）。返回匹配的文件列表及其目录链，未匹配时返回空列表。',
    inputSchema: z.object({ query: z.string().trim().min(1) }),
    policy: {
      effect: 'read',
      approval: 'never',
      riskLevel: 'low',
      supportsRememberDecision: false
    },
    execution: 'main',
    execute: async (input, context) => {
      const files = context.snapshot.workspaceFiles ?? []
      const query = input.query.toLowerCase()
      const matches = files
        .filter((file) => {
          if (file.isDirectory) return false
          if (file.name.toLowerCase().includes(query)) return true
          if (file.parentDirs.some((dir) => dir.toLowerCase().includes(query))) return true
          return false
        })
        .slice(0, SEARCH_RESULT_LIMIT)
      const matchedDirs = [...new Set(matches.flatMap((f) => f.parentDirs))].filter((dir) =>
        dir.toLowerCase().includes(query)
      )
      return { query: input.query, matches, total: matches.length, matchedDirs }
    }
  })

  const listWorkspaceRoot = defineTool({
    name: 'list_workspace_root',
    description:
      '列出当前工作区根目录下的所有顶级文件和文件夹。用于了解工作区的整体结构，然后可调用 read_workspace_directory 深入浏览目录、调用 read_workspace_file 读取具体文件内容。',
    inputSchema: z.object({}),
    policy: {
      effect: 'read',
      approval: 'never',
      riskLevel: 'low',
      supportsRememberDecision: false
    },
    execution: 'main',
    execute: async (_input, context) => {
      const files = context.snapshot.workspaceFiles ?? []
      if (files.length === 0) {
        return { isEmpty: true, topLevelFiles: [], topLevelDirectories: [] }
      }

      const normalizedFilePaths = files.map((f) => ({
        ...f,
        normalized: f.path.replace(/\\/g, '/')
      }))

      // 找到公共根路径（所有条目的最长公共前缀目录）
      const firstPath = normalizedFilePaths[0].normalized
      const firstEntry = normalizedFilePaths[0]
      const firstDir = firstEntry.isDirectory
        ? firstPath
        : (firstPath.lastIndexOf('/') >= 0 ? firstPath.slice(0, firstPath.lastIndexOf('/')) : '')
      let commonRoot = firstDir ? '' : ''

      if (firstDir) {
        const parts = firstDir.split('/')
        for (let i = 0; i < parts.length; i++) {
          const candidate = parts.slice(0, i + 1).join('/')
          if (normalizedFilePaths.every((f) => f.normalized.startsWith(candidate + '/'))) {
            commonRoot = candidate
          } else {
            break
          }
        }
      }

      // 分类顶级文件和目录
      const prefix = commonRoot ? commonRoot + '/' : ''
      const topLevelFiles: { name: string; path: string; isOpen: boolean }[] = []
      const dirSet = new Map<
        string,
        { name: string; fileCount: number; samplePath: string }
      >()

      for (const file of normalizedFilePaths) {
        // 目录条目直接按名称归入目录集
        if (file.isDirectory) {
          const relative = commonRoot
            ? file.normalized.slice(prefix.length)
            : file.normalized
          if (!relative.includes('/') && !dirSet.has(file.name)) {
            dirSet.set(file.name, { name: file.name, fileCount: 0, samplePath: file.path })
          }
          continue
        }

        const relative = commonRoot
          ? file.normalized.slice(prefix.length)
          : file.normalized
        const firstSlash = relative.indexOf('/')
        if (firstSlash < 0) {
          topLevelFiles.push({ name: file.name, path: file.path, isOpen: file.isOpen })
        } else {
          const dirName = relative.slice(0, firstSlash)
          if (!dirSet.has(dirName)) {
            dirSet.set(dirName, { name: dirName, fileCount: 0, samplePath: commonRoot + '/' + dirName })
          }
          dirSet.get(dirName)!.fileCount += 1
        }
      }

      return {
        rootPath: commonRoot || null,
        topLevelFiles,
        topLevelDirectories: [...dirSet.values()],
        totalFiles: normalizedFilePaths.filter((f) => !f.isDirectory).length
      }
    }
  })

  const readWorkspaceFile = defineTool<{ path: string }, LocalFileReadResult>({
    name: 'read_workspace_file',
    description: '读取工作区中指定路径的文件内容（支持 Markdown、MDX、文本），路径需来自 search_workspace_files 或 read_workspace_directory 的结果。',
    inputSchema: z.object({ path: z.string().trim().min(1) }),
    policy: {
      effect: 'read',
      approval: 'never',
      riskLevel: 'low',
      supportsRememberDecision: false
    },
    execution: 'main',
    execute: async (input, context) => {
      const files = context.snapshot.workspaceFiles ?? []
      const target = files.find((file) => !file.isDirectory && isSameWorkspacePath(file.path, input.path))
      if (!target) {
        throw new Error('文件不在当前工作区中，请先调用 search_workspace_files 获取可用文件')
      }
      const signal = context.abortSignal
      if (!signal) throw new Error('工作区文件读取缺少中止信号')
      if (signal.aborted) throw new Error('工作区文件读取已中止')
      return sourceAccessService.readLocalFile(target.path, signal)
    }
  })

  const readWorkspaceDirectory = defineTool<{ path: string }, unknown>({
    name: 'read_workspace_directory',
    description:
      '列出工作区中指定目录下的直接子文件和子文件夹。path 参数为目录的完整路径（可从 search_workspace_files 返回的文件路径中提取其所在目录）。用于逐层展开目录结构。',
    inputSchema: z.object({ path: z.string().trim().min(1) }),
    policy: {
      effect: 'read',
      approval: 'never',
      riskLevel: 'low',
      supportsRememberDecision: false
    },
    execution: 'main',
    execute: async (input, context) => {
      const files = context.snapshot.workspaceFiles ?? []
      const dirPath = input.path.replace(/\\/g, '/').replace(/\/$/, '')
      const prefix = dirPath + '/'

      const children = files.filter((file) => {
        const normalized = file.path.replace(/\\/g, '/')
        return normalized.toLowerCase().startsWith(prefix.toLowerCase())
      })

      const directFiles = children
        .filter((file) => {
          if (file.isDirectory) return false
          const normalized = file.path.replace(/\\/g, '/')
          const relative = normalized.slice(prefix.length)
          return !relative.includes('/')
        })
        .map((file) => ({ name: file.name, path: file.path, isOpen: file.isOpen }))

      // 目录条目直接作为子目录
      const directDirsFromEntries = children
        .filter((file) => file.isDirectory)
        .map((file) => file.name)

      const subDirs = [
        ...new Set([
          ...directDirsFromEntries,
          ...children
            .filter((file) => !file.isDirectory)
            .map((file) => {
              const normalized = file.path.replace(/\\/g, '/')
              const relative = normalized.slice(prefix.length)
              const slashIndex = relative.indexOf('/')
              return slashIndex > 0 ? relative.slice(0, slashIndex) : null
            })
            .filter((d): d is string => d !== null)
        ])
      ]

      return {
        path: dirPath,
        files: directFiles,
        subDirectories: subDirs,
        totalFiles: directFiles.length,
        isEmpty: children.length === 0
      }
    }
  })

  const readSelectedText = defineTool({
    name: 'read_selected_text',
    description: '读取发送消息时的当前选区（选中文本和偏移）。',
    inputSchema: z.object({}),
    policy: {
      effect: 'read',
      approval: 'never',
      riskLevel: 'low',
      supportsRememberDecision: false
    },
    execution: 'main',
    execute: async (_input, context) => {
      const doc = context.snapshot.activeDocument
      const selection = context.snapshot.selection
      if (!doc || !selection) {
        return { available: false as const }
      }
      return {
        available: true as const,
        documentId: doc.id,
        text: selection.text,
        from: selection.from,
        to: selection.to
      }
    }
  })

  const replaceCurrentDocument = defineTool({
    name: 'replace_current_document',
    description: '替换当前文档的完整内容。执行前需要用户批准。',
    inputSchema: z.object({ content: z.string(), reason: z.string() }),
    policy: {
      effect: 'write',
      approval: 'always',
      riskLevel: 'high',
      supportsRememberDecision: false
    },
    execution: 'renderer',
    createRendererOperation: async (input, context) => {
      const { content, reason } = input as { content: string; reason: string }
      return {
        type: 'replace-document' as const,
        target: describeTarget(context.snapshot.activeDocument),
        content,
        reason
      }
    },
    createApprovalPreview: async (input, context) => {
      const { content } = input as { content: string }
      const doc = describeTarget(context.snapshot.activeDocument)
      return {
        type: 'markdown-diff' as const,
        title: doc.title,
        before: doc.content,
        after: content
      }
    }
  })

  const insertIntoCurrentDocument = defineTool({
    name: 'insert_into_current_document',
    description: '在指定位置（选区/光标/开头/结尾）插入内容。执行前需要用户批准。',
    inputSchema: z.object({
      content: z.string(),
      position: z.enum(['selection', 'cursor', 'start', 'end']),
      reason: z.string()
    }),
    policy: {
      effect: 'write',
      approval: 'always',
      riskLevel: 'high',
      supportsRememberDecision: false
    },
    execution: 'renderer',
    createRendererOperation: async (input, context) => {
      const { content, position, reason } = input as {
        content: string
        position: 'selection' | 'cursor' | 'start' | 'end'
        reason: string
      }
      return {
        type: 'insert-document' as const,
        target: describeTarget(context.snapshot.activeDocument),
        content,
        position,
        selection: context.snapshot.selection,
        cursor: context.snapshot.cursor,
        reason
      }
    },
    createApprovalPreview: async (input, context) => {
      const { content, position } = input as {
        content: string
        position: 'selection' | 'cursor' | 'start' | 'end'
      }
      const doc = describeTarget(context.snapshot.activeDocument)
      const after = applyInsert(
        doc.content,
        content,
        position,
        context.snapshot.selection,
        context.snapshot.cursor
      )
      return {
        type: 'markdown-diff' as const,
        title: doc.title,
        before: doc.content,
        after
      }
    }
  })

  const createDocument = defineTool({
    name: 'create_document',
    description: '创建一篇新的 Markdown/MDX 文档。执行前需要用户批准。',
    inputSchema: z.object({
      title: z.string(),
      content: z.string(),
      format: z.enum(['markdown', 'mdx']),
      reason: z.string()
    }),
    policy: {
      effect: 'write',
      approval: 'always',
      riskLevel: 'medium',
      supportsRememberDecision: false
    },
    execution: 'renderer',
    createRendererOperation: async (input) => {
      const { title, content, format, reason } = input as {
        title: string
        content: string
        format: 'markdown' | 'mdx'
        reason: string
      }
      return {
        type: 'create-document' as const,
        title,
        content,
        format,
        reason
      }
    },
    createApprovalPreview: async (input) => {
      const { title, content } = input as { title: string; content: string }
      return { type: 'document' as const, title, content }
    }
  })

  return {
    searchWorkspaceFiles,
    listWorkspaceRoot,
    readWorkspaceDirectory,
    readWorkspaceFile,
    readSelectedText,
    replaceCurrentDocument,
    insertIntoCurrentDocument,
    createDocument
  }
}
