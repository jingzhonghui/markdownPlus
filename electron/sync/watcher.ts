import chokidar from 'chokidar'

export interface WorkspaceWatcherHandle {
  dispose(): void
}

const DEFAULT_DEBOUNCE_MS = 2000

/**
 * 监听工作区文件变化，防抖合并后一次性回调变更文件绝对路径。
 * 忽略 .git / .markdownPlus / node_modules。
 */
export function createWorkspaceWatcher(
  workspacePath: string,
  onChanges: (files: string[]) => void,
  options?: { debounceMs?: number }
): WorkspaceWatcherHandle {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const root = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = new Set<string>()

  const fire = (): void => {
    timer = null
    if (pending.size === 0) return
    const files = [...pending]
    pending = new Set()
    onChanges(files)
  }

  const watcher = chokidar.watch(workspacePath, {
    ignoreInitial: true,
    depth: 20,
    ignored: (p: string): boolean => {
      const normalized = p.replace(/\\/g, '/')
      if (normalized === root) return false
      return /[\\/](\.git|\.markdownPlus|node_modules)([\\/]|$)/.test(normalized)
    }
  })

  watcher.on('all', (_event, filePath) => {
    pending.add(String(filePath))
    if (timer) clearTimeout(timer)
    timer = setTimeout(fire, debounceMs)
  })

  return {
    dispose: (): void => {
      if (timer) clearTimeout(timer)
      timer = null
      void watcher.close()
    }
  }
}
