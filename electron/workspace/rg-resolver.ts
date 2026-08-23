import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { app } from 'electron'

/**
 * 定位 ripgrep 二进制，优先级从高到低：
 * 1. `MARKDOWN_PLUS_RG_PATH` 环境变量覆盖（仅测试/调试）。
 * 2. 随应用打包的固定版本二进制：
 *    - 打包环境：`<resourcesPath>/rg/rg(.exe)`（electron-builder extraResources）。
 *    - 开发环境：`<appPath>/resources/rg/<platform>-<arch>/rg(.exe)`。
 * 3. 系统 PATH 中的 rg（仅作为开发机兜底，打包后优先使用内置二进制）。
 */
export interface RgResolverDeps {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  platform: NodeJS.Platform
  arch: string
  existsSync: (filePath: string) => boolean
  env: NodeJS.ProcessEnv
  findOnPath: (binary: string) => string | null
}

export function defaultRgResolverDeps(): RgResolverDeps {
  return {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    arch: process.arch,
    existsSync: fs.existsSync,
    env: process.env,
    findOnPath: findRgOnPath
  }
}

/** 在系统 PATH 中查找 rg（win32 使用 where.exe，其他平台使用 which）。 */
function findRgOnPath(binary: string): string | null {
  try {
    const result = execFileSync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      [binary],
      { windowsHide: true, encoding: 'utf8' }
    )
    const first = result.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)
    return first || null
  } catch {
    return null
  }
}

export function platformRgDirName(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'win32') return 'win32-x64'
  if (platform === 'darwin') return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (platform === 'linux') return 'linux-x64'
  return null
}

export function rgBinaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'rg.exe' : 'rg'
}

export function resolveRgPath(deps: RgResolverDeps = defaultRgResolverDeps()): string | null {
  const override = deps.env['MARKDOWN_PLUS_RG_PATH']
  if (override && deps.existsSync(override)) return override

  const binary = rgBinaryName(deps.platform)
  let candidate: string | null = null

  if (deps.isPackaged) {
    const dirName = platformRgDirName(deps.platform, deps.arch)
    if (dirName) candidate = path.join(deps.resourcesPath, 'rg', dirName, binary)
  } else {
    const dirName = platformRgDirName(deps.platform, deps.arch)
    if (dirName) {
      candidate = path.join(deps.appPath, 'resources', 'rg', dirName, binary)
    }
  }

  if (candidate && deps.existsSync(candidate)) return candidate

  // 打包环境不依赖系统 rg（保证交付一致性）；仅开发环境兜底系统 PATH。
  if (!deps.isPackaged) {
    const systemRg = deps.findOnPath(binary)
    if (systemRg && deps.existsSync(systemRg)) return systemRg
  }

  return null
}
