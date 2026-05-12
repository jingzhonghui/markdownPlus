/**
 * 即时渲染模式 - Decoration 系统
 * 负责将源码态的块渲染为带 Markdown 标记符的样式
 * 以及管理渲染态下标记符的隐藏
 */
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'
import { Plugin } from 'prosemirror-state'
import { instantRenderKey } from './state'

/**
 * 装饰类型常量
 */
export const DECORATION_TYPES = {
  /** 源码态：整个块显示 Markdown 标记 */
  SOURCE_MODE: 'ir-source-mode',
  /** 渲染态：隐藏 Markdown 标记符 */
  RENDERED_MODE: 'ir-rendered-mode',
  /** 隐藏标记符的装饰 */
  HIDE_MARKER: 'ir-hide-marker',
  /** 块级节点边框指示 */
  BLOCK_BORDER: 'ir-block-border'
} as const

/**
 * 创建源码态的装饰
 * 为处于源码态的块添加 CSS 类和视觉指示
 */
function createSourceModeDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = []
  const pluginState = instantRenderKey.getState(state)

  if (!pluginState) return DecorationSet.empty

  const sourceBlocks = pluginState.sourceBlocks

  // 为每个源码态的块添加装饰
  state.doc.descendants((node, pos) => {
    if (!node.isBlock || state.doc.resolve(pos).depth !== 1) return

    if (sourceBlocks.has(pos)) {
      // 添加源码态样式
      const deco = Decoration.node(pos, pos + node.nodeSize, {
        class: DECORATION_TYPES.SOURCE_MODE,
        'data-ir-source': 'true'
      })
      decorations.push(deco)
    } else {
      // 添加渲染态样式（标记符隐藏）
      const deco = Decoration.node(pos, pos + node.nodeSize, {
        class: DECORATION_TYPES.RENDERED_MODE,
        'data-ir-rendered': 'true'
      })
      decorations.push(deco)
    }
  })

  return DecorationSet.create(state.doc, decorations)
}

/**
 * 创建即时渲染装饰插件
 */
export function createInstantDecorationsPlugin(): Plugin {
  return new Plugin({
    state: {
      init(_, state) {
        return createSourceModeDecorations(state)
      },
      apply(tr, oldDecorations, oldState, newState) {
        // 检查是否需要更新装饰
        const pluginState = instantRenderKey.getState(newState)
        if (!pluginState) return oldDecorations.map(tr.mapping, tr.doc)

        // 如果选区或文档变化，重新计算装饰
        if (tr.selectionSet || tr.docChanged || tr.getMeta(instantRenderKey)) {
          return createSourceModeDecorations(newState)
        }

        return oldDecorations.map(tr.mapping, tr.doc)
      }
    },
    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

/**
 * 获取节点对应的 Markdown 标记符前缀
 */
export function getMarkdownMarker(nodeType: string, attrs?: Record<string, unknown>): string {
  switch (nodeType) {
    case 'heading':
      return '#'.repeat((attrs?.level as number) || 1) + ' '
    case 'blockquote':
      return '> '
    case 'code_block':
      return '```' + (attrs?.language || '') + '\n'
    case 'bullet_list':
      return '- '
    case 'ordered_list':
      return '1. '
    case 'task_list':
      return '- [ ] '
    case 'horizontal_rule':
      return '---'
    default:
      return ''
  }
}

/**
 * 获取列表项的 Markdown 标记符
 */
export function getListItemMarker(nodeType: string, index: number, attrs?: Record<string, unknown>): string {
  switch (nodeType) {
    case 'list_item':
      return '- '
    case 'task_item': {
      const checked = attrs?.checked ? 'x' : ' '
      return `- [${checked}] `
    }
    default:
      return ''
  }
}
