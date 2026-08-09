/**
 * ProseMirror 输入规则（Markdown 语法自动转换）
 * 类似 Typora 的实时 Markdown 编辑体验
 */
import { NodeType, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import {
  InputRule,
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule
} from 'prosemirror-inputrules'

/**
 * 创建标题输入规则 (# 标题)
 */
function headingRule(nodeType: NodeType, maxLevel: number): InputRule {
  return textblockTypeInputRule(
    new RegExp('^(#{1,' + maxLevel + '})\\s$'),
    nodeType,
    (match) => ({ level: match[1].length })
  )
}

/**
 * 创建代码块输入规则 (```)
 */
function codeBlockRule(nodeType: NodeType): InputRule {
  return textblockTypeInputRule(
    /^```(\w+)?\s$/,
    nodeType,
    (match) => ({ language: match[1] || '' })
  )
}

/**
 * 创建引用块输入规则 (>)
 */
function blockquoteRule(nodeType: NodeType): InputRule {
  return wrappingInputRule(/^>\s$/, nodeType)
}

/**
 * 创建有序列表输入规则 (1.)
 */
function orderedListRule(nodeType: NodeType): InputRule {
  return wrappingInputRule(
    /^(\d+)\.\s$/,
    nodeType,
    (match) => ({ order: +match[1] }),
    (match, node) => node.childCount + node.attrs.order === +match[1]
  )
}

/**
 * 创建无序列表输入规则 (- 或 *)
 */
function bulletListRule(nodeType: NodeType): InputRule {
  return wrappingInputRule(/^\s*([-+*])\s$/, nodeType)
}

/**
 * 创建任务列表输入规则 (- [ ] 或 - [x])
 */
function taskListRule(nodeType: NodeType, itemType: NodeType): InputRule {
  return new InputRule(
    /^\s*([-+*])\s\[(x|X| )\]\s$/,
    (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
      const { tr } = state
      const checked = match[2].toLowerCase() === 'x'

      // 删除匹配文本
      tr.delete(start, end)

      // 包装为任务列表
      const listItem = itemType.create({ checked }, nodeType.createAndFill()!.content)
      const list = nodeType.create(null, listItem)

      tr.replaceSelectionWith(list)
      return tr
    }
  )
}

/**
 * 创建水平分割线输入规则 (--- 或 *** 或 ___)
 */
function horizontalRuleRule(nodeType: NodeType): InputRule {
  return new InputRule(
    /^(?:---|___|\*\*\*)\s$/,
    (state, _match, start, end) => {
      const { tr } = state
      tr.replaceWith(start, end, nodeType.create())
      return tr
    }
  )
}

/**
 * 创建行内代码输入规则 (`code`)
 */
function inlineCodeRule(markType: any): InputRule {
  return new InputRule(
    /`([^`]+)`$/,
    (state, match, start, end) => {
      const { tr } = state
      const text = match[1]
      const from = start
      const to = end

      // 删除匹配文本并插入带标记的文本
      tr.delete(from, to)
      const mark = markType.create()
      tr.insertText(text, from)
      tr.addMark(from, from + text.length, mark)
      return tr
    }
  )
}

/**
 * 创建粗体输入规则 (**text**)
 */
function boldRule(markType: any): InputRule {
  return new InputRule(
    /\*\*([^*]+)\*\*$/,
    (state, match, start, end) => {
      const { tr } = state
      const text = match[1]

      tr.delete(start, end)
      const mark = markType.create()
      tr.insertText(text, start)
      tr.addMark(start, start + text.length, mark)
      return tr
    }
  )
}

/**
 * 创建斜体输入规则 (*text*)
 */
function italicRule(markType: any): InputRule {
  return new InputRule(
    /(?<!\*)\*([^*]+)\*(?!\*)$/,
    (state, match, start, end) => {
      const { tr } = state
      const text = match[1]

      tr.delete(start, end)
      const mark = markType.create()
      tr.insertText(text, start)
      tr.addMark(start, start + text.length, mark)
      return tr
    }
  )
}

/**
 * 创建删除线输入规则 (~~text~~)
 */
function strikethroughRule(markType: any): InputRule {
  return new InputRule(
    /~~([^~]+)~~$/,
    (state, match, start, end) => {
      const { tr } = state
      const text = match[1]

      tr.delete(start, end)
      const mark = markType.create()
      tr.insertText(text, start)
      tr.addMark(start, start + text.length, mark)
      return tr
    }
  )
}

/**
 * 创建链接输入规则 ([text](url))
 */
function linkRule(markType: any): InputRule {
  return new InputRule(
    /\[([^\]]+)\]\(([^)]+)\)$/,
    (state, match, start, end) => {
      const { tr } = state
      const text = match[1]
      const href = match[2]

      tr.delete(start, end)
      const mark = markType.create({ href })
      tr.insertText(text, start)
      tr.addMark(start, start + text.length, mark)
      return tr
    }
  )
}

/**
 * 构建所有输入规则
 */
export function buildInputRules(schema: Schema) {
  const rules: InputRule[] = [
    // 标题 #
    headingRule(schema.nodes.heading, 4),

    // 代码块 ```
    codeBlockRule(schema.nodes.code_block),

    // 引用块 >
    blockquoteRule(schema.nodes.blockquote),

    // 有序列表 1.
    orderedListRule(schema.nodes.ordered_list),

    // 无序列表 - / * / +
    bulletListRule(schema.nodes.bullet_list),

    // 水平分割线 ---
    horizontalRuleRule(schema.nodes.horizontal_rule),

    // 行内代码 `code`
    inlineCodeRule(schema.marks.code),

    // 粗体 **text**
    boldRule(schema.marks.bold),

    // 斜体 *text*
    italicRule(schema.marks.italic),

    // 删除线 ~~text~~
    strikethroughRule(schema.marks.strikethrough),

    // 链接 [text](url)
    linkRule(schema.marks.link)
  ]

  return inputRules({ rules })
}

/**
 * 导出单个规则函数
 */
export {
  headingRule,
  codeBlockRule,
  blockquoteRule,
  orderedListRule,
  bulletListRule,
  taskListRule,
  horizontalRuleRule
}
