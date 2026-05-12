/**
 * 即时渲染模式 - ProseMirror 编辑器工具集扩展
 * 在主 prosemirror 工具集基础上增加即时渲染支持
 */

// 即时渲染模块
export {
  createInstantPlugins,
  createInstantRenderPlugin,
  createInstantDecorationsPlugin,
  InstantRenderState,
  InstantRenderNodeView,
  HeadingNodeView,
  BlockquoteNodeView,
  CodeBlockNodeView,
  TableNodeView,
  ImageNodeView,
  ListItemNodeView,
  createInstantNodeViews,
  isBlockInSourceMode,
  setBlockSourceMode,
  toggleBlockSourceMode,
  getSelectionBlockPos,
  getSelectedBlockPositions,
  getMarkdownMarker,
  DECORATION_TYPES
} from './instant/index'

export type { BlockRenderState } from './instant/index'
