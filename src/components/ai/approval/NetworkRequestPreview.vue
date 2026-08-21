<script setup lang="ts">
defineProps<{ method: string; url: string; reason: string; bodySummary?: string }>()
</script>

<template>
  <section class="network">
    <div><strong>{{ method }}</strong> <code>{{ url }}</code></div>
    <p>{{ reason }}</p>
    <pre v-if="bodySummary">{{ bodySummary }}</pre>
  </section>
</template>

<style scoped>
.network { display: grid; gap: 10px; }
p { margin: 0; color: var(--color-text-secondary); }
code, pre { overflow-wrap: anywhere; font-family: ui-monospace, monospace; }
pre { max-height: 240px; overflow: auto; margin: 0; padding: 10px; background: var(--color-bg-secondary); white-space: pre-wrap; }
</style>
