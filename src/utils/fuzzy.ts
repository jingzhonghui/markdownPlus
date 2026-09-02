/**
 * fzf 风格的模糊匹配：字符子序列匹配 + 评分排序
 */

export interface FuzzyMatchResult {
  /** 匹配得分，越高越好 */
  score: number
  /** 命中字符在文本中的索引（有序） */
  positions: number[]
}

export interface SearchableFile {
  name: string
  path: string
}

export interface FileSearchResult {
  file: SearchableFile
  score: number
  /** 命中位置（相对参与匹配的文本：文件名命中时相对 name，路径命中时相对 path） */
  positions: number[]
}

/** 前一字符为这些分隔符时视为词首 */
const WORD_SEPARATORS = new Set(['/', '\\', '-', '_', '.', ' '])

/** 匹配基础分 */
const SCORE_BASE = 1
/** 连续命中额外加分 */
const SCORE_CONSECUTIVE = 2
/** 词首命中额外加分 */
const SCORE_WORD_START = 3
/** 文件名命中相对路径命中的加权倍数 */
const NAME_WEIGHT = 2

/**
 * 判断 query 是否为 text 的字符子序列；是则返回得分与命中位置，否则返回 null。
 * 大小写不敏感；空查询返回零分空命中。
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatchResult | null {
  if (query.length === 0) {
    return { score: 0, positions: [] }
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  const positions: number[] = []
  let score = 0
  let queryIndex = 0

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] !== lowerQuery[queryIndex]) continue

    score += SCORE_BASE
    // 连续命中加分
    if (positions.length > 0 && i === positions[positions.length - 1] + 1) {
      score += SCORE_CONSECUTIVE
    }
    // 词首命中加分（文本开头或分隔符之后）
    if (i === 0 || WORD_SEPARATORS.has(text[i - 1])) {
      score += SCORE_WORD_START
    }
    positions.push(i)
    queryIndex++
  }

  if (queryIndex < lowerQuery.length) return null
  return { score, positions }
}

/**
 * 在文件列表中模糊搜索：文件名命中优先于路径命中，各自按得分降序。
 * 空查询按原始顺序返回全部文件。
 */
export function searchFiles(files: SearchableFile[], query: string): FileSearchResult[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return files.map((file) => ({ file, score: 0, positions: [] }))
  }

  const results: FileSearchResult[] = []
  for (const file of files) {
    const nameMatch = fuzzyMatch(trimmed, file.name)
    if (nameMatch) {
      results.push({
        file,
        score: nameMatch.score * NAME_WEIGHT + 1,
        positions: nameMatch.positions
      })
      continue
    }
    const pathMatch = fuzzyMatch(trimmed, file.path)
    if (pathMatch) {
      results.push({ file, score: pathMatch.score, positions: pathMatch.positions })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results
}
