import { describe, expect, it } from 'vitest'
import {
  createSourceAuthorizationContext,
  normalizeAuthorizedLocalPath,
  normalizeAuthorizedWebUrl
} from '../source-authorization'

describe('normalizeAuthorizedWebUrl', () => {
  it('canonicalizes only absolute HTTPS URLs', () => {
    expect(normalizeAuthorizedWebUrl('HTTPS://BÜCHER.example:443/a/../report?a=1')).toBe(
      'https://xn--bcher-kva.example/report?a=1'
    )
    expect(normalizeAuthorizedWebUrl('http://example.com/report')).toBeNull()
    expect(normalizeAuthorizedWebUrl('/report')).toBeNull()
    expect(normalizeAuthorizedWebUrl('example.com/report')).toBeNull()
    expect(normalizeAuthorizedWebUrl('https://user:pass@example.com/report')).toBeNull()
    expect(normalizeAuthorizedWebUrl('https://example.com/%zz')).toBeNull()
  })

  it('does not broaden query equivalence', () => {
    expect(normalizeAuthorizedWebUrl('https://example.com/?b=2&a=%31')).toBe(
      'https://example.com/?b=2&a=%31'
    )
  })
})

describe('web source authorization', () => {
  it('extracts exact normalized URLs from current and prior user messages only', () => {
    const context = createSourceAuthorizationContext({
      message: '读取 https://example.com/report?a=1',
      history: [
        { id: 'u1', role: 'user', content: '较早来源 HTTPS://BÜCHER.example:443/a/../report' },
        { id: 'a1', role: 'assistant', content: 'https://assistant.example/secret' },
        { id: 's1', role: 'system', content: 'https://system.example/secret' },
        { id: 't1', role: 'tool', content: 'https://tool.example/secret' }
      ]
    })

    expect(context.webUrls).toEqual([
      'https://xn--bcher-kva.example/report',
      'https://example.com/report?a=1'
    ])
    expect(context.authorizeWebUrl('https://example.com/report?a=1')).toBe(
      'https://example.com/report?a=1'
    )
    expect(context.authorizeWebUrl('https://example.com/report?a=2')).toBeNull()
    expect(context.authorizeWebUrl('https://example.com/report/sub')).toBeNull()
    expect(context.authorizeWebUrl('https://example.com/')).toBeNull()
    expect(context.authorizeWebUrl('https://example.com/other')).toBeNull()
    expect(context.authorizeWebUrl('https://assistant.example/secret')).toBeNull()
  })

  it('rejects ambiguous boundaries, malformed escapes, and incomplete tokens', () => {
    const context = createSourceAuthorizationContext({
      message:
        '坏边界https://example.com/a 尾随https://example.com/b更多 malformed https://example.com/%zz',
      history: []
    })
    expect(context.webUrls).toEqual(['https://example.com/'])
  })

  it('trims trailing punctuation and normalizes the shorter URL', () => {
    const context = createSourceAuthorizationContext({
      message: '读取 https://example.com/report。',
      history: []
    })

    expect(context.webUrls).toEqual(['https://example.com/report'])
    expect(context.authorizeWebUrl('https://example.com/report')).toBe(
      'https://example.com/report'
    )
    expect(context.authorizeWebUrl('https://example.com/report。')).toBeNull()
  })

  it('trim trailing Markdown-link closing parenthesis', () => {
    const context = createSourceAuthorizationContext({
      message: '看看 [这个](https://example.com/report) 怎么样',
      history: []
    })

    expect(context.webUrls).toEqual(['https://example.com/report'])
    expect(context.authorizeWebUrl('https://example.com/report')).toBe(
      'https://example.com/report'
    )
  })

  it('preserves valid URL punctuation and apostrophes inside paired backticks', () => {
    const target = "https://example.com/O'Reilly/report.final!"
    const context = createSourceAuthorizationContext({
      message: `读取 \`${target}\``,
      history: []
    })

    expect(context.webUrls).toEqual([target])
    expect(context.authorizeWebUrl(target)).toBe(target)
    expect(context.authorizeWebUrl("https://example.com/O'Reilly/report.final")).toBeNull()
  })

  it('deduplicates while retaining first-seen order and freezes the context', () => {
    const context = createSourceAuthorizationContext({
      message: '再看 https://example.com/one',
      history: [
        { id: 'u1', role: 'user', content: '先看 https://example.com/two' },
        { id: 'u2', role: 'user', content: '重复 https://example.com/one' }
      ]
    })
    expect(context.webUrls).toEqual(['https://example.com/two', 'https://example.com/one'])
    expect(Object.isFrozen(context.webUrls)).toBe(true)
    expect(Object.isFrozen(context.localFiles)).toBe(true)
    expect(Object.isFrozen(context)).toBe(true)
  })
})

