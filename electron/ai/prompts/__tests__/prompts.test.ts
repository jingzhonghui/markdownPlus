import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_SUMMARY_SYSTEM_PROMPT,
  CONVERSATION_TITLE_SYSTEM_PROMPT,
  CAPABILITY_PROBE_SYSTEM_PROMPT
} from '../index'

describe('workspace summary prompt', () => {
  it('is non-empty and asks for a structured file-tree based summary', () => {
    expect(WORKSPACE_SUMMARY_SYSTEM_PROMPT.length).toBeGreaterThan(0)
    expect(WORKSPACE_SUMMARY_SYSTEM_PROMPT).toContain('工作区内容概要助手')
    expect(WORKSPACE_SUMMARY_SYSTEM_PROMPT).toContain('文件树清单')
    expect(WORKSPACE_SUMMARY_SYSTEM_PROMPT).toContain('结构化概要')
    expect(WORKSPACE_SUMMARY_SYSTEM_PROMPT).toContain('60 行以内')
  })
})

describe('conversation title prompt', () => {
  it('is a short title generator limited to 20 characters', () => {
    expect(CONVERSATION_TITLE_SYSTEM_PROMPT).toContain('标题生成助手')
    expect(CONVERSATION_TITLE_SYSTEM_PROMPT).toContain('20 个字')
    expect(CONVERSATION_TITLE_SYSTEM_PROMPT).not.toContain('```')
  })
})

describe('capability probe prompt', () => {
  it('requires the tool call for capability detection', () => {
    expect(CAPABILITY_PROBE_SYSTEM_PROMPT).toContain('能力探测助手')
    expect(CAPABILITY_PROBE_SYSTEM_PROMPT).toContain('调用提供的工具')
  })
})
