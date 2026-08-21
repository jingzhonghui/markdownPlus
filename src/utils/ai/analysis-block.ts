export const ANALYSIS_START_RE = /<!--\s*analysis\s*--\s*>/i
export const ANALYSIS_END_RE = /<!--\s*end[-\s]*analysis\s*--\s*>/i

export interface AnalysisBlock {
  analysis: string
  answer: string
}

export function extractAnalysisBlock(content: string): AnalysisBlock {
  const endMatch = matchLast(content, ANALYSIS_END_RE)
  if (!endMatch || endMatch.index === undefined) {
    return { analysis: '', answer: content }
  }

  const endIdx = endMatch.index
  const raw = content.slice(0, endIdx)

  const paragraphs = raw
    .split(ANALYSIS_START_RE)
    .join('\n')
    .split(ANALYSIS_END_RE)
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return {
    analysis: paragraphs.join('\n'),
    answer: content.slice(endIdx + endMatch[0].length).trim()
  }
}

function matchLast(content: string, re: RegExp): RegExpMatchArray | null {
  const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let last: RegExpMatchArray | null = null
  for (const match of content.matchAll(globalRe)) {
    last = match
  }
  return last
}

export function hasAnalysisStart(content: string): boolean {
  return ANALYSIS_START_RE.test(content)
}

export function hasAnalysisEnd(content: string): boolean {
  return ANALYSIS_END_RE.test(content)
}

export function findIndex(content: string, re: RegExp): number {
  const match = content.match(re)
  return match && match.index !== undefined ? match.index : -1
}
