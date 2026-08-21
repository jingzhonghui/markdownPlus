<script setup lang="ts">
import { useAiStore } from '../../stores/ai'

const store = useAiStore()
</script>

<template>
  <div
    v-if="store.summaryStatus !== 'idle'"
    class="summary-status-card"
    data-testid="ai-summary-status"
    role="status"
    :data-status="store.summaryStatus"
  >
    <template v-if="store.summaryStatus === 'generating'">
      <span
        class="status-dot"
        aria-label="正在生成"
      />
      <span>正在生成工作区概要…</span>
    </template>
    <template v-else>
      <span class="status-warn">!</span>
      <span>工作区概要生成失败，已直接回答</span>
    </template>
  </div>
</template>

<style scoped>
.summary-status-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 18px 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.status-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: summary-pulse 1.2s ease-in-out infinite;
}

.status-warn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-warning, #f59e0b);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

@keyframes summary-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
</style>
