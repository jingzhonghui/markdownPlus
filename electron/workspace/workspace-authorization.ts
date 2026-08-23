import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 主进程维护每个 sender 获授权的工作区根目录。
 *
 * 授权仅在用户通过文件夹选择、恢复会话或拖放打开工作区时建立；
 * AI 运行声明的工作区根必须与授权根完全一致，否则视为未授权。
 */

const authorizedRoots = new Map<number, string>()

export interface WorkspaceAuthorizationDeps {
  realpathSync: (p: string) => string
}

function defaultDeps(): WorkspaceAuthorizationDeps {
  return { realpathSync: fs.realpathSync }
}

export function authorizeWorkspaceRoot(
  senderId: number,
  root: string | null,
  deps: WorkspaceAuthorizationDeps = defaultDeps()
): void {
  if (!root) {
    authorizedRoots.delete(senderId)
    return
  }
  try {
    const real = deps.realpathSync(root)
    const stat = fs.statSync(real)
    if (!stat.isDirectory()) {
      authorizedRoots.delete(senderId)
      return
    }
    authorizedRoots.set(senderId, real)
  } catch {
    authorizedRoots.delete(senderId)
  }
}

export function getAuthorizedWorkspaceRoot(senderId: number): string | null {
  return authorizedRoots.get(senderId) ?? null
}

export function revokeSenderWorkspace(senderId: number): void {
  authorizedRoots.delete(senderId)
}

/** 判断候选绝对路径是否位于授权根目录之内（含根本身）。不做磁盘访问。 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root).replace(/[\\/]+$/, '')
  const normalized = path.resolve(candidate)
  if (normalized === normalizedRoot) return true
  const prefix = normalizedRoot + path.sep
  return normalized.toLowerCase().startsWith(prefix.toLowerCase())
}
