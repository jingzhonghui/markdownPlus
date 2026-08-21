<script setup lang="ts">
import type { LocalFileType } from '../../../../shared/ai/types'

defineProps<{
  requestedPath: string
  normalizedPath: string
  fileType: LocalFileType
  size?: number
  reason: string
}>()

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${Number(value.toFixed(1))} ${unit}`
}
</script>

<template>
  <section class="local-file">
    <dl>
      <dt>请求路径</dt>
      <dd><code>{{ requestedPath }}</code></dd>
      <dt>规范路径</dt>
      <dd><code>{{ normalizedPath }}</code></dd>
      <dt>文件类型</dt>
      <dd>{{ fileType }}</dd>
      <template v-if="size !== undefined">
        <dt>文件大小</dt>
        <dd>{{ formatSize(size) }}</dd>
      </template>
      <dt>原因</dt>
      <dd>{{ reason }}</dd>
    </dl>
  </section>
</template>

<style scoped>
.local-file { padding: 12px; border: 1px solid var(--color-border); border-radius: 6px; }
dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 12px; margin: 0; }
dt { color: var(--color-text-secondary); }
dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
code { font-family: ui-monospace, monospace; }
</style>
