import { describe, expect, it } from 'vitest'
import { hashDocumentContent } from '../document-revision'

describe('hashDocumentContent', () => {
  it('is deterministic for identical input', () => {
    expect(hashDocumentContent('abc')).toBe(hashDocumentContent('abc'))
    expect(hashDocumentContent('')).toBe(hashDocumentContent(''))
  })

  it('differs for a one-character change', () => {
    expect(hashDocumentContent('abc')).not.toBe(hashDocumentContent('abd'))
  })

  it('produces a stable 32-bit hex string', () => {
    expect(hashDocumentContent('hello world')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('is stable across repeated calls (no random salt)', () => {
    const first = hashDocumentContent('deterministic content')
    for (let i = 0; i < 10; i++) {
      expect(hashDocumentContent('deterministic content')).toBe(first)
    }
  })
})
