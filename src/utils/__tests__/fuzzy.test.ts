import { describe, expect, it } from 'vitest'
import { fuzzyMatch, searchFiles } from '../fuzzy'

describe('fuzzyMatch', () => {
  it('matches a subsequence and returns ordered positions', () => {
    const result = fuzzyMatch('ap', 'apple.md')
    expect(result).not.toBeNull()
    expect(result!.positions).toEqual([0, 1])
    expect(result!.score).toBeGreaterThan(0)
  })

  it('returns null when the query cannot match', () => {
    expect(fuzzyMatch('xz', 'apple.md')).toBeNull()
  })

  it('is case-insensitive', () => {
    const result = fuzzyMatch('AP', 'apple.md')
    expect(result).not.toBeNull()
    expect(result!.positions).toEqual([0, 1])
  })

  it('matches Chinese characters character by character', () => {
    const result = fuzzyMatch('笔记', '读书笔记.md')
    expect(result).not.toBeNull()
    expect(result!.positions).toEqual([2, 3])
  })

  it('scores consecutive characters higher than scattered ones', () => {
    const consecutive = fuzzyMatch('app', 'apple.md')!
    const scattered = fuzzyMatch('apl', 'apple.md')!
    expect(consecutive.score).toBeGreaterThan(scattered.score)
  })

  it('scores a prefix match higher than a middle match', () => {
    const prefix = fuzzyMatch('read', 'readme.md')!
    const middle = fuzzyMatch('eadm', 'readme.md')!
    expect(prefix.score).toBeGreaterThan(middle.score)
  })

  it('rewards matches after separators (word starts)', () => {
    const afterSep = fuzzyMatch('file', 'my-file.md')!
    const plainMid = fuzzyMatch('file', 'myxfile.md')!
    expect(afterSep.score).toBeGreaterThan(plainMid.score)
  })

  it('returns an empty match for an empty query', () => {
    const result = fuzzyMatch('', 'apple.md')
    expect(result).not.toBeNull()
    expect(result!.score).toBe(0)
    expect(result!.positions).toEqual([])
  })
})

describe('searchFiles', () => {
  const files = [
    { name: 'readme.md', path: 'C:/ws/readme.md' },
    { name: 'app.ts', path: 'C:/ws/src/app.ts' },
    { name: 'docs.md', path: 'C:/ws/docs.md' },
    { name: 'note.md', path: 'C:/ws/docs/note.md' }
  ]

  it('returns files whose name matches, ranked before path-only matches', () => {
    const results = searchFiles(files, 'docs')
    expect(results.length).toBe(2)
    // docs.md 的文件名命中应排在 docs/note.md（仅路径命中）之前
    expect(results[0].file.name).toBe('docs.md')
    expect(results[1].file.path).toBe('C:/ws/docs/note.md')
  })

  it('sorts higher scores first', () => {
    const results = searchFiles(files, 'readme')
    expect(results[0].file.name).toBe('readme.md')
  })

  it('returns all files in original order for an empty query', () => {
    const results = searchFiles(files, '')
    expect(results.map((r) => r.file.name)).toEqual(['readme.md', 'app.ts', 'docs.md', 'note.md'])
  })

  it('excludes non-matching files', () => {
    const results = searchFiles(files, 'zzz')
    expect(results).toHaveLength(0)
  })

  it('exposes match positions relative to the matched text', () => {
    const results = searchFiles(files, 'note')
    expect(results[0].positions).toEqual([0, 1, 2, 3])
  })
})
