export type FileIconType =
  | 'folder'
  | 'markdown'
  | 'pdf'
  | 'image'
  | 'archive'
  | 'data'
  | 'code'
  | 'text'
  | 'file'

const EXTENSION_TYPES: Record<FileIconType, readonly string[]> = {
  folder: [],
  markdown: ['md', 'mdx', 'markdown'],
  pdf: ['pdf'],
  image: ['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
  archive: ['7z', 'gz', 'rar', 'tar', 'zip'],
  data: ['json', 'toml', 'xml', 'yaml', 'yml'],
  code: ['c', 'cpp', 'css', 'go', 'h', 'html', 'java', 'js', 'jsx', 'py', 'rs', 'scss', 'sh', 'sql', 'ts', 'tsx', 'vue'],
  text: ['log', 'txt'],
  file: []
}

export function getFileIconType(name: string, isDirectory: boolean): FileIconType {
  if (isDirectory) return 'folder'

  const extension = name.split('.').pop()?.toLowerCase()
  if (!extension || extension === name.toLowerCase()) return 'file'

  for (const [type, extensions] of Object.entries(EXTENSION_TYPES) as [FileIconType, readonly string[]][]) {
    if (extensions.includes(extension)) return type
  }

  return 'file'
}

export function getFileIconName(name: string, isDirectory: boolean): string {
  const type = getFileIconType(name, isDirectory)
  const icons: Record<FileIconType, string> = {
    folder: 'IconFolder',
    markdown: 'IconFileText',
    pdf: 'IconFileTypePdf',
    image: 'IconPhoto',
    archive: 'IconFileTypeZip',
    data: 'IconBraces',
    code: 'IconFileCode',
    text: 'IconFileDescription',
    file: 'IconFile'
  }

  return icons[type]
}