describe('normalizeAuthorizedLocalPath', () => {
  it('normalizes absolute Windows drive and UNC file paths', () => {
    expect(normalizeAuthorizedLocalPath('c:/Docs/./Draft/../Quarterly Report.pdf')).toBe(
      'C:\\Docs\\Quarterly Report.pdf'
    )
    expect(normalizeAuthorizedLocalPath('\\\\server\\share\\dir\\..\\file.txt')).toBe(
      '\\\\server\\share\\file.txt'
    )
  })

  it('rejects unsafe or non-file path forms', () => {
    for (const value of [
      'notes\\plan.md',
      '%USERPROFILE%\\plan.md',
      'C:\\Docs\\*.md',
      'C:\\Docs\\',
      '\\\\server\\share\\'
    ]) {
      expect(normalizeAuthorizedLocalPath(value)).toBeNull()
    }
  })
})

describe('local source authorization', () => {
  it('extracts paired quoted paths with spaces and prior user paths', () => {
    const context = createSourceAuthorizationContext({
      message: '读取 `C:\\Docs\\Quarterly Report.pdf` 和 \'E:\\Data\\facts.csv\'',
      history: [
        { id: 'u1', role: 'user', content: '也可参考 "D:\\Notes\\plan.md"' },
        { id: 'a1', role: 'assistant', content: '读取 "C:\\Private\\assistant.txt"' }
      ]
    })

    expect(context.localFiles).toEqual([
      'D:\\Notes\\plan.md',
      'C:\\Docs\\Quarterly Report.pdf',
      'E:\\Data\\facts.csv'
    ])
    expect(context.authorizeLocalFile('c:/Docs/Quarterly Report.pdf')).toBe(
      'C:\\Docs\\Quarterly Report.pdf'
    )
    expect(context.authorizeLocalFile('C:\\Docs\\Other Report.pdf')).toBeNull()
    expect(context.authorizeLocalFile('C:\\Private\\assistant.txt')).toBeNull()
  })

  it('extracts an unquoted path only when its endpoint is unambiguous', () => {
    const context = createSourceAuthorizationContext({
      message: 'C:\\Docs\\report.pdf',
      history: []
    })
    expect(context.localFiles).toEqual(['C:\\Docs\\report.pdf'])
  })

  it('fails closed for literal trailing punctuation and does not authorize a shorter path', () => {
    const context = createSourceAuthorizationContext({
      message: '读取 C:\\Docs\\report.pdf。',
      history: []
    })

    expect(context.localFiles).toEqual([])
    expect(context.authorizeLocalFile('C:\\Docs\\report.pdf')).toBeNull()
    expect(context.authorizeLocalFile('C:\\Docs\\report.pdf。')).toBeNull()
  })

  it('preserves valid path punctuation and apostrophes inside paired quotes', () => {
    const target = "C:\\Docs\\O'Reilly, final!.txt"
    const context = createSourceAuthorizationContext({
      message: `读取 \`${target}\``,
      history: []
    })

    expect(context.localFiles).toEqual([target])
    expect(context.authorizeLocalFile(target)).toBe(target)
    expect(context.authorizeLocalFile("C:\\Docs\\O'Reilly, final.txt")).toBeNull()
  })

  it('fails closed for unmatched quotes and ambiguous unquoted whitespace', () => {
    const context = createSourceAuthorizationContext({
      message: '读取 "C:\\Docs\\broken.pdf 以及 C:\\Docs\\Quarterly Report.pdf',
      history: []
    })
    expect(context.localFiles).toEqual([])
  })
})
