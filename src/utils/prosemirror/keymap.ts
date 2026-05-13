/**
 * ProseMirror 键盘快捷键和命令
 */
import { Schema, NodeType, MarkType } from 'prosemirror-model'
import {
  EditorState,
  Transaction,
  Selection,
  TextSelection,
  Command
} from 'prosemirror-state'
import {
  toggleMark,
  wrapIn,
  setBlockType,
  chainCommands,
  exitCode,
  joinDown,
  joinUp,
  lift,
  selectParentNode
} from 'prosemirror-commands'
import {
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem
} from 'prosemirror-schema-list'
import { undo, redo } from 'prosemirror-history'
import { markdownSchema } from './schema'

/**
 * 切换标题级别的命令
 */
function toggleHeading(level: number): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    const nodeType = state.schema.nodes.heading
    const paragraph = state.schema.nodes.paragraph

    // 检查当前选区是否已经是目标级别的标题
    let isCurrentHeading = false
    state.doc.nodesBetween($from.pos, $to.pos, (node) => {
      if (node.type === nodeType && node.attrs.level === level) {
        isCurrentHeading = true
        return false
      }
    })

    if (isCurrentHeading) {
      // 切换回段落
      return setBlockType(paragraph)(state, dispatch)
    } else {
      // 设置为目标级别标题
      return setBlockType(nodeType, { level })(state, dispatch)
    }
  }
}

/**
 * 切换任务列表项的完成状态
 */
function toggleTaskChecked(): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const node = $from.node($from.depth)

    if (node.type.name === 'task_item') {
      if (dispatch) {
        const tr = state.tr
        const checked = !node.attrs.checked
        tr.setNodeMarkup($from.before($from.depth), undefined, { ...node.attrs, checked })
        dispatch(tr)
      }
      return true
    }
    return false
  }
}

/**
 * 在光标处插入硬换行
 */
function insertHardBreak(): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const br = state.schema.nodes.hard_break

    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(br.create()))
    }
    return true
  }
}

/**
 * 插入水平分割线
 */
function insertHorizontalRule(): Command {
  return (state, dispatch) => {
    const hr = state.schema.nodes.horizontal_rule

    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(hr.create())
      dispatch(tr)
    }
    return true
  }
}

/**
 * 创建链接的命令
 * 如果选中了文本，将其转换为链接；否则插入新链接
 */
function insertLink(href = '', title = ''): Command {
  return (state, dispatch) => {
    const { $from, $to, empty } = state.selection

    if (empty) {
      // 没有选中文本，插入链接文本
      const linkMark = state.schema.marks.link.create({ href, title })
      const text = state.schema.text(href || '链接', [linkMark])

      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(text))
      }
      return true
    } else {
      // 有选中文本，添加链接标记
      return toggleMark(state.schema.marks.link, { href, title })(state, dispatch)
    }
  }
}

/**
 * 插入图片
 */
function insertImage(src = '', alt = '', title = ''): Command {
  return (state, dispatch) => {
    const imageNode = state.schema.nodes.image.create({ src, alt, title })

    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(imageNode))
    }
    return true
  }
}

/**
 * 切换到行内代码
 */
function toggleCode(): Command {
  return toggleMark(markdownSchema.marks.code)
}

/**
 * 切换删除线
 */
function toggleStrikethrough(): Command {
  return toggleMark(markdownSchema.marks.strikethrough)
}

/**
 * 自定义列表分割逻辑
 * 处理任务列表和普通列表的分割
 */
function customSplitListItem(itemType: NodeType): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection

    // 检查是否在列表项中
    const depth = $from.depth
    const parent = $from.node(depth)

    if (parent.type.name === 'list_item' || parent.type.name === 'task_item') {
      // 使用默认分割
      return splitListItem(itemType)(state, dispatch)
    }

    return false
  }
}

/**
 * 回车键处理
 * 在任务列表中点击复选框时切换状态
 */
