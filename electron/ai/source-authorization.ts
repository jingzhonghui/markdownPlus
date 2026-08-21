import { win32 } from 'node:path'
import type { AiRunInput } from '../../shared/ai/types'

export interface SourceAuthorizationContext {
  readonly webUrls: readonly string[]
  readonly localFiles: readonly string[]
  authorizeWebUrl(input: string): string | null
  authorizeLocalFile(input: string): string | null
}

const QUOTED_URL = /([`'"])(https:\/\/[^\r\n]*?)\1/giu
const URL_TOKEN = /https:\/\/[^\s`'"<>]+/giu
const QUOTED_PATH = /([`'"])([A-Za-z]:[\\/][^\r\n]*?|\\\\[^\\/\s]+[\\/][^\\/\s]+[\\/][^\r\n]*?)\1/g
const UNQUOTED_PATH = /(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+[\\/])[^\s`'"<>]+/g
const AMBIGUOUS_TRAILING_PUNCTUATION = /[.,;:!?，。；！？、)\]}]$/u

export function normalizeAuthorizedWebUrl(input: string): string | null {
  if (input.trim() !== input || !/^https:\/\//i.test(input)) {
    return null
  }
  if (/%(?![\dA-Fa-f]{2})/.test(input)) return null

  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function normalizeAuthorizedLocalPath(input: string): string | null {
  if (input.trim() !== input || /[%*?<>|]/.test(input) || /[\\/]$/.test(input)) return null
  const isDrivePath = /^[A-Za-z]:[\\/]/.test(input)
  const isUncPath = /^\\\\[^\\/]+[\\/][^\\/]+[\\/]/.test(input)
  if (!isDrivePath && !isUncPath) return null

  const normalized = win32.normalize(input)
  if (normalized.endsWith('\\') || (isUncPath && !/^\\\\[^\\]+\\[^\\]+\\.+/.test(normalized))) {
    return null
  }
  return isDrivePath ? normalized[0].toUpperCase() + normalized.slice(1) : normalized
}

function hasAmbiguousOpeningQuote(text: string, pairedRanges: ReadonlyArray<[number, number]>): boolean {
  const unpairedText = text.split('')
  for (const [start, end] of pairedRanges) {
    unpairedText.fill(' ', start, end)
  }
  for (const quote of ['`', "'", '"']) {
    if (unpairedText.includes(quote)) return true
  }
  return false
}

function extractWebUrls(text: string): string[] {
  const values: string[] = []
  const quotedRanges: Array<[number, number]> = []

  for (const match of text.matchAll(QUOTED_URL)) {
    quotedRanges.push([match.index, match.index + match[0].length])
    const normalized = normalizeAuthorizedWebUrl(match[2])
    if (normalized) values.push(normalized)
  }

  for (const match of text.matchAll(URL_TOKEN)) {
    const start = match.index
    if (quotedRanges.some(([rangeStart, end]) => start >= rangeStart && start < end)) continue
    const before = start === 0 ? '' : text[start - 1]
    if (before && /[\p{L}\p{N}_]/u.test(before)) continue

    // 逐字符裁剪，取第一个可归一化的有效 URL
    // 先剪掉尾部歧义标点和非 ASCII 字符（如中文、全角标点），避免 new URL() 将其编码为合法路径
    let candidate = match[0]
    while (candidate.length > 0) {
      // 裁剪尾部歧义标点和非 ASCII 字符
      while (
        candidate.length > 0 &&
        (AMBIGUOUS_TRAILING_PUNCTUATION.test(candidate) ||
          candidate.charCodeAt(candidate.length - 1) > 127)
      ) {
        candidate = candidate.slice(0, -1)
      }
      if (candidate.length === 0) break

      const normalized = normalizeAuthorizedWebUrl(candidate)
      if (normalized) {
        values.push(normalized)
        break
      }
      candidate = candidate.slice(0, -1)
    }
  }
  return values
}

function extractLocalFiles(text: string): string[] {
  const values: string[] = []
  const quotedRanges: Array<[number, number]> = []

  for (const match of text.matchAll(QUOTED_PATH)) {
    quotedRanges.push([match.index, match.index + match[0].length])
    const normalized = normalizeAuthorizedLocalPath(match[2])
    if (normalized) values.push(normalized)
  }
  if (hasAmbiguousOpeningQuote(text, quotedRanges)) return []

  for (const match of text.matchAll(UNQUOTED_PATH)) {
    if (quotedRanges.some(([start, end]) => match.index >= start && match.index < end)) continue
    const candidate = match[0]
    if (AMBIGUOUS_TRAILING_PUNCTUATION.test(candidate)) continue
    const end = match.index + candidate.length
    const after = text[end] ?? ''
    // Whitespace can hide a continuation containing spaces, so only end of text
    // makes an unquoted endpoint unique.
    if (after) continue
    const normalized = normalizeAuthorizedLocalPath(candidate)
    if (normalized) values.push(normalized)
  }
  return values
}

export function createSourceAuthorizationContext(
  input: Pick<AiRunInput, 'message' | 'history'>
): SourceAuthorizationContext {
  const userTexts = [
    ...input.history.filter((message) => message.role === 'user').map((message) => message.content),
    input.message
  ]
  const webUrls = Object.freeze([...new Set(userTexts.flatMap(extractWebUrls))])
  const localFiles = Object.freeze([...new Set(userTexts.flatMap(extractLocalFiles))])
  const webSet = new Set(webUrls)
  const fileSet = new Set(localFiles)

  return Object.freeze({
    webUrls,
    localFiles,
    authorizeWebUrl(candidate: string): string | null {
      const normalized = normalizeAuthorizedWebUrl(candidate)
      return normalized && webSet.has(normalized) ? normalized : null
    },
    authorizeLocalFile(candidate: string): string | null {
      const normalized = normalizeAuthorizedLocalPath(candidate)
      return normalized && fileSet.has(normalized) ? normalized : null
    }
  })
}
