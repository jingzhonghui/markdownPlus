import { clipboard } from 'electron'

export type ClipboardMode = 'copy' | 'cut'

interface ClipboardExModule {
  readFilePaths(): string[]
  writeFilePaths(filePaths: string[]): string[]
}

let clipboardEx: ClipboardExModule | null | undefined

async function loadClipboardEx(): Promise<ClipboardExModule | null> {
  if (clipboardEx !== undefined) return clipboardEx
  try {
    const mod = (await import('electron-clipboard-ex')) as ClipboardExModule & { default?: ClipboardExModule }
    clipboardEx = Object.prototype.hasOwnProperty.call(mod, 'default') && mod.default ? mod.default : mod
  } catch {
    clipboardEx = null
  }
  return clipboardEx
}

export function pathsToUriList(paths: string[]): string {
  return paths
    .map((item) => {
      const normalized = item.replace(/\\/g, '/')
      const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
      const encoded = withLeadingSlash
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')
      return `file://${encoded}`
    })
    .join('\r\n')
}

export function uriListToPaths(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && line.startsWith('file://'))
    .map((line) =>
      line
        .replace(/^file:\/\//, '')
        .split('/')
        .map((segment) => {
          try {
            return decodeURIComponent(segment)
          } catch {
            return segment
          }
        })
        .join('/')
    )
    .filter((line) => line.length > 0)
}

function readLinuxUriList(): string {
  try {
    const text = clipboard.read('text/uri-list')
    if (text) return text
  } catch {
    // 忽略，尝试 readBuffer
  }
  try {
    return clipboard.readBuffer('text/uri-list').toString('utf8')
  } catch {
    return ''
  }
}

export async function readClipboardFilePaths(): Promise<string[]> {
  if (process.platform === 'linux') {
    return uriListToPaths(readLinuxUriList())
  }
  const ex = await loadClipboardEx()
  if (!ex) return []
  try {
    return ex.readFilePaths()
  } catch {
    return []
  }
}

export async function writeClipboardFilePaths(paths: string[], mode: ClipboardMode): Promise<void> {
  if (paths.length === 0) return
  if (process.platform === 'linux') {
    const uriList = pathsToUriList(paths)
    clipboard.writeBuffer('text/uri-list', Buffer.from(uriList, 'utf8'))
    if (mode === 'cut') {
      clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from(`cut\n${uriList}`, 'utf8'))
    }
    return
  }
  const ex = await loadClipboardEx()
  if (ex) ex.writeFilePaths(paths)
}
