import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_END_RE,
  ANALYSIS_START_RE,
  extractAnalysisBlock,
  hasAnalysisEnd,
  hasAnalysisStart
} from '../analysis-block'

describe('analysis-block tag matching', () => {
  it('matches the canonical tags', () => {
    expect(ANALYSIS_START_RE.test('<!-- analysis -->')).toBe(true)
    expect(ANALYSIS_END_RE.test('<!-- end-analysis -->')).toBe(true)
  })

  it('matches variant tags with spaces inside the closing dashes', () => {
    expect(ANALYSIS_START_RE.test('<!-- analysis -- >')).toBe(true)
    expect(ANALYSIS_END_RE.test('<!-- end-analysis -- >')).toBe(true)
  })

  it('matches compact and loose variants', () => {
    expect(ANALYSIS_START_RE.test('<!--analysis-->')).toBe(true)
    expect(ANALYSIS_START_RE.test('<!--  analysis  -->')).toBe(true)
    expect(ANALYSIS_END_RE.test('<!--end-analysis-->')).toBe(true)
    expect(ANALYSIS_END_RE.test('<!-- end analysis -->')).toBe(true)
  })

  it('does not match unrelated HTML comments', () => {
    expect(ANALYSIS_START_RE.test('<!-- notes -->')).toBe(false)
    expect(ANALYSIS_END_RE.test('<!-- summary -->')).toBe(false)
  })
})

describe('hasAnalysisStart / hasAnalysisEnd', () => {
  it('detects presence anywhere in the content', () => {
    expect(hasAnalysisStart('开头\n<!-- analysis -->\n分析')).toBe(true)
    expect(hasAnalysisEnd('分析\n<!-- end-analysis -- >\n回答')).toBe(true)
    expect(hasAnalysisStart('没有任何标记')).toBe(false)
    expect(hasAnalysisEnd('没有任何标记')).toBe(false)
  })
})

describe('extractAnalysisBlock', () => {
  it('splits canonical tags into analysis and answer', () => {
    const block = extractAnalysisBlock('<!-- analysis -->\n已找到记录。\n<!-- end-analysis -->\n**正式回答**')
    expect(block.analysis).toBe('已找到记录。')
    expect(block.answer).toBe('**正式回答**')
  })

  it('splits variant opening tag with a space inside closing dashes', () => {
    const block = extractAnalysisBlock(
      '<!-- analysis -- >\n已找到记录。\n<!-- end-analysis -->\n正式回答'
    )
    expect(block.analysis).toBe('已找到记录。')
    expect(block.answer).toBe('正式回答')
    expect(block.analysis).not.toContain('<!-- analysis')
  })

  it('keeps text emitted before the opening tag inside the analysis', () => {
    const block = extractAnalysisBlock(
      '当前日期是 2026-08-20。\n<!-- analysis -->\n当前日期为 2026-08-20。\n<!-- end-analysis -->\n根据记录回答如下。'
    )
    expect(block.analysis).toBe('当前日期是 2026-08-20。\n当前日期为 2026-08-20。')
    expect(block.answer).toBe('根据记录回答如下。')
    expect(block.analysis).not.toContain('<!-- analysis -->')
  })

  it('keeps all text before the end tag when no opening tag exists', () => {
    const block = extractAnalysisBlock('过程文本\n<!-- end-analysis -->\n回答')
    expect(block.analysis).toBe('过程文本')
    expect(block.answer).toBe('回答')
  })

  it('returns everything as the answer when no tags exist', () => {
    const block = extractAnalysisBlock('纯回答内容')
    expect(block.analysis).toBe('')
    expect(block.answer).toBe('纯回答内容')
  })

  it('strips the tag markers from analysis when text follows the opening tag', () => {
    const block = extractAnalysisBlock('<!-- analysis -->\n分析A\n<!-- end-analysis -->\n回答A')
    expect(block.analysis).toBe('分析A')
    expect(block.analysis).not.toContain('analysis')
  })

  it('merges multiple analysis blocks and keeps only the final answer', () => {
    const block = extractAnalysisBlock(
      '<!-- analysis -->\n第一次分析。\n<!-- end-analysis --><!-- analysis -->\n第二次分析。\n<!-- end-analysis -->\n\n正式回答内容。'
    )
    expect(block.analysis).toBe('第一次分析。\n第二次分析。')
    expect(block.answer).toBe('正式回答内容。')
    expect(block.analysis).not.toContain('<!-- analysis')
    expect(block.analysis).not.toContain('<!-- end-analysis')
    expect(block.answer).not.toContain('<!-- end-analysis')
  })

  it('merges multiple blocks when leading text sits before the first block', () => {
    const block = extractAnalysisBlock(
      '当前日期是 2026-08-20。\n<!-- analysis -->\n分析A。\n<!-- end-analysis --><!-- analysis -->\n分析B。\n<!-- end-analysis -->\n根据记录回答。'
    )
    expect(block.analysis).toBe('当前日期是 2026-08-20。\n分析A。\n分析B。')
    expect(block.answer).toBe('根据记录回答。')
  })
})
