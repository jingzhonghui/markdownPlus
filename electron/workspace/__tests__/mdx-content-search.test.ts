import { describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import AdmZip from 'adm-zip'
import { SourceAccessError } from '../../ai/source-access-service'
import {
  extractMdxContentText,
  matchTextInContent,
  searchMdxFile,
  DEFAULT_MDX_SEARCH_LIMITS,
  type MdxSearchLimits
} from '../mdx-content-search'

function makeMdx(opts: {
  content?: string
  contentFile?: string
  entries?: Array<{ name: string; data: Buffer }>
}): Buffer {
  const zip = new AdmZip()
  const entries = opts.entries ?? [
    { name: 'mdx.json', data: Buffer.from(JSON.stringify({ version: '1.0', content_file: opts.contentFile ?? 'content.md' }), 'utf8') },
    { name: opts.contentFile ?? 'content.md', data: Buffer.from(opts.content ?? '', 'utf8') }
  ]
  for (const entry of entries) zip.addFile(entry.name, entry.data)
  return zip.toBuffer()
}

describe('extractMdxContentText', () => {
  it('extracts content.md text from a valid mdx', () => {
    const bytes = makeMdx({ content: '# Title\n\nbody' })
    expect(extractMdxContentText(bytes, DEFAULT_MDX_SEARCH_LIMITS)).toBe('# Title\n\nbody')
  })

  it('honors content_file in mdx.json', () => {
    const bytes = makeMdx({ contentFile: 'notes.md', content: 'hello notes' })
    expect(extractMdxContentText(bytes, DEFAULT_MDX_SEARCH_LIMITS)).toBe('hello notes')
  })

  it('rejects a non-zip payload', () => {
    expect(() => extractMdxContentText(Buffer.from('not a zip'), DEFAULT_MDX_SEARCH_LIMITS)).toThrow(SourceAccessError)
  })

  it('rejects an unsafe content_file path in mdx.json', () => {
    const zip = new AdmZip()
    zip.addFile('mdx.json', Buffer.from(JSON.stringify({ version: '1.0', content_file: '../escape.md' }), 'utf8'))
    zip.addFile('content.md', Buffer.from('x'))
    expect(() => extractMdxContentText(zip.toBuffer(), DEFAULT_MDX_SEARCH_LIMITS)).toThrow(/不安全/)
  })

  it('rejects an absolute content_file path in mdx.json', () => {
    const zip = new AdmZip()
    zip.addFile('mdx.json', Buffer.from(JSON.stringify({ version: '1.0', content_file: '/abs.md' }), 'utf8'))
    zip.addFile('content.md', Buffer.from('x'))
    expect(() => extractMdxContentText(zip.toBuffer(), DEFAULT_MDX_SEARCH_LIMITS)).toThrow(/不安全/)
  })

  it('rejects a missing mdx.json', () => {
    const zip = new AdmZip()
    zip.addFile('content.md', Buffer.from('x'))
    expect(() => extractMdxContentText(zip.toBuffer(), DEFAULT_MDX_SEARCH_LIMITS)).toThrow(/缺少 mdx\.json/)
  })

  it('rejects too many entries', () => {
    const limits: MdxSearchLimits = { ...DEFAULT_MDX_SEARCH_LIMITS, maxZipEntries: 2 }
    const zip = new AdmZip()
    zip.addFile('a.md', Buffer.from('x'))
    zip.addFile('b.md', Buffer.from('y'))
    zip.addFile('c.md', Buffer.from('z'))
    expect(() => extractMdxContentText(zip.toBuffer(), limits)).toThrow(SourceAccessError)
  })

  it('rejects entries exceeding the ratio limit (zip bomb)', () => {
    const limits: MdxSearchLimits = { ...DEFAULT_MDX_SEARCH_LIMITS, maxZipRatio: 2, maxContentBytes: 1024 }
    const zip = new AdmZip()
    // 高度可压缩内容，压缩比明显超过 2
    zip.addFile('content.md', Buffer.from('A'.repeat(10_000)))
    expect(() => extractMdxContentText(zip.toBuffer(), limits)).toThrow(SourceAccessError)
  })
})

describe('matchTextInContent', () => {
  it('finds literal matches with line/column/preview', () => {
    const results = matchTextInContent('# Notes\n\nrelease 内容', 'release', false, false, new AbortController().signal)
    expect(results).toEqual([{ line: 3, column: 1, preview: 'release 内容' }])
  })

  it('supports case-insensitive by default', () => {
    const results = matchTextInContent('HELLO', 'hello', false, false, new AbortController().signal)
    expect(results).toHaveLength(1)
  })

  it('respects caseSensitive', () => {
    expect(matchTextInContent('HELLO', 'hello', true, false, new AbortController().signal)).toHaveLength(0)
  })

  it('supports regex when isRegex is true', () => {
    const results = matchTextInContent('版本 1.2.3', '\\d+\\.\\d+\\.\\d+', false, true, new AbortController().signal)
    expect(results).toHaveLength(1)
  })
})

describe('searchMdxFile', () => {
  it('reads the file, searches, and closes the handle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-mdx-'))
    const file = path.join(dir, 'doc.mdx')
    fs.writeFileSync(file, makeMdx({ content: '# Hello\n\nsecret word' }))
    const onMatch = vi.fn()
    const count = await searchMdxFile({
      filePath: file,
      relativePath: 'doc.mdx',
      query: 'secret',
      caseSensitive: false,
      isRegex: false,
      limits: DEFAULT_MDX_SEARCH_LIMITS,
      signal: new AbortController().signal,
      onMatch
    })
    expect(count).toBe(1)
    expect(onMatch).toHaveBeenCalledWith(expect.objectContaining({ line: 3, column: 1 }))
  })

  it('returns zero matches when aborted before reading', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-mdx-'))
    const file = path.join(dir, 'doc.mdx')
    fs.writeFileSync(file, makeMdx({ content: 'x' }))
    const controller = new AbortController()
    controller.abort()
    const count = await searchMdxFile({
      filePath: file,
      relativePath: 'doc.mdx',
      query: 'x',
      caseSensitive: false,
      isRegex: false,
      limits: DEFAULT_MDX_SEARCH_LIMITS,
      signal: controller.signal,
      onMatch: vi.fn()
    })
    expect(count).toBe(0)
  })
})
