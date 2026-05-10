/**
 * ProseMirror 编辑器工具集
 * 统一导出所有与 ProseMirror 相关的工具和组件
 */

// Schema
export { markdownSchema, getHeadingLevel } from './schema'
export type { NodeSpec, MarkSpec } from 'prosemirror-model'

// Markdown 转换
export { parseMarkdown, serializeMarkdown, markdownParser, markdownSerializer } from './markdown'

// 键盘快捷键和命令
export {
  buildKeymap,
  toggleHeading,
  toggleTaskChecked,
  insertHardBreak,
  insertHorizontalRule,
  insertLink,
  insertImage,
  toggleCode,
  toggleStrikethrough
} from './keymap'

// 输入规则
export { buildInputRules } from './inputrules'

// 插件
export {
  createPlugins,
  createDocumentChangePlugin,
  createImageClickPlugin,
  createDragDropPlugin,
  createPlaceholderPlugin,
  selectionPlugin,
  taskListClickPlugin,
  pluginsKey,
  history,
  keymap,
  dropCursor,
  gapCursor,
  baseKeymap
} from './plugins'

// ProseMirror 核心类型重导出
export type { EditorState, Transaction, Selection } from 'prosemirror-state'
export type { Node as ProseMirrorNode } from 'prosemirror-model'
export { EditorView } from 'prosemirror-view'
