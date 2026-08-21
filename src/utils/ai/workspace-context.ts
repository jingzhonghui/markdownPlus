/**
 * 渲染进程 AI 工作区适配器。
 *
 * 把 Pinia 的 fileStore 与共享的 AI DTO 相互转换：
 * - createExecutionSnapshot：读取当前活动 tab 及其选区，产出 AiExecutionSnapshot。
 * - applyDocumentOperation：把已批准的文档操作应用到 fileStore（含 revision/hash 双重校验）。
 */
import type {
  AiExecutionSnapshot,
  AiSelectionSnapshot,
  ApprovedDocumentOperation,
  ToolExecutionResult,
  WorkspaceFileEntry
} from '../../../shared/ai/types'
import { hashDocumentContent } from './document-revision'
import { useFileStore, type FileTreeNode } from '../../stores/file'

type FileStore = ReturnType<typeof useFileStore>

/**
 * 把归一化的编辑器选区映射为 AI 选区 DTO。
 */
function toAiSelection(sel: { from: number; to: number; cursor: number; text: string }): AiSelectionSnapshot {
  return { text: sel.text, from: sel.from, to: sel.to, cursor: sel.cursor }
}

const PATH_SEP = '/'

function normalizePath(p: string): string {
  return p.replace(/\\/g, PATH_SEP)
}

/**
 * 收集当前工作区可见的文件（已打开标签 + 资源管理器文件树）。
 * 同路径去重，标签页优先标记 isOpen=true。
 * 每个条目携带从工作区根到该文件的父级目录链 (parentDirs)。
 */
function collectWorkspaceFiles(fileStore: FileStore): WorkspaceFileEntry[] {
  const files = new Map<string, WorkspaceFileEntry>()
  const rootPath = fileStore.openedFolderPath

  function makeEntry(name: string, filePath: string, isOpen: boolean): WorkspaceFileEntry {
    const normalizedFile = normalizePath(filePath)
    const lastSep = normalizedFile.lastIndexOf(PATH_SEP)
    const dir = lastSep >= 0 ? normalizedFile.slice(0, lastSep) : ''
    const chain: string[] = []
    if (rootPath) {
      const normalizedRoot = normalizePath(rootPath).replace(/\/$/, '')
      const prefix = normalizedRoot + PATH_SEP
      if (dir.toLowerCase().startsWith(prefix.toLowerCase())) {
        const relative = dir.slice(prefix.length)
        if (relative) {
          chain.push(...relative.split(PATH_SEP).filter((p) => p.length > 0))
        }
      }
    }
    return { name, path: filePath, isOpen, parentDirs: chain }
  }

  for (const tab of fileStore.tabs) {
    const fileInfo = tab.fileInfo
    if (!fileInfo || !fileInfo.path) continue
    const name = fileInfo.name || fileInfo.path
    if (!files.has(fileInfo.path)) {
      files.set(fileInfo.path, makeEntry(name, fileInfo.path, true))
    } else {
      files.get(fileInfo.path)!.isOpen = true
    }
  }

  function visit(nodes: FileTreeNode[], ancestors: string[]): void {
    for (const node of nodes) {
      if (node.isDirectory) {
        // 记录目录节点本身，让 list_workspace_root 能直接列出
        if (!files.has(node.path)) {
          files.set(node.path, {
            name: node.name,
            path: node.path,
            isOpen: false,
            isDirectory: true,
            parentDirs: [...ancestors]
          })
        }
        visit(node.children, [...ancestors, node.name])
        continue
      }
      if (!files.has(node.path)) {
        files.set(node.path, { name: node.name, path: node.path, isOpen: false, parentDirs: [...ancestors] })
      } else if (ancestors.length > 0) {
        files.get(node.path)!.parentDirs = [...ancestors]
      }
    }
  }
  visit(fileStore.fileTree, [])

  return [...files.values()].slice(0, 500)
}

