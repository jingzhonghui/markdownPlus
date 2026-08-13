import type { DocumentFormat, MdxDocument } from '../../types/mdx'

export type EditorMode = 'split' | 'source' | 'ir'

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
}
