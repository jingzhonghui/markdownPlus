import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { parseMarkdown, serializeMarkdown } from '../markdown'
import { buildKeymap } from '../keymap'
import { markdownSchema } from '../schema'

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

  it('keeps an editable paragraph after a trailing code block', () => {
    const content = '```ts\nconst value = 1\n```'
    const doc = parseMarkdown(content)

    expect(doc.childCount).toBe(2)
    expect(doc.child(0).type.name).toBe('code_block')
    expect(doc.child(1).type.name).toBe('paragraph')
    expect(serializeMarkdown(doc)).toBe(content)
  })

  it('inserts a newline instead of leaving a code block on Enter', () => {
    const doc = parseMarkdown('```ts\nconst value = 1\n```')
    const codeBlock = doc.child(0)
    const codeEnd = 1 + codeBlock.content.size
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, codeEnd)
    })

    const handled = buildKeymap(markdownSchema).Enter(state, (transaction) => {
      state = state.apply(transaction)
    })

    expect(handled).toBe(true)
    expect(state.doc.child(0).textContent).toBe('const value = 1\n')
    expect(state.doc.child(1).type.name).toBe('paragraph')
  })

  it('serializes code block content exactly after parse', () => {
    const content = '```\n// nihao\n```'
    expect(serializeMarkdown(parseMarkdown(content))).toBe(content)
  })

  it('deletes empty code block on Backspace', () => {
    const doc = parseMarkdown('```\n```')
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1)
    })

    const handled = buildKeymap(markdownSchema).Backspace(state, (transaction) => {
      state = state.apply(transaction)
    })

    expect(handled).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type.name).toBe('paragraph')
  })
})
