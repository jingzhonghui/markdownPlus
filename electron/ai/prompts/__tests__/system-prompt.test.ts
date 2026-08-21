import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT } from '../markdown-plus'

describe('SYSTEM_PROMPT source rules', () => {
  it('contains 20 source-safe principles covering workspace exploration', () => {
    expect(SYSTEM_PROMPT.match(/^\d+\./gm)).toHaveLength(20)
    expect(SYSTEM_PROMPT).toContain('list_workspace_root')
    expect(SYSTEM_PROMPT).toContain('read_workspace_directory')
    expect(SYSTEM_PROMPT).toContain('search_workspace_files')
    expect(SYSTEM_PROMPT).toContain('read_workspace_file')
    expect(SYSTEM_PROMPT).toContain('read_web_url')
    expect(SYSTEM_PROMPT).toContain('read_local_file')
    expect(SYSTEM_PROMPT).toContain('get_current_datetime')
    expect(SYSTEM_PROMPT).toContain('优先调用 search_workspace_files')
    expect(SYSTEM_PROMPT).toContain('无关的目录')
    expect(SYSTEM_PROMPT).toContain('完全一致')
    expect(SYSTEM_PROMPT).toContain('不可信数据')
    expect(SYSTEM_PROMPT).toContain('返回 completed 后')
    expect(SYSTEM_PROMPT).toContain('<!-- analysis -->')
    expect(SYSTEM_PROMPT).toContain('<!-- end-analysis -->')
    expect(SYSTEM_PROMPT).toContain('自由调用工具进行探索')
    expect(SYSTEM_PROMPT).not.toMatch(/materialId|材料 ID|列出材料|按块|chunk/i)
    expect(SYSTEM_PROMPT).not.toContain('read_current_document')
  })

  it('instructs judging relevance from the workspace summary before searching', () => {
    expect(SYSTEM_PROMPT).toContain('工作区概要')
    expect(SYSTEM_PROMPT).toContain('判断问题是否与工作区内容相关')
    expect(SYSTEM_PROMPT).toMatch(/相关才调用|才调用 search_workspace_files/)
  })

  it('instructs asking the user before answering from general knowledge when nothing is found', () => {
    expect(SYSTEM_PROMPT).toMatch(/未找到.*相关.*文档|未找到.*相关的内容/)
    expect(SYSTEM_PROMPT).toMatch(/是否基于 LLM 现有知识回答/)
    expect(SYSTEM_PROMPT).toMatch(/等待用户确认|用户确认|确认继续/)
  })

  it('instructs not to search again after the user chooses general knowledge', () => {
    expect(SYSTEM_PROMPT).toMatch(/不再.*检索|不再重复.*搜索|直接回答/)
  })
})
