// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { parseMarkdown } from '../markdown'
import { getListClipboard } from '../list-clipboard'

function makeState(md: string, from: number, to?: number): EditorState {
  const doc = parseMarkdown(md)
  const end = to ?? doc.content.size
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, end) })
}

function listItemPositions(state: EditorState): number[] {
  const positions: number[] = []
  state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
    if (node.type.name === 'list_item') positions.push(pos)
    return true
  })
  return positions
}

describe('getListClipboard', () => {
  it('returns numbered text when the whole ordered list is selected', () => {
    const state = makeState('1. 第一项\n2. 第二项\n3. 第三项', 0)
    const result = getListClipboard(state)
    expect(result?.text).toBe('1. 第一项\n2. 第二项\n3. 第三项')
  })

  it('only includes list items overlapping the selection, keeping their numbers', () => {
    const state = makeState('1. 第一项\n2. 第二项\n3. 第三项', 0)
    const items = listItemPositions(state)
    const state2 = makeState('1. 第一项\n2. 第二项\n3. 第三项', items[1])
    const result = getListClipboard(state2)
    expect(result?.text).toBe('2. 第二项\n3. 第三项')
  })

  it('honours a custom start number', () => {
    const state = makeState('3. 丙\n4. 丁', 0)
    const result = getListClipboard(state)
    expect(result?.text).toBe('3. 丙\n4. 丁')
  })

  it('handles nested lists with indentation', () => {
    const state = makeState('1. 甲\n   - 子项\n2. 乙', 0)
    const result = getListClipboard(state)
    expect(result?.text).toBe('1. 甲\n  - 子项\n2. 乙')
  })

  it('returns null for a plain paragraph selection', () => {
    const state = makeState('普通段落', 0)
    expect(getListClipboard(state)).toBeNull()
  })

  it('returns null for a bullet list selection', () => {
    const state = makeState('- 甲\n- 乙', 0)
    expect(getListClipboard(state)).toBeNull()
  })

  it('returns list html that preserves the ordered list structure', () => {
    const state = makeState('1. 第一项\n2. 第二项', 0)
    const result = getListClipboard(state)
    expect(result?.html).toContain('<ol')
    expect(result?.html).toContain('<li')
    expect(result?.html).toContain('第一项')
  })

  it('copies two adjacent ordered lists separated by a blank line', () => {
    const state = makeState('1. 第一项\n2. 第二项\n\n1. 第三项\n2. 第四项', 0)
    const result = getListClipboard(state)
    expect(result?.text).toBe('1. 第一项\n2. 第二项\n\n1. 第三项\n2. 第四项')
    expect(result?.html).toContain('<ol')
  })
})
