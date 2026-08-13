import { ref, type Ref } from 'vue'
import type { FileTreeNode, FolderItem, TabInfo } from './types'

export interface FolderDeps {
  tabs: Ref<TabInfo[]>
  activeTabId: Ref<string | null>
  stateVersion: Ref<number>
  editorResetVersion: Ref<number>
  error: Ref<string | null>
  isLoading: Ref<boolean>
  openFile: (filePath?: string) => Promise<boolean>
  persistSession: () => void
}

/**
 * 文件夹浏览 + 文件/文件夹 CRUD（上下文菜单）
 */
export function useFolder(deps: FolderDeps) {
  const { tabs, activeTabId, stateVersion } = deps

  const openedFolderPath = ref<string | null>(null)
  const folderItems = ref<FolderItem[]>([])
  const folderHistory = ref<string[]>([])
  const fileTree = ref<FileTreeNode[]>([])

  async function readFolder(dirPath: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false

      const result = await window.electronAPI.readFolder(dirPath)
      if (result.success && result.data) {
        openedFolderPath.value = dirPath
        folderItems.value = result.data

        // 同步更新 fileTree 根节点的子节点，使侧边栏文件树即时刷新
        if (fileTree.value.length > 0 && fileTree.value[0].path === dirPath) {
          fileTree.value[0].children = result.data.map((item: FolderItem) => ({
            name: item.name,
            path: item.path,
            isDirectory: item.isDirectory,
            isExpanded: false,
            isLoading: false,
            children: []
          }))
        }

        return true
      }
      return false
    } catch (err) {
      deps.error.value = err instanceof Error ? err.message : '读取文件夹失败'
      return false
    }
  }

  async function openFolder(): Promise<boolean> {
    deps.isLoading.value = true
    deps.error.value = null

    try {
      if (!window.electronAPI) {
        deps.error.value = 'Electron API 不可用'
        return false
      }

      const dialogResult = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择文件夹'
      })

      if (!dialogResult.success || !dialogResult.data || dialogResult.data.length === 0) {
        return false
      }

      const dirPath = dialogResult.data[0]
      const success = await readFolder(dirPath)

      // 初始化文件树
      if (success) {
        const folderName = dirPath.split(/[/\\]/).pop() || dirPath
        fileTree.value = [
          {
            name: folderName,
            path: dirPath,
            isDirectory: true,
            isExpanded: true,
            isLoading: false,
            children: folderItems.value.map((item) => ({
              name: item.name,
              path: item.path,
              isDirectory: item.isDirectory,
              isExpanded: false,
              isLoading: false,
              children: []
            }))
          }
        ]
        deps.persistSession()
      }

      return success
    } catch (err) {
      deps.error.value = err instanceof Error ? err.message : '打开文件夹失败'
      return false
    } finally {
      deps.isLoading.value = false
    }
  }

  async function loadChildren(node: FileTreeNode): Promise<void> {
    if (!node.isDirectory || node.isLoading) return

    node.isLoading = true
    try {
      const result = await window.electronAPI?.readFolder(node.path)
      if (result?.success && result.data) {
        node.children = result.data.map((item: FolderItem) => ({
          name: item.name,
          path: item.path,
          isDirectory: item.isDirectory,
          isExpanded: false,
          isLoading: false,
          children: []
        }))
      }
    } catch {
      // 忽略错误
    } finally {
      node.isLoading = false
    }
  }

  async function expandNode(node: FileTreeNode): Promise<void> {
    node.isExpanded = true
    if (node.isDirectory && node.children.length === 0) {
      await loadChildren(node)
    }
  }

  function collapseNode(node: FileTreeNode): void {
    node.isExpanded = false
  }

  async function toggleNode(node: FileTreeNode): Promise<void> {
    if (node.isExpanded) {
      collapseNode(node)
    } else {
      await expandNode(node)
    }
  }

  function closeFolder(): void {
    openedFolderPath.value = null
    folderItems.value = []
    folderHistory.value = []
    fileTree.value = []
    deps.persistSession()
  }

  async function navigateToFolder(dirPath: string): Promise<boolean> {
    return await readFolder(dirPath)
  }

  async function navigateUp(): Promise<boolean> {
    if (!openedFolderPath.value) return false
    const parts = openedFolderPath.value.split(/[/\\]/)
    parts.pop()
    const parentPath = parts.join('/')
    if (!parentPath || parentPath === openedFolderPath.value) return false
    return await readFolder(parentPath)
  }

  /** 展开文件所在的所有父目录，支持按需加载尚未展开的目录。 */
  async function revealFileInTree(filePath: string): Promise<void> {
    const normalize = (value: string): string => value.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
    const target = normalize(filePath)

    async function visit(nodes: FileTreeNode[]): Promise<boolean> {
      for (const node of nodes) {
        const nodePath = normalize(node.path)
        if (!node.isDirectory) {
          if (nodePath === target) return true
          continue
        }

        if (target !== nodePath && !target.startsWith(`${nodePath}/`)) continue
        if (!node.isExpanded || node.children.length === 0) await expandNode(node)
        if (await visit(node.children)) return true
      }
      return false
    }

    await visit(fileTree.value)
  }

  async function createFile(dirPath: string, name: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.createFile(dirPath, name)
      if (result.success && result.data?.path) {
        await readFolder(openedFolderPath.value!)
        return await deps.openFile(result.data.path)
      }
      return false
    } catch {
      return false
    }
  }

  async function createFolder(parentPath: string, name: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.createFolder(parentPath, name)
      if (result.success) {
        await readFolder(openedFolderPath.value!)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function renameItem(oldPath: string, newName: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.renameFile(oldPath, newName)
      if (result.success) {
        // 更新所有匹配的 tab 中的 fileInfo
        for (const tab of tabs.value) {
          if (tab.fileInfo?.path === oldPath) {
            tab.fileInfo.path = result.data!.path
            tab.fileInfo.name = newName
          }
        }
        await readFolder(openedFolderPath.value!)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function deleteItem(targetPath: string): Promise<boolean> {
    try {
      if (!window.electronAPI) return false
      const result = await window.electronAPI.deleteFile(targetPath)
      if (result.success) {
        // 一次性移除匹配的 tab，避免编辑器收到删除过程中的中间状态
        const activeIndex = tabs.value.findIndex((tab) => tab.id === activeTabId.value)
        const matchingTabs = tabs.value.filter((tab) => tab.fileInfo?.path === targetPath)
        const matchingIds = new Set(matchingTabs.map((tab) => tab.id))
        const activeTabDeleted = matchingIds.has(activeTabId.value || '')

        if (matchingIds.size > 0) {
          tabs.value = tabs.value.filter((tab) => !matchingIds.has(tab.id))

          if (activeTabDeleted) {
            const nextIndex = activeIndex >= 0 ? Math.min(activeIndex, tabs.value.length - 1) : 0
            activeTabId.value = tabs.value[nextIndex]?.id ?? null
            deps.editorResetVersion.value++
          }
          stateVersion.value++
          deps.persistSession()
        }

        await readFolder(openedFolderPath.value!)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  function copyPath(filePath: string): void {
    try {
      navigator.clipboard.writeText(filePath)
    } catch {
      // 忽略
    }
  }

  return {
    openedFolderPath,
    folderItems,
    fileTree,
    openFolder,
    readFolder,
    loadChildren,
    expandNode,
    collapseNode,
    toggleNode,
    closeFolder,
    navigateToFolder,
    navigateUp,
    revealFileInTree,
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    copyPath
  }
}
