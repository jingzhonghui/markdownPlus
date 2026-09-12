import { ref, type Ref } from 'vue'
import { dedupeTopLevelPaths } from '../../../shared/fs/dedupe'
import { requestFileConflictAction } from '../../utils/file-conflict'
import type { FileTreeNode, TabInfo } from './types'

export type ClipboardMode = 'copy' | 'cut'

export interface ClipboardDeps {
  tabs: Ref<TabInfo[]>
  selectedPaths: Ref<string[]>
  openedFolderPath: Ref<string | null>
  fileTree: Ref<FileTreeNode[]>
  error: Ref<string | null>
  stateVersion: Ref<number>
  readFolder: (dirPath: string) => Promise<boolean>
  persistSession: () => void
}

function normalizePath(value: string): string {
  return value.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
}

function samePathSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((item) => setB.has(item))
}

export function useClipboard(deps: ClipboardDeps) {
  const clipboardFiles = ref<{ paths: string[]; mode: ClipboardMode } | null>(null)
  const hasSystemClipboardFiles = ref(false)

  function findNode(nodes: FileTreeNode[], targetPath: string): FileTreeNode | null {
    for (const node of nodes) {
      if (node.path === targetPath) return node
      if (node.isDirectory) {
        const found = findNode(node.children, targetPath)
        if (found) return found
      }
    }
    return null
  }

  function resolvePasteTargetDir(): string | null {
    const selected = deps.selectedPaths.value
    if (selected.length === 1) {
      const node = findNode(deps.fileTree.value, selected[0])
      if (node) {
        if (node.isDirectory) return node.path
        const normalized = normalizePath(node.path)
        const index = normalized.lastIndexOf('/')
        return index === -1 ? deps.openedFolderPath.value : node.path.slice(0, index)
      }
    }
    return deps.openedFolderPath.value
  }

  async function refreshClipboardState(): Promise<void> {
    const result = await window.electronAPI?.readClipboardFilePaths()
    hasSystemClipboardFiles.value = result?.success === true && (result.data?.length ?? 0) > 0
  }

  async function copySelection(mode: ClipboardMode): Promise<boolean> {
    const paths = dedupeTopLevelPaths([...deps.selectedPaths.value])
    if (paths.length === 0) return false
    clipboardFiles.value = { paths, mode }
    await window.electronAPI?.writeClipboardFilePaths(paths, mode)
    await refreshClipboardState()
    return true
  }

  function updateTabPathsAfterMove(items: Array<{ source: string; target: string }>): void {
    for (const { source, target } of items) {
      const normalizedSource = normalizePath(source)
      for (const tab of deps.tabs.value) {
        const info = tab.fileInfo
        if (!info) continue
        const normalizedTab = normalizePath(info.path)
        if (normalizedTab === normalizedSource) {
          info.path = target
          info.name = target.split(/[\\/]/).pop() || info.name
        } else if (normalizedTab.startsWith(`${normalizedSource}/`)) {
          info.path = target + info.path.slice(source.length)
        }
      }
    }
    if (items.length > 0) deps.stateVersion.value++
  }

  async function pasteInto(targetDir: string): Promise<boolean> {
    if (!window.electronAPI) return false

    // 以系统剪贴板为准：只有当它与内部剪贴板一致时，才沿用内部的剪切/复制语义；
    // 否则视为外部复制，按复制处理。避免应用内复制后，外部复制的文件被内部剪贴板遮蔽。
    const systemResult = await window.electronAPI.readClipboardFilePaths()
    const systemPaths = systemResult.success && systemResult.data ? systemResult.data : []
    const internal = clipboardFiles.value

    let sources: string[]
    let mode: ClipboardMode
    if (internal && internal.paths.length > 0 && samePathSet(internal.paths, systemPaths)) {
      // 展开为普通数组：clipboardFiles 是响应式代理，直接传入 IPC 会因结构化克隆失败而抛错
      sources = [...internal.paths]
      mode = internal.mode
    } else if (systemPaths.length > 0) {
      sources = [...systemPaths]
      mode = 'copy'
    } else if (internal && internal.paths.length > 0) {
      // 系统剪贴板不可读时回退到内部剪贴板
      sources = [...internal.paths]
      mode = internal.mode
    } else {
      return false
    }

    let result = await window.electronAPI.copyIntoFolder(sources, targetDir, mode)
    if (result.success && result.data?.needsResolution && result.data.sources && result.data.conflicts) {
      const conflictAction = await requestFileConflictAction(result.data.conflicts)
      if (!conflictAction) return false
      result = await window.electronAPI.copyIntoFolder(result.data.sources, targetDir, mode, conflictAction)
    }
    if (!result.success) {
      deps.error.value = result.error || '粘贴失败'
      return false
    }
    const failed = result.data?.failed ?? []
    if (failed.length > 0) {
      deps.error.value = `粘贴完成：失败 ${failed.length} 个（${failed[0].error}）`
    }

    if (mode === 'cut') {
      updateTabPathsAfterMove(result.data?.items ?? [])
      clipboardFiles.value = null
    }

    if (deps.openedFolderPath.value) {
      await deps.readFolder(deps.openedFolderPath.value)
    }
    deps.persistSession()
    await refreshClipboardState()
    return true
  }

  async function pasteIntoSelection(): Promise<boolean> {
    const targetDir = resolvePasteTargetDir()
    if (!targetDir) return false
    return pasteInto(targetDir)
  }

  return {
    clipboardFiles,
    hasSystemClipboardFiles,
    resolvePasteTargetDir,
    refreshClipboardState,
    copySelection,
    pasteIntoSelection,
    pasteInto
  }
}
