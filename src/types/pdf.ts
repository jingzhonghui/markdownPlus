export interface PdfSource {
  filePath: string
  fileName: string
  title: string
  format: 'mdx' | 'markdown'
  content: string
  images: Record<string, string>
}

export interface PdfBatchFailure {
  file: string
  error: string
}

export interface PdfBatchProgress {
  visible: boolean
  running: boolean
  total: number
  completed: number
  successCount: number
  currentFile: string
  failures: PdfBatchFailure[]
}
