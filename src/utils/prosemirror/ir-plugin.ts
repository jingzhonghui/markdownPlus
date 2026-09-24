import { Plugin, PluginKey, EditorState } from 'prosemirror-state'

export const irPluginKey = new PluginKey('ir')

/** 带源码标记的块级节点：光标进入时展开 `#`、`>`、``` 等标记 */
const BLOCK_MARKER_TYPES = new Set(['heading', 'blockquote', 'code_block'])

export interface IRPluginState {
  showMarkers: boolean
}

export function createIRPlugin(): Plugin<IRPluginState> {
  return new Plugin<IRPluginState>({
    key: irPluginKey,
    state: {
      init() {
        return { showMarkers: false }
      },
      apply(tr, prev, oldState, newState) {
        if (!tr.selectionSet && oldState.selection.eq(newState.selection)) {
          return prev
        }
        return { showMarkers: hasMarkersNearSelection(newState) }
      }
    }
  })
}

function hasMarkersNearSelection(state: EditorState): boolean {
  const { selection, doc } = state
  const { from, to, empty } = selection

  const positions = new Set<number>()
  if (empty) {
    positions.add(from)
    if (from > 0) positions.add(from - 1)
    if (from < doc.content.size) positions.add(from + 1)
  } else {
    for (let i = Math.max(0, from); i <= Math.min(to, doc.content.size); i++) {
      positions.add(i)
    }
  }

  for (const pos of positions) {
    try {
      const resolved = doc.resolve(pos)
      const marks = resolved.marks()
      if (marks && marks.length > 0) return true
      // 光标位于标题/引用/代码块内时，同样展开块级源码标记
      for (let depth = resolved.depth; depth > 0; depth--) {
        if (BLOCK_MARKER_TYPES.has(resolved.node(depth).type.name)) return true
      }
    } catch {
      // skip invalid positions
    }
  }

  return false
}
