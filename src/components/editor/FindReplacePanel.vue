<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  open: boolean
  replaceMode: boolean
  matchCount: number
  currentIndex: number
}>()

const emit = defineEmits<{
  close: []
  search: [query: string, caseSensitive: boolean]
  next: []
  prev: []
  replace: [query: string, replaceText: string, caseSensitive: boolean]
  replaceAll: [query: string, replaceText: string, caseSensitive: boolean]
}>()

const query = ref('')
const replaceText = ref('')
const caseSensitive = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const replaceInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      nextTick(() => {
        if (props.replaceMode) {
          replaceInputRef.value?.focus()
          replaceInputRef.value?.select()
        } else {
          searchInputRef.value?.focus()
          searchInputRef.value?.select()
        }
        if (query.value) emitSearch()
      })
    }
  }
)

function emitSearch(): void {
  emit('search', query.value, caseSensitive.value)
}

function emitReplace(): void {
  emit('replace', query.value, replaceText.value, caseSensitive.value)
}

function emitReplaceAll(): void {
  emit('replaceAll', query.value, replaceText.value, caseSensitive.value)
}
</script>

<template>
  <div
    v-if="open"
    class="find-replace-panel"
  >
    <div class="find-replace-row">
      <input
        ref="searchInputRef"
        v-model="query"
        class="find-replace-input"
        type="text"
        placeholder="查找"
        @input="emitSearch"
        @keydown.enter.exact.prevent="emit('next')"
        @keydown.shift.enter.exact.prevent="emit('prev')"
        @keydown.escape.stop.prevent="emit('close')"
      >
      <button
        class="find-replace-btn"
        title="上一个"
        aria-label="上一个"
        @click="emit('prev')"
      >
        ↑
      </button>
      <button
        class="find-replace-btn"
        title="下一个"
        aria-label="下一个"
        @click="emit('next')"
      >
        ↓
      </button>
      <span class="find-replace-count">{{ matchCount > 0 ? currentIndex + 1 : 0 }}/{{ matchCount }}</span>
      <button
        class="find-replace-btn"
        title="关闭"
        aria-label="关闭"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <div
      v-if="replaceMode"
      class="find-replace-row"
    >
      <input
        ref="replaceInputRef"
        v-model="replaceText"
        class="find-replace-input"
        type="text"
        placeholder="替换为"
        @keydown.enter.exact.prevent="emitReplace"
        @keydown.escape.stop.prevent="emit('close')"
      >
      <button
        class="find-replace-btn"
        title="替换"
        aria-label="替换"
        @click="emitReplace"
      >
        替换
      </button>
      <button
        class="find-replace-btn"
        title="全部替换"
        aria-label="全部替换"
        @click="emitReplaceAll"
      >
        全部替换
      </button>
    </div>
    <label class="find-replace-options">
      <input
        v-model="caseSensitive"
        type="checkbox"
        @change="emitSearch"
      >
      <span>区分大小写</span>
    </label>
  </div>
</template>

<style scoped>
.find-replace-panel {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
}
.find-replace-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.find-replace-input {
  width: 180px;
  padding: 4px 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
}
.find-replace-input:focus {
  border-color: var(--color-primary);
}
.find-replace-btn {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
}
.find-replace-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
}
.find-replace-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}
.find-replace-options {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  cursor: pointer;
}
</style>
