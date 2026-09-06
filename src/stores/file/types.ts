import type { DocumentFormat, MdxDocument } from '../../types/mdx'

export type EditorMode = 'split' | 'source' | 'ir' | 'plain'

export interface FileInfo {
  path: string
  name: string
  modified: boolean
  format: DocumentFormat
}

export interface FolderItem {
  name: string
  path: string
  isDirectory: boolean
}

/** 最近文件列表项 */
export interface RecentItem {
  path: string
  type: 'file' | 'folder'
}

/** 文件树节点 */
export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  isExpanded: boolean
  isLoading: boolean
  children: FileTreeNode[]
}

export interface TabInfo {
  id: string
  fileInfo: FileInfo | null
  document: MdxDocument | null
  content: string
  revision: number
  /** 图片文件（format='image'）的 Data URL，用于只读查看 */
  imageDataUrl?: string
  /** PDF 文件（format='pdf'）的 base64 内容，用于只读查看 */
  pdfBase64?: string
}

/**
 * 归一化的编辑器选区快照（Markdown 偏移）。
 * 由 SourceEditor（CodeMirror 直接偏移）与 IrEditor（ProseMirror 映射后校验）发布。
 */
export interface EditorSelectionSnapshot {
  tabId: string
  from: number
  to: number
  cursor: number
  text: string
}