function handleEnter(schema: Schema): Command {
  return chainCommands(
    exitCode,
    (state, dispatch) => {
      const { $from } = state.selection
      const depth = $from.depth
      const parent = $from.node(depth)

      // 处理代码块中的回车
      if (parent.type.name === 'code_block') {
        if (dispatch) {
          dispatch(state.tr.insertText('\n'))
        }
        return true
      }

      return false
    }
  )
}

/**
 * Tab 键处理 - 缩进/反缩进列表
 */
function handleTab(schema: Schema): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = $from.depth
    const parent = $from.node(depth)

    if (parent.type.name === 'list_item' || parent.type.name === 'task_item') {
      return sinkListItem(schema.nodes.list_item)(state, dispatch)
    }
    return false
  }
}

function handleShiftTab(schema: Schema): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = $from.depth
    const parent = $from.node(depth)

    if (parent.type.name === 'list_item' || parent.type.name === 'task_item') {
      return liftListItem(schema.nodes.list_item)(state, dispatch)
    }
    return false
  }
}

/**
 * 键盘快捷键映射表
 */
export function buildKeymap(schema: Schema): Record<string, Command> {
  const keymap: Record<string, Command> = {
    // 撤销/重做
    'Mod-z': undo,
    'Mod-Shift-z': redo,
    'Mod-y': redo,

    // 基本格式
    'Mod-b': (state, dispatch) => {
      return toggleMark(schema.marks.bold)(state, dispatch)
    },
    'Mod-i': (state, dispatch) => {
      return toggleMark(schema.marks.italic)(state, dispatch)
    },
    'Mod-`': (state, dispatch) => {
      return toggleCode()(state, dispatch)
    },
    'Mod-Shift-x': (state, dispatch) => {
      return toggleStrikethrough()(state, dispatch)
    },

    // 标题 (Ctrl+1 ~ Ctrl+4)
    'Mod-1': toggleHeading(1),
    'Mod-2': toggleHeading(2),
    'Mod-3': toggleHeading(3),
    'Mod-4': toggleHeading(4),
    'Mod-0': setBlockType(schema.nodes.paragraph),

    // 列表
    'Shift-Ctrl-8': wrapInList(schema.nodes.bullet_list),
    'Shift-Ctrl-9': wrapInList(schema.nodes.ordered_list),
    'Shift-Ctrl-[': liftListItem(schema.nodes.list_item),
    'Shift-Ctrl-]': sinkListItem(schema.nodes.list_item),

    // 引用块
    'Shift-Ctrl->': wrapIn(schema.nodes.blockquote),

    // 代码块
    'Shift-Ctrl-\\': setBlockType(schema.nodes.code_block),

    // 链接和图片
    'Mod-k': insertLink(),
    'Mod-Shift-k': insertImage(),

    // 水平分割线
    'Mod-Shift--': insertHorizontalRule,

    // 导航
    'Alt-ArrowUp': joinUp,
    'Alt-ArrowDown': joinDown,
    'Mod-BracketLeft': lift,
    'Escape': selectParentNode,

    // 回车
    'Enter': chainCommands(
      customSplitListItem(schema.nodes.list_item),
      customSplitListItem(schema.nodes.task_item),
      handleEnter(schema)
    ),

    // Tab 缩进
    'Tab': handleTab(schema),
    'Shift-Tab': handleShiftTab(schema),

    // 硬换行 (Shift+Enter)
    'Shift-Enter': insertHardBreak()
  }

  // Mac 兼容
  if (typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)) {
    keymap['Ctrl-h'] = toggleMark(schema.marks.strikethrough)
  }

  return keymap
}

/**
 * 导出命令函数
 */
export {
  toggleHeading,
  toggleTaskChecked,
  insertHardBreak,
  insertHorizontalRule,
  insertLink,
  insertImage,
  toggleCode,
  toggleStrikethrough,
  customSplitListItem,
  handleTab,
  handleShiftTab
}
