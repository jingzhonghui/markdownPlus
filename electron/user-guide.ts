import * as fs from 'fs'
import * as path from 'path'
import { app, shell } from 'electron'

const USER_GUIDE_FILE_NAME = 'Markdown+ 使用教程.pdf'

export interface UserGuideDependencies {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  existsSync: (filePath: string) => boolean
  openPath: (filePath: string) => Promise<string>
}

export type UserGuideOpenResult =
  | { success: true }
  | { success: false; error: string }

function defaultDependencies(): UserGuideDependencies {
  return {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    existsSync: fs.existsSync,
    openPath: shell.openPath
  }
}

export function resolveUserGuidePath(dependencies: UserGuideDependencies = defaultDependencies()): string {
  if (dependencies.isPackaged) {
    return path.join(dependencies.resourcesPath, 'user-guide', USER_GUIDE_FILE_NAME)
  }

  return path.join(dependencies.appPath, 'resources', USER_GUIDE_FILE_NAME)
}

export async function openUserGuide(
  dependencies: UserGuideDependencies = defaultDependencies()
): Promise<UserGuideOpenResult> {
  const guidePath = resolveUserGuidePath(dependencies)
  if (!dependencies.existsSync(guidePath)) {
    return { success: false, error: '内置使用教程不存在，请重新安装 Markdown+。' }
  }

  try {
    const openError = await dependencies.openPath(guidePath)
    if (openError) {
      return { success: false, error: `无法打开使用教程：${openError}` }
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    return { success: false, error: `无法打开使用教程：${details}` }
  }

  return { success: true }
}
