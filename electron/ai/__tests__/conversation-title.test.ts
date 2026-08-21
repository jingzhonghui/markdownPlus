import { describe, expect, it, vi } from 'vitest'
import { generateConversationTitle } from '../conversation-title'
import type { LlmProvider } from '../provider'
import type { AiRuntimeConfig } from '../../../shared/ai/types'

const config: AiRuntimeConfig = {
  baseUrl: 'https://api.example.com/v1',
  model: 'demo',
  apiKey: 'secret',
  temperature: 0.7
}

function makeProvider(summarize: (text: string) => Promise<string>): LlmProvider {
  return {
    run: vi.fn() as never,
    testConnection: vi.fn() as never,
    summarize: vi.fn(summarize)
  } as unknown as LlmProvider
}

describe('generateConversationTitle', () => {
  it('returns the provider title', async () => {
    const title = await generateConversationTitle(
      makeProvider(async () => '文档总结'),
      config,
      '请总结'
    )
    expect(title).toBe('文档总结')
  })

  it('returns null when the provider returns an empty string', async () => {
    const title = await generateConversationTitle(
      makeProvider(async () => ''),
      config,
      '请总结'
    )
    expect(title).toBeNull()
  })

  it('returns null when the provider throws', async () => {
    const title = await generateConversationTitle(
      makeProvider(async () => {
        throw new Error('provider down')
      }),
      config,
      '请总结'
    )
    expect(title).toBeNull()
  })
})
