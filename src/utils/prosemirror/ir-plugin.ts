import { Plugin, PluginKey, EditorState } from 'prosemirror-state'

export const irPluginKey = new PluginKey('ir')

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
    } catch {
      // skip invalid positions
    }
  }

  return false
}
