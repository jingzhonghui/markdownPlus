/**
 * 即时渲染模式 - 核心状态管理
 * 跟踪每个块级节点的渲染状态（渲染态 vs 源码态）
 * 并在状态切换时自动转换内容（mark ↔ 原始 Markdown 语法）
 */
import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { Fragment } from 'prosemirror-model'
import { parseMarkdown } from '../markdown'

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
    if (node.isBlock && node.type.name !== 'doc') {
      const resolvedPos = state.doc.resolve(pos + 1)
      if (resolvedPos.depth === 1) {
        const blockStart = pos
        const blockEnd = pos + node.nodeSize
        if (blockStart < $to.pos && blockEnd > $from.pos) {
          blocks.push(pos)
        }
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

// ==================== 内容转换工具函数 ====================

/**
 * 序列化块的行内内容为 Markdown 文本
 * 直接遍历文本节点和标记，构建 Markdown 字符串
 * 不使用 serializeMarkdown（避免序列化器对特殊节点的报错）
 */
function serializeBlockContent(node: ProseMirrorNode): string {
  const parts: string[] = []

  node.content.forEach((child) => {
    if (child.isText) {
      let text = child.text || ''
      // 为文本上的标记添加 Markdown 符号
      const marks = child.marks || []

      // 收集需要添加的标记符号
      const markWrappers: Array<{ prefix: string; suffix: string; order: number }> = []
      for (const mark of marks) {
        const wrapper = MARK_WRAPPERS[mark.type.name]
        if (wrapper) {
          // 链接标记需要特殊处理 href
          if (mark.type.name === 'link') {
            const href = mark.attrs.href || ''
            const title = mark.attrs.title || ''
            let suffix = '](' + href
            if (title) suffix += ' "' + title + '"'
            suffix += ')'
            markWrappers.push({ prefix: '[', suffix, order: MARK_ORDER[mark.type.name] || 0 })
          } else {
            markWrappers.push({ ...wrapper, order: MARK_ORDER[mark.type.name] || 0 })
          }
        }
      }

      // 按优先级排序（外层标记优先）
      markWrappers.sort((a, b) => a.order - b.order)

      // 从外到内包裹
      for (const w of markWrappers) {
        text = w.prefix + text + w.suffix
      }

      parts.push(text)
    } else if (child.type.name === 'hard_break') {
      parts.push('\n')
    } else if (child.type.name === 'image') {
      const alt = child.attrs.alt || ''
      const src = child.attrs.src || ''
      const title = child.attrs.title || ''
      let img = '![' + alt + '](' + src
      if (title) img += ' "' + title + '"'
      img += ')'
      parts.push(img)
    }
  })

  return parts.join('')
}

/**
 * 行内标记对应的 Markdown 包裹符号
 */
const MARK_WRAPPERS: Record<string, { prefix: string; suffix: string }> = {
  bold: { prefix: '**', suffix: '**' },
  italic: { prefix: '*', suffix: '*' },
  strikethrough: { prefix: '~~', suffix: '~~' },
  code: { prefix: '`', suffix: '`' },
  link: { prefix: '[', suffix: ')' } // 链接的 suffix 在运行时动态生成
}

/**
 * 标记包裹顺序（数字越大越在内层）
 * 遵循 CommonMark 规范：***bold italic*** = bold 外层 + italic 内层
 */
const MARK_ORDER: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strikethrough: 3,
  code: 4
}

/**
 * 解析 Markdown 行内文本为 ProseMirror Fragment
 * 使用 parseMarkdown 解析文本，提取第一个块的内容
 */
function parseMarkdownInlineContent(text: string): Fragment | null {
  if (!text || !text.trim()) return null
  try {
    const doc = parseMarkdown(text)
    const firstBlock = doc.firstChild
    if (firstBlock && firstBlock.content.size > 0) {
      return firstBlock.content
    }
  } catch {
    // 解析失败，返回 null
  }
  return null
}

/**
 * 检查节点是否有行内标记（bold, italic 等）
 */
function hasInlineMarks(node: ProseMirrorNode): boolean {
  let found = false
  node.descendants((child) => {
    if (child.isText && child.marks.length > 0) {
      found = true
      return false
    }
  })
  return found
}

/**
 * 将块转换为源码态：将标记内容转换为原始 Markdown 文本
 * 递归处理嵌套块（如引用块内的段落）
 */
function convertBlockToSource(tr: Transaction, pos: number, node: ProseMirrorNode): void {
  // 跳过代码块（由 NodeView 自己管理）
  if (node.type.name === 'code_block') return
  // 跳过表格（始终渲染）
  if (node.type.name === 'table') return

  if (node.isTextblock) {
    // 叶子文本块：转换行内标记为 Markdown 文本
    if (hasInlineMarks(node)) {
      const mdText = serializeBlockContent(node)
      if (mdText) {
        const from = pos + 1
        const to = pos + node.nodeSize - 1
        tr.replaceWith(from, to, node.type.schema.text(mdText))
      }
    }
  } else if (node.isBlock && node.content.size > 0) {
    // 容器块（blockquote, list_item 等）：递归处理子块
    const children: Array<{ pos: number; node: ProseMirrorNode }> = []
    let offset = pos + 1
    node.content.forEach((child) => {
      children.push({ pos: offset, node: child })
      offset += child.nodeSize
    })
    // 从底部到顶部处理，避免位置偏移
    for (let i = children.length - 1; i >= 0; i--) {
      convertBlockToSource(tr, children[i].pos, children[i].node)
    }
  }
}

/**
 * 将块转换为渲染态：解析 Markdown 文本并应用标记
 * 递归处理嵌套块
 */
function convertBlockToRendered(tr: Transaction, pos: number, node: ProseMirrorNode): void {
  if (node.type.name === 'code_block') return
  if (node.type.name === 'table') return

  if (node.isTextblock) {
    if (node.content.size > 0) {
      const mdText = node.textContent
      const parsedContent = parseMarkdownInlineContent(mdText)
      if (parsedContent && parsedContent.size > 0) {
        const from = pos + 1
        const to = pos + node.nodeSize - 1
        tr.replaceWith(from, to, parsedContent)
      }
    }
  } else if (node.isBlock && node.content.size > 0) {
    const children: Array<{ pos: number; node: ProseMirrorNode }> = []
    let offset = pos + 1
    node.content.forEach((child) => {
      children.push({ pos: offset, node: child })
      offset += child.nodeSize
    })
    for (let i = children.length - 1; i >= 0; i--) {
      convertBlockToRendered(tr, children[i].pos, children[i].node)
    }
  }
}

// ==================== 插件 ====================

/**
 * 创建即时渲染核心插件
 * 监听选区变化，自动切换光标所在块的渲染状态
 * 在状态切换时自动转换内容
 */
export function createInstantRenderPlugin(): Plugin {
  return new Plugin<InstantRenderState>({
    key: instantRenderKey,

    state: {
      init(_config, state) {
        const selectedBlocks = getSelectedBlockPositions(state)
        const sourceBlocks = new Set<number>()
        for (const pos of selectedBlocks) {
          sourceBlocks.add(pos)
        }
        return new InstantRenderState(sourceBlocks, selectedBlocks[0] ?? null, false)
      },

      apply(tr: Transaction, prev: InstantRenderState, _oldState, newState): InstantRenderState {
        const meta = tr.getMeta(instantRenderKey)
        if (meta instanceof InstantRenderState) {
          return meta
        }

        // 跳过内容转换事务，避免干扰
        if (tr.getMeta('ir-content-conversion')) {
          return prev
        }

        const selectionChanged = tr.selectionSet
        if (!selectionChanged) {
          return prev
        }

        const selectedBlocks = getSelectedBlockPositions(newState)
        const newSourceBlocks = new Set<number>()
        for (const pos of selectedBlocks) {
          newSourceBlocks.add(pos)
        }

        if (setsEqual(prev.sourceBlocks, newSourceBlocks)) {
          return prev
        }

        return new InstantRenderState(
          newSourceBlocks,
          selectedBlocks[0] ?? null,
          false
        )
      }
    },

    appendTransaction(transactions, _oldState, newState) {
      // 防止无限循环：跳过自己的内容转换事务
      if (transactions.some(tr => tr.getMeta('ir-content-conversion'))) {
        return null
      }

      const newPluginState = instantRenderKey.getState(newState)
      if (!newPluginState) return null

      const tr = newState.tr.setMeta('ir-content-conversion', true)

      try {
        // 处理初始化触发
        const isInitTrigger = transactions.some(tr => tr.getMeta('ir-trigger-init'))
        if (isInitTrigger) {
          console.log('[InstantRender] ir-trigger-init, sourceBlocks:', [...newPluginState.sourceBlocks])
          const sorted = [...newPluginState.sourceBlocks].sort((a, b) => b - a)
          for (const pos of sorted) {
            const node = tr.doc.nodeAt(pos)
            console.log('[InstantRender] nodeAt(', pos, '):', node?.type?.name, node?.textContent?.slice(0, 30), 'hasInlineMarks:', node ? hasInlineMarks(node) : 'N/A')
            if (node) convertBlockToSource(tr, pos, node)
          }
          console.log('[InstantRender] tr.docChanged:', tr.docChanged)
          if (tr.docChanged) return tr
          return null
        }

        // 正常模式切换
        const oldPluginState = instantRenderKey.getState(_oldState)
        const oldSourceBlocks = oldPluginState?.sourceBlocks ?? new Set<number>()
        const newSourceBlocks = newPluginState.sourceBlocks

        // 找到进入和离开源码态的块
        const enteredSource = [...newSourceBlocks].filter(p => !oldSourceBlocks.has(p))
        const leftSource = [...oldSourceBlocks].filter(p => !newSourceBlocks.has(p))

        console.log('[InstantRender] mode change - entered:', enteredSource, 'left:', leftSource)

        if (enteredSource.length === 0 && leftSource.length === 0) return null

        // 从底部到顶部处理，避免位置偏移
        const changes = [
          ...enteredSource.map(pos => ({ pos, toSource: true })),
          ...leftSource.map(pos => ({ pos, toSource: false }))
        ].sort((a, b) => b.pos - a.pos)

        for (const change of changes) {
          const node = tr.doc.nodeAt(change.pos)
          if (!node) continue

          if (change.toSource) {
            convertBlockToSource(tr, change.pos, node)
          } else {
            convertBlockToRendered(tr, change.pos, node)
          }
        }

        if (tr.docChanged) return tr
      } catch (e) {
        console.error('[InstantRender] appendTransaction 错误:', e)
      }
      return null
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

/**
 * 导出内容转换函数供外部序列化使用
 */
export { convertBlockToRendered }
