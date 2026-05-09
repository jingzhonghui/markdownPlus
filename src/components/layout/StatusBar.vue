<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()

const fileSize = computed(() => {
  const bytes = new Blob([fileStore.fileContent]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

const saveStatus = computed(() => {
  if (fileStore.isLoading) return '加载中...'
  if (fileStore.isModified) return '未保存'
  return '已保存'
})

const saveStatusClass = computed(() => {
  if (fileStore.isLoading) return 'loading'
  if (fileStore.isModified) return 'modified'
  return 'saved'
})

const modeText = computed(() => {
  const modes: Record<string, string> = {
    wysiwyg: '所见即所得',
    split: '分屏预览',
    source: '源码编辑'
  }
  return modes[fileStore.editorMode] || '所见即所得'
})
</script>

<template>
  <footer class="status-bar">
    <div class="status-left">
      <span class="status-item">{{ fileStore.fileName }}</span>
      <span class="status-separator">|</span>
      <span class="status-item">字数: {{ fileStore.wordCount }}</span>
      <span class="status-separator">|</span>
      <span class="status-item">文件大小: {{ fileSize }}</span>
      <span class="status-separator">|</span>
      <span class="status-item">
        行 {{ fileStore.cursorLine }}, 列 {{ fileStore.cursorColumn }}
      </span>
    </div>
    
    <div class="status-right">
      <span class="status-item mode-text">{{ modeText }}</span>
      <span class="status-separator">|</span>
      <span
        class="status-item"
        :class="saveStatusClass"
      >
        {{ saveStatus }}
      </span>
      <span class="status-separator">|</span>
      <span class="status-item">Markdown+ v1.0.0</span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--statusbar-height);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.status-item {
  white-space: nowrap;
}

.status-separator {
  color: var(--color-border-hover);
  user-select: none;
}

.mode-text {
  color: var(--color-primary);
}

.saved {
  color: var(--color-success);
}

.modified {
  color: var(--color-warning);
}

.loading {
  color: var(--color-text-tertiary);
}
</style>
