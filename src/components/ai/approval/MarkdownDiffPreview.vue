<script setup lang="ts">
import { computed } from 'vue'
import { diffLines } from 'diff'

const props = defineProps<{ title: string; before: string; after: string; reason?: string }>()
const changes = computed(() => diffLines(props.before, props.after))
const added = computed(() => changes.value.reduce((total, change) => total + (change.added ? change.count ?? 0 : 0), 0))
const deleted = computed(() => changes.value.reduce((total, change) => total + (change.removed ? change.count ?? 0 : 0), 0))
</script>

<template>
  <section class="preview">
    <h3>{{ title }}</h3>
    <p
      v-if="reason"
      class="reason"
    >
      {{ reason }}
    </p>
    <div class="counts">
      <span data-testid="diff-added-count">+{{ added }}</span>
      <span data-testid="diff-deleted-count">-{{ deleted }}</span>
    </div>
    <pre class="diff"><span
      v-for="(change, index) in changes"
      :key="index"
      :data-testid="change.added ? 'diff-added' : change.removed ? 'diff-deleted' : 'diff-unchanged'"
      :class="{ added: change.added, deleted: change.removed }"
    >{{ change.value }}</span></pre>
  </section>
</template>

<style scoped>
.preview h3 { margin: 0; }
.reason { color: var(--color-text-secondary); }
.counts { display: flex; gap: 12px; margin: 8px 0; font-family: ui-monospace, monospace; }
.counts span:first-child { color: #16a34a; }
.counts span:last-child { color: #dc2626; }
.diff { max-height: 320px; overflow: auto; margin: 0; padding: 10px; background: var(--color-bg-secondary); white-space: pre-wrap; }
.diff span { display: block; min-height: 1em; }
.added { background: rgb(22 163 74 / 16%); color: #16a34a; }
.deleted { background: rgb(220 38 38 / 16%); color: #dc2626; text-decoration: line-through; }
</style>
