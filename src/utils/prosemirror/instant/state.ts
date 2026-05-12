/**
 * 即时渲染模式 - 核心状态管理
 * 跟踪每个块级节点的渲染状态（渲染态 vs 源码态）
 */
import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { Node as ProseMirrorNode } from 'prosemirror-model'

export const instantRenderKey = new PluginKey<InstantRenderState>('instantRender')

/**
 * 块级渲染状态
 */
export interface BlockRenderState {
  /** 节点位置 */
  pos: number
  /** 是否处于源码态（显示 Markdown 标记符） */
  isSource: boolean
  /** 节点类型 */
  nodeType: string
}

/**
 * 即时渲染插件状态
 */
export class InstantRenderState {
  /** 当前处于源码态的块位置集合 */
  sourceBlocks: Set<number>
  /** 上次选区所在的块位置 */
  lastSelectionBlock: number | null
  /** 是否需要重新计算 */
  needsRecalculate: boolean

  constructor(
    sourceBlocks: Set<number> = new Set(),
    lastSelectionBlock: number | null = null,
    needsRecalculate = false
  ) {
    this.sourceBlocks = sourceBlocks
    this.lastSelectionBlock = lastSelectionBlock
    this.needsRecalculate = needsRecalculate
  }
}

/**
 * 获取光标所在的顶层块节点位置
 */
export function getSelectionBlockPos(state: EditorState): number | null {
  const { selection } = state
  const { $from } = selection

  // 找到顶层块节点（depth = 1，即 doc 的直接子节点）
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.isBlock) {
      return $from.before(depth)
    }
  }

  return null
}

/**
 * 获取所有与选区重叠的顶层块节点位置
 */
export function getSelectedBlockPositions(state: EditorState): number[] {
  const { selection } = state
  const { $from, $to } = selection
  const blocks: number[] = []

  state.doc.descendants((node, pos) => {
    if (node.isBlock && state.doc.resolve(pos).depth === 1) {
      // 检查这个块是否与选区重叠
      const blockStart = pos
      const blockEnd = pos + node.nodeSize
      if (blockStart < $to.pos && blockEnd > $from.pos) {
        blocks.push(pos)
      }
    }
  })

  return blocks
}

/**
 * 判断某个位置是否在源码态
 */
export function isBlockInSourceMode(state: EditorState, blockPos: number): boolean {
  const pluginState = instantRenderKey.getState(state)
  if (!pluginState) return false
  return pluginState.sourceBlocks.has(blockPos)
}

/**
 * 创建即时渲染核心插件
 * 监听选区变化，自动切换光标所在块的渲染状态
 */
export function createInstantRenderPlugin(): Plugin {
  return new Plugin<InstantRenderState>({
    key: instantRenderKey,

    state: {
      init() {
        return new InstantRenderState(new Set(), null, false)
      },

      apply(tr: Transaction, prev: InstantRenderState): InstantRenderState {
        // 检查是否有 meta 数据直接设置状态
        const meta = tr.getMeta(instantRenderKey)
        if (meta instanceof InstantRenderState) {
          return meta
        }

        // 检查是否是选区变化或文档变化
        const selectionChanged = tr.selectionSet
        const docChanged = tr.docChanged

        if (!selectionChanged && !docChanged) {
          return prev
        }

        const newState = new InstantRenderState(
          new Set(prev.sourceBlocks),
          prev.lastSelectionBlock,
          true
        )

        return newState
      }
    },

    view() {
      return {
        update: (view) => {
          const pluginState = instantRenderKey.getState(view.state)
          if (!pluginState || !pluginState.needsRecalculate) return

          const state = view.state
          const selectedBlocks = getSelectedBlockPositions(state)
          const newSourceBlocks = new Set<number>()

          // 当前选区所在的块设为源码态
          for (const pos of selectedBlocks) {
            newSourceBlocks.add(pos)
          }

          // 更新插件状态
          const newPluginState = new InstantRenderState(
            newSourceBlocks,
            selectedBlocks.length > 0 ? selectedBlocks[0] : null,
            false
          )

          // 如果状态变化了，触发重新渲染
          const hasChanged = !setsEqual(pluginState.sourceBlocks, newSourceBlocks)
          if (hasChanged) {
            view.dispatch(
              state.tr.setMeta(instantRenderKey, newPluginState)
            )
          }
        }
      }
    },

    props: {
      // 装饰属性由 decorations.ts 处理
    }
  })
}

/**
 * 比较两个 Set 是否相等
 */
function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

/**
 * 手动设置块的渲染状态
 */
export function setBlockSourceMode(
  state: EditorState,
  blockPos: number,
  isSource: boolean
): Transaction {
  const pluginState = instantRenderKey.getState(state)
  if (!pluginState) return state.tr

  const newSourceBlocks = new Set(pluginState.sourceBlocks)
  if (isSource) {
    newSourceBlocks.add(blockPos)
  } else {
    newSourceBlocks.delete(blockPos)
  }

  const newPluginState = new InstantRenderState(
    newSourceBlocks,
    pluginState.lastSelectionBlock,
    false
  )

  return state.tr.setMeta(instantRenderKey, newPluginState)
}

/**
 * 切换块的渲染状态
 */
export function toggleBlockSourceMode(state: EditorState, blockPos: number): Transaction {
  const pluginState = instantRenderKey.getState(state)
  if (!pluginState) return state.tr

  const isCurrentlySource = pluginState.sourceBlocks.has(blockPos)
  return setBlockSourceMode(state, blockPos, !isCurrentlySource)
}
