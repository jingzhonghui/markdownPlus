import { requestDialog } from './dialog'

export type FileConflictAction = 'skip' | 'overwrite' | 'keep'

export async function requestFileConflictAction(conflicts: string[]): Promise<FileConflictAction | null> {
  const choice = await requestDialog({
    title: '发现重名文件',
    message: `目标文件夹中有 ${conflicts.length} 个重名项目，如何处理？`,
    buttons: [
      { label: '跳过', value: 0 },
      { label: '覆盖', value: 1, primary: true },
      { label: '都保留', value: 2 },
      { label: '取消', value: -1 }
    ]
  })
  if (choice === -1) return null
  return choice === 1 ? 'overwrite' : choice === 2 ? 'keep' : 'skip'
}
