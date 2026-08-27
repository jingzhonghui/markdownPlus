import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../markdown'
import { findMatches } from '../search'

describe('findMatches', () => {
  it('finds all occurrences in a document', () => {
    const doc = parseMarkdown('hello world, hello again')
    const matches = findMatches(doc, 'hello')
    expect(matches.map((m) => [m.from, m.to])).toEqual([
      [1, 6],
      [14, 19]
    ])
  })

  it('matches case-insensitively by default', () => {
    const doc = parseMarkdown('Hello HELLO hello')
    expect(findMatches(doc, 'hello')).toHaveLength(3)
  })

  it('respects caseSensitive option', () => {
    const doc = parseMarkdown('Hello hello')
    expect(findMatches(doc, 'Hello', true)).toHaveLength(1)
    expect(findMatches(doc, 'hello', true)).toHaveLength(1)
  })

  it('returns empty when query is empty', () => {
    const doc = parseMarkdown('some text')
    expect(findMatches(doc, '')).toHaveLength(0)
  })

  it('does not match across text nodes', () => {
    const doc = parseMarkdown('**bold** text')
    expect(findMatches(doc, 'bold text')).toHaveLength(0)
  })

  it('matches within multiple paragraphs', () => {
    const doc = parseMarkdown('foo\n\nbar foo')
    expect(findMatches(doc, 'foo')).toHaveLength(2)
  })
})
