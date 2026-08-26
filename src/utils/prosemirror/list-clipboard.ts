import { DOMSerializer } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model'

const LIST_TYPES = new Set(['ordered_list', 'bullet_list'])

export interface ListClipboardResult {
  text: string
  html: string
}

function findTopList($pos: ResolvedPos): { node: ProseMirrorNode; pos: number } | null {
  for (let d = $pos.depth; d > 0; d--) {
    if (LIST_TYPES.has($pos.node(d).type.name)) {
      return { node: $pos.node(d), pos: $pos.before(d) }
    }
  }
  return null
}

function findListsInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number
): Array<{ node: ProseMirrorNode; pos: number }> {
  const lists: Array<{ node: ProseMirrorNode; pos: number }> = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (LIST_TYPES.has(node.type.name)) {
      lists.push({ node, pos })
    }
    return true
  })
  // 只保留最外层的列表（嵌套列表由外层递归处理）
  return lists.filter(
    (list) =>
      !lists.some(
        (other) =>
          other !== list &&
          other.pos < list.pos &&
          list.pos + list.node.nodeSize <= other.pos + other.node.nodeSize
      )
  )
}

function cropList(
  list: ProseMirrorNode,
  listPos: number,
  from: number,
  to: number
): ProseMirrorNode | null {
  const items: ProseMirrorNode[] = []
  let firstIndex = -1
  list.forEach((item, offset, index) => {
    const itemStart = listPos + offset + 1
    const itemEnd = itemStart + item.nodeSize
    if (itemStart < to && itemEnd > from) {
      if (firstIndex === -1) firstIndex = index
      items.push(item)
    }
  })
  if (items.length === 0) return null
  const attrs = { ...list.attrs }
  if (list.type.name === 'ordered_list' && firstIndex > 0) {
    attrs.order = (attrs.order || 1) + firstIndex
  }
  return list.type.create(attrs, items)
}

function itemText(item: ProseMirrorNode): string {
  const parts: string[] = []
  item.forEach((child) => {
    if (child.isTextblock) {
      const t = child.textBetween(0, child.content.size, ' ').trim()
      if (t) parts.push(t)
    }
  })
  return parts.join(' ')
}

function listToLines(list: ProseMirrorNode, depth: number): string[] {
  const lines: string[] = []
  const ordered = list.type.name === 'ordered_list'
  const start = (ordered ? list.attrs.order : 1) || 1
  let index = 0
  list.forEach((item) => {
    if (item.type.name !== 'list_item') return
    const indent = '  '.repeat(depth)
    const prefix = ordered ? String(start + index) + '. ' : '- '
    lines.push(indent + prefix + itemText(item))
    item.forEach((child) => {
      if (LIST_TYPES.has(child.type.name)) {
        lines.push(...listToLines(child, depth + 1))
      }
    })
    index++
  })
  return lines
}

function collectListsInSelection(state: EditorState): Array<{ node: ProseMirrorNode; pos: number }> {
  const { $from, $to, from, to } = state.selection
  const found = new Map<number, { node: ProseMirrorNode; pos: number }>()
  const add = (list: { node: ProseMirrorNode; pos: number } | null) => {
    if (list) found.set(list.pos, list)
  }
  add(findTopList($from))
  add(findTopList($to))
  for (const list of findListsInRange(state.doc, from, to)) add(list)
  return [...found.values()].sort((a, b) => a.pos - b.pos)
}

/**
 * 当选区覆盖有序列表时，生成带序号的剪贴板内容：
 * - text: "1. xxx\n2. xxx"（记事本等外部应用可见序号）
 * - html: 保留列表结构的 HTML（IR 模式内部粘贴仍为列表）
 * 多个相邻列表之间用空行分隔，保持各自的起始序号。
 * 选区不在有序列表内时返回 null（走默认复制行为）。
 */
export function getListClipboard(state: EditorState): ListClipboardResult | null {
  const { from, to } = state.selection
  if (from === to) return null

  const lists = collectListsInSelection(state)
  if (lists.length === 0) return null
  if (!lists.some((l) => l.node.type.name === 'ordered_list')) return null

  const sections: string[] = []
  const croppedNodes: ProseMirrorNode[] = []
  for (const list of lists) {
    // 选区必须与列表块相交
    const listEnd = list.pos + list.node.nodeSize
    if (to <= list.pos || from >= listEnd) continue
    const cropped = cropList(list.node, list.pos, from, to)
    if (!cropped) continue
    croppedNodes.push(cropped)
    sections.push(listToLines(cropped, 0).join('\n'))
  }
  if (sections.length === 0) return null

  const text = sections.join('\n\n')
  const doc = state.schema.node('doc', null, croppedNodes)
  const container = globalThis.document.createElement('div')
  DOMSerializer.fromSchema(state.schema).serializeFragment(
    doc.content,
    { document: globalThis.document },
    container
  )
  return { text, html: container.innerHTML }
}
