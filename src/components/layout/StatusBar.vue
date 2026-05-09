<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore, type EditorMode } from '../../stores/file'

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

/**
 * 切换编辑模式
 * 顺序：所见即所得 -> 分屏预览 -> 源码编辑 -> 所见即所得
 */
function toggleEditorMode(): void {
  const modes: EditorMode[] = ['wysiwyg', 'split', 'source']
  const currentIndex = modes.indexOf(fileStore.editorMode)
  const nextIndex = (currentIndex + 1) % modes.length
  fileStore.setEditorMode(modes[nextIndex])
}

/**
 * 获取模式图标
 */
const modeIcon = computed(() => {
  const icons: Record<EditorMode, string> = {
    wysiwyg: 'wysiwyg',
    split: 'split',
    source: 'source'
  }
  return icons[fileStore.editorMode]
})

/**
 * 获取模式提示文字
 */
const modeTooltip = computed(() => {
  const tooltips: Record<EditorMode, string> = {
    wysiwyg: '所见即所得',
    split: '分屏预览',
    source: '源码编辑'
  }
  return `${tooltips[fileStore.editorMode]} (点击切换)`
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
      <!-- 编辑模式切换按钮 -->
      <button
        class="mode-toggle-btn"
        :class="fileStore.editorMode"
        :title="modeTooltip"
        @click="toggleEditorMode"
      >
        <!-- 所见即所得图标 -->
        <svg v-if="modeIcon === 'wysiwyg'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <!-- 分屏预览图标 -->
        <svg v-else-if="modeIcon === 'split'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" />
          <path stroke-width="2" d="M12 3v18" />
        </svg>
        <!-- 源码编辑图标 -->
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="16 18 22 12 16 6" stroke-width="2" />
          <polyline points="8 6 2 12 8 18" stroke-width="2" />
        </svg>
        <span class="mode-label">{{ modeTooltip.split(' ')[0] }}</span>
      </button>

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

.saved {
  color: var(--color-success);
}

.modified {
  color: var(--color-warning);
}

.loading {
  color: var(--color-text-tertiary);
}

/* 模式切换按钮 */
.mode-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-toggle-btn svg {
  width: 14px;
  height: 14px;
}

.mode-toggle-btn:hover {
  border-color: var(--color-border-hover);
  background-color: var(--color-bg-secondary);
}

/* 不同模式下的颜色标识 */
.mode-toggle-btn.wysiwyg {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.mode-toggle-btn.split {
  color: #8b5cf6;
  border-color: #8b5cf6;
  background-color: rgba(139, 92, 246, 0.1);
}

.mode-toggle-btn.source {
  color: #10b981;
  border-color: #10b981;
  background-color: rgba(16, 185, 129, 0.1);
}

.mode-label {
  white-space: nowrap;
}
</style>