export function createExecutionSnapshot(
  fileStore: FileStore,
  injectedWorkspaceFiles?: WorkspaceFileEntry[]
): AiExecutionSnapshot {
  const tab = fileStore.tabs.find((t) => t.id === fileStore.activeTabId) ?? null

  const workspaceFiles = injectedWorkspaceFiles ?? collectWorkspaceFiles(fileStore)

  if (!tab) {
    return {
      conversationId: '',
      activeDocument: null,
      selection: null,
      cursor: null,
      workspaceFiles
    }
  }

  const sel = fileStore.editorSelection
  const validSelection = sel !== null
    && sel.tabId === tab.id
    && Number.isInteger(sel.from)
    && Number.isInteger(sel.to)
    && Number.isInteger(sel.cursor)
    && sel.from >= 0
    && sel.from <= sel.to
    && sel.to <= tab.content.length
    && sel.cursor >= 0
    && sel.cursor <= tab.content.length
    && tab.content.slice(sel.from, sel.to) === sel.text

  return {
    conversationId: '',
    activeDocument: {
      id: tab.id,
      title: tab.document?.metadata.title || tab.fileInfo?.name || '',
      path: tab.fileInfo?.path ?? null,
      format: tab.fileInfo?.format ?? 'mdx',
      content: tab.content,
      revision: tab.revision,
      contentHash: hashDocumentContent(tab.content),
      modified: tab.fileInfo?.modified ?? false
    },
    selection: validSelection ? toAiSelection(sel) : null,
    cursor: validSelection ? sel.cursor : null,
    workspaceFiles
  }
}

export async function applyDocumentOperation(
  fileStore: FileStore,
  operation: ApprovedDocumentOperation,
  revealDocument?: () => void
): Promise<ToolExecutionResult> {
  switch (operation.type) {
    case 'replace-document':
      return applyReplace(fileStore, operation)
    case 'insert-document':
      return applyInsert(fileStore, operation)
    case 'create-document':
      return applyCreate(fileStore, operation, revealDocument)
  }
}

function findTargetTab(fileStore: FileStore, targetId: string) {
  return fileStore.tabs.find((t) => t.id === targetId) ?? null
}

/**
 * 变更前重新校验目标存在性、revision 与内容哈希。
 * 任一不匹配则视为冲突（文档已被用户改动）。
 */
function checkTargetFresh(
  tab: { revision: number; content: string },
  target: { revision: number; contentHash: string }
): string | null {
  if (tab.revision !== target.revision) return '文档已被修改'
  if (hashDocumentContent(tab.content) !== target.contentHash) return '文档已被修改'
  return null
}

function applyReplace(
  fileStore: FileStore,
  operation: Extract<ApprovedDocumentOperation, { type: 'replace-document' }>
): ToolExecutionResult {
  const tab = findTargetTab(fileStore, operation.target.id)
  if (!tab) {
    return { status: 'conflict', message: '目标文档不存在' }
  }
  const conflict = checkTargetFresh(tab, operation.target)
  if (conflict) {
    return { status: 'conflict', message: conflict }
  }
  fileStore.updateTabContent(tab.id, operation.content)
  return { status: 'applied' }
}

function applyInsert(
  fileStore: FileStore,
  operation: Extract<ApprovedDocumentOperation, { type: 'insert-document' }>
): ToolExecutionResult {
  const tab = findTargetTab(fileStore, operation.target.id)
  if (!tab) {
    return { status: 'conflict', message: '目标文档不存在' }
  }
  const conflict = checkTargetFresh(tab, operation.target)
  if (conflict) {
    return { status: 'conflict', message: conflict }
  }

  const base = tab.content
  let next: string

  switch (operation.position) {
    case 'start':
      next = operation.content + base
      break
    case 'end':
      next = base + operation.content
      break
    case 'selection': {
      const selection = operation.selection
      if (!selection) {
        return { status: 'conflict', message: '选区不可用' }
      }
      next = base.slice(0, selection.from) + operation.content + base.slice(selection.to)
      break
    }
    case 'cursor': {
      const cursor = operation.cursor
      if (cursor === null || cursor === undefined) {
        return { status: 'conflict', message: '光标不可用' }
      }
      next = base.slice(0, cursor) + operation.content + base.slice(cursor)
      break
    }
  }

  fileStore.updateTabContent(tab.id, next)
  return { status: 'applied' }
}

function applyCreate(
  fileStore: FileStore,
  operation: Extract<ApprovedDocumentOperation, { type: 'create-document' }>,
  revealDocument?: () => void
): ToolExecutionResult {
  const tab = fileStore.createGeneratedDocument(operation.title, operation.content, operation.format)
  revealDocument?.()
  return { status: 'applied', data: { tabId: tab.id } }
}
