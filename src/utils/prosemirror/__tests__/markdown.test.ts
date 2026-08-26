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

  it('exits table and creates paragraph below on Enter in the last row', () => {
    const content = '| a | b |\n| --- | --- |\n| c | d |'
    const doc = parseMarkdown(content)
    // 光标放在最后一行第一个单元格的段落末尾
    const table = doc.child(0)
    const cellStart = 1 + table.child(0).nodeSize + 1
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, cellStart + 1)
    })

    const handled = buildKeymap(markdownSchema).Enter(state, (transaction) => {
      state = state.apply(transaction)
    })

    expect(handled).toBe(true)
    expect(state.doc.childCount).toBe(2)
    expect(state.doc.child(0).type.name).toBe('table')
    expect(state.doc.child(1).type.name).toBe('paragraph')
  })

  it('parses GFM table column alignment into cell attrs', () => {
    const content = '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |'
    const doc = parseMarkdown(content)
    const headerRow = doc.child(0).child(0)
    const aligns: (string | null)[] = []
    headerRow.forEach((cell) => aligns.push((cell.attrs.align as string) ?? null))
    expect(aligns).toEqual(['left', 'center', 'right'])
  })

  it('serializes table column alignment as GFM separator row', () => {
    const { nodes } = markdownSchema
    const mkCell = (typeName: 'table_header' | 'table_cell', align: string | null) => {
      const type = nodes[typeName]
      return type.create(align ? { align } : {}, markdownSchema.text('x'))
    }
    const headerRow = nodes.table_row.create(null, [
      mkCell('table_header', 'left'),
      mkCell('table_header', 'center'),
      mkCell('table_header', 'right')
    ])
    const dataRow = nodes.table_row.create(null, [
      mkCell('table_cell', 'left'),
      mkCell('table_cell', 'center'),
      mkCell('table_cell', 'right')
    ])
    const table = nodes.table.create(null, [headerRow, dataRow])
    const doc = markdownSchema.node('doc', null, [table])

    const md = serializeMarkdown(doc)
    expect(md).toContain('| :--- | :---: | ---: |')
    expect(md).toContain('| x | x | x |')
  })

  it('preserves table alignment through parse/serialize roundtrip', () => {
    const content = '| a | b |\n| :---: | ---: |\n| 1 | 2 |'
    const roundtrip = serializeMarkdown(parseMarkdown(content))
    expect(roundtrip).toContain('| :---: | ---: |')
    expect(parseMarkdown(roundtrip).child(0).child(0).child(0).attrs.align).toBe('center')
    expect(parseMarkdown(roundtrip).child(0).child(0).child(1).attrs.align).toBe('right')
  })
})

describe('adjacent ordered lists', () => {
  const orderedListCount = (doc: ReturnType<typeof parseMarkdown>) => {
    let count = 0
    doc.forEach((n) => {
      if (n.type.name === 'ordered_list') count++
    })
    return count
  }

  it('parses two adjacent ordered lists (blank-line separated) as two lists', () => {
    const doc = parseMarkdown('1. 第一项\n2. 第二项\n\n1. 第三项\n2. 第四项')
    expect(orderedListCount(doc)).toBe(2)
  })

  it('serializes two adjacent lists without any separator marker', () => {
    const md = serializeMarkdown(parseMarkdown('1. 第一项\n2. 第二项\n\n1. 第三项\n2. 第四项'))
    expect(md).not.toContain('<!-- -->')
    expect(parseMarkdown(md)).toBeTruthy()
  })

  it('keeps adjacent lists stable across serialize→parse→serialize', () => {
    const md1 = serializeMarkdown(parseMarkdown('1. 第一项\n2. 第二项\n\n1. 第三项\n2. 第四项'))
    const doc2 = parseMarkdown(md1)
    expect(orderedListCount(doc2)).toBe(2)
    expect(serializeMarkdown(doc2)).toBe(md1)
  })

  it('does not split a single list with increasing markers even when loose', () => {
    const doc = parseMarkdown('1. a\n\n2. b\n\n3. c')
    expect(orderedListCount(doc)).toBe(1)
  })

  it('splits a list whose marker restarts at a lower number', () => {
    const doc = parseMarkdown('3. 甲\n4. 乙\n\n1. 丙')
    expect(orderedListCount(doc)).toBe(2)
    expect(doc.child(1).attrs.order).toBe(1)
  })
})
