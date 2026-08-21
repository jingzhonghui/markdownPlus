<script setup lang="ts">
import { computed } from 'vue'
import { renderAiMarkdown } from '../../../utils/ai/markdown'

const props = defineProps<{ title: string; content: string }>()
const html = computed(() => renderAiMarkdown(props.content))
</script>

<template>
  <section>
    <h3>{{ title }}</h3>
    <div
      class="document"
      data-testid="document-preview"
      v-html="html"
    />
  </section>
</template>

<style scoped>
h3 { margin: 0 0 10px; }
.document { max-height: 360px; overflow: auto; padding: 12px; border: 1px solid var(--color-border); border-radius: 6px; }
</style>
