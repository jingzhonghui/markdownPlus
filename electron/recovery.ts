import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface RecoveryTab {
  id: string
  filePath: string | null
  fileName: string
  format: 'mdx' | 'markdown'
  content: string
  document: unknown
  modifiedAt: string
}

export interface RecoverySnapshot {
  version: 1
  createdAt: string
  activeTabId: string | null
  tabs: RecoveryTab[]
}

function recoveryDir(): string {
  const dir = path.join(app.getPath('userData'), 'recovery')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function snapshotPath(): string {
  return path.join(recoveryDir(), 'snapshot.json')
}

function markerPath(): string {
  return path.join(recoveryDir(), 'running')
}

export function markAppRunning(): void {
  const marker = markerPath()
  if (fs.existsSync(marker)) {
    return
  }
  fs.writeFileSync(marker, new Date().toISOString(), 'utf8')
}

export function hadAbnormalExit(): boolean {
  return fs.existsSync(markerPath()) && fs.existsSync(snapshotPath())
}

export function writeRecoverySnapshot(snapshot: RecoverySnapshot): void {
  const target = snapshotPath()
  const temporary = `${target}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(snapshot), 'utf8')
  fs.renameSync(temporary, target)
}

export function readRecoverySnapshot(): RecoverySnapshot | null {
  try {
    if (!fs.existsSync(snapshotPath())) return null
    const value = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8')) as RecoverySnapshot
    if (value.version !== 1 || !Array.isArray(value.tabs)) return null
    return value
  } catch {
    return null
  }
}

export function clearRecoveryData(): void {
  const dir = recoveryDir()
  clearRecoverySnapshot()
  fs.rmSync(path.join(dir, 'running'), { force: true })
}

export function clearRecoverySnapshot(): void {
  const dir = recoveryDir()
  for (const name of ['snapshot.json', 'snapshot.json.tmp']) {
    fs.rmSync(path.join(dir, name), { force: true })
  }
}
