import { describe, expect, it } from 'vitest'
import { parseMarkdown, serializeMarkdown } from '../markdown'

describe('Markdown ↔ ProseMirror conversion', () => {
  it('creates an editable paragraph for an empty document', () => {
    for (const content of ['', '   ', '\n\n']) {
      const doc = parseMarkdown(content)

      expect(doc.childCount).toBe(1)
      expect(doc.firstChild?.type.name).toBe('paragraph')
      expect(doc.firstChild?.content.size).toBe(0)
    }
  })

  it('keeps an empty document editable after serialization', () => {
    const doc = parseMarkdown('')

    expect(serializeMarkdown(doc)).toBe('')
    expect(parseMarkdown(serializeMarkdown(doc)).firstChild?.type.name).toBe('paragraph')
  })

  it('preserves content while parsing and serializing', () => {
    const content = '## 新建文档\n\n开始编写'

    expect(serializeMarkdown(parseMarkdown(content))).toBe(content)
  })
})
