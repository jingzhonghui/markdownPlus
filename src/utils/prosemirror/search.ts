import type { Node as ProseMirrorNode } from 'prosemirror-model'

export interface SearchMatch {
  from: number
  to: number
}

/**
 * 在 ProseMirror 文档中查找所有匹配的文本位置（仅在同一 text 节点内匹配）。
 * @param doc 文档
 * @param query 查找词
 * @param caseSensitive 是否区分大小写
 */
export function findMatches(doc: ProseMirrorNode, query: string, caseSensitive = false): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!query) return matches
  const needle = caseSensitive ? query : query.toLowerCase()

  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const text = caseSensitive ? node.text ?? '' : (node.text ?? '').toLowerCase()
    let idx = text.indexOf(needle)
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + query.length })
      idx = text.indexOf(needle, idx + query.length)
    }
    return true
  })

  return matches
}
