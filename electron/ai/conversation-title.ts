import type { LlmProvider } from './provider'
import type { AiRuntimeConfig } from '../../shared/ai/types'

/**
 * 用 LLM 为会话生成标题。任何失败都返回 null，由调用方保留占位标题。
 */
export async function generateConversationTitle(
  provider: LlmProvider,
  config: AiRuntimeConfig,
  text: string
): Promise<string | null> {
  try {
    const title = (await provider.summarize(config, text)).trim()
    return title.length > 0 ? title : null
  } catch {
    return null
  }
}
