const CJK_NUM: Record<string, number> = {
  '〇': 0, '零': 0,
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
}

export interface SortableEntry {
  name: string
  isDirectory: boolean
}

export function compareEntryNames(a: string, b: string): number {
  const aL = a.toLowerCase()
  const bL = b.toLowerCase()
  let i = 0, j = 0
  while (i < aL.length && j < bL.length) {
    const aD = aL[i] >= '0' && aL[i] <= '9'
    const bD = bL[j] >= '0' && bL[j] <= '9'
    if (aD && bD) {
      let an = 0
      while (i < aL.length && aL[i] >= '0' && aL[i] <= '9') an = an * 10 + +aL[i++]
      let bn = 0
      while (j < bL.length && bL[j] >= '0' && bL[j] <= '9') bn = bn * 10 + +bL[j++]
      if (an !== bn) return an - bn
    } else if (aD) return -1
    else if (bD) return 1
    else {
      const aN = CJK_NUM[aL[i]]
      const bN = CJK_NUM[bL[j]]
      if (aN !== undefined && bN !== undefined) {
        if (aN !== bN) return aN - bN
      } else if (aN !== undefined) return -1
      else if (bN !== undefined) return 1
      else if (aL[i] !== bL[j]) return aL[i] < bL[j] ? -1 : 1
      i++
      j++
    }
  }
  if (i < aL.length) return 1
  if (j < bL.length) return -1
  return 0
}

export function compareFolderEntries(a: SortableEntry, b: SortableEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return compareEntryNames(a.name, b.name)
}