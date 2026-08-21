<script setup lang="ts">
import { computed } from 'vue'
import type { AiConversationMessage, ToolExecutionResult } from '../../../shared/ai/types'
import { renderAiMarkdown } from '../../utils/ai/markdown'
import { extractAnalysisBlock, ANALYSIS_START_RE, hasAnalysisEnd } from '../../utils/ai/analysis-block'
import AiAnalysisCard from './AiAnalysisCard.vue'
import AiToolCallGroup from './AiToolCallGroup.vue'

const props = defineProps<{
  message: AiConversationMessage
  streaming?: boolean
  toolCalls?: { toolCallId: string; toolName: string; status: 'running' | 'completed' | 'failed'; result?: ToolExecutionResult }[]
}>()

const parsed = computed(() => {
  if (props.message.role !== 'assistant') return { analysis: '', answer: props.message.content }
  const content = props.message.content

  if (props.streaming && !hasAnalysisEnd(content)) {
    const cleaned = content.replace(ANALYSIS_START_RE, '')
    return { analysis: cleaned.trim(), answer: '' }
  }

  return extractAnalysisBlock(content)
})

const answerHtml = computed(() => renderAiMarkdown(parsed.value.answer))
const showAnalysisCard = computed(() => {
  if (props.message.role !== 'assistant') return false
  return parsed.value.analysis.length > 0 || (props.streaming && props.message.content.length > 0)
})
const hasToolCalls = computed(() => (props.toolCalls?.length ?? 0) > 0)
</script>

<template>
  <article
    class="message"
    :class="`message-${message.role}`"
    data-testid="ai-message"
  >
    <template v-if="message.role !== 'assistant'">
      <div
        class="message-body"
        v-html="answerHtml"
      />
    </template>
    <template v-else>
      <AiAnalysisCard
        v-if="showAnalysisCard"
        :content="parsed.analysis"
        :streaming="streaming || false"
      />
      <AiToolCallGroup
        v-if="hasToolCalls"
        :calls="toolCalls!"
      />
      <div
        v-if="parsed.answer"
        class="message-body"
        v-html="answerHtml"
      />
      <span
        v-if="streaming && parsed.answer"
        class="stream-caret"
        aria-label="正在生成"
      />
    </template>
  </article>
</template>

<style scoped>
.message { position: relative; max-width: 780px; padding: 14px 18px; border-left: 2px solid transparent; }
.message-user { border-left-color: #f59e0b; }
.message-assistant { border-left-color: var(--color-primary); }
.message-meta { margin-bottom: 7px; color: var(--color-text-tertiary); font-size: 11px; font-weight: 600; letter-spacing: .08em; }
.message-body { line-height: 1.65; overflow-wrap: anywhere; }
.message-body :deep(> :first-child) { margin-top: 0; }
.message-body :deep(> :last-child) { margin-bottom: 0; }
.message-body :deep(pre) { overflow: auto; padding: 12px; border-radius: 6px; background: var(--color-bg-secondary); }
.stream-caret { display: inline-block; width: 2px; height: 1em; margin-left: 3px; background: var(--color-primary); animation: blink 1s steps(1) infinite; vertical-align: text-bottom; }
@keyframes blink { 50% { opacity: .15; } }
@media (prefers-reduced-motion: reduce) { .stream-caret { animation: none; } }
</style>