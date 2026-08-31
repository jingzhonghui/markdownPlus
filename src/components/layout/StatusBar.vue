<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFileStore, type EditorMode } from '../../stores/file'

const fileStore = useFileStore()
const appVersion = ref('')

onMounted(async () => {
  try {
    appVersion.value = await window.electronAPI.getVersion()
  } catch {
    appVersion.value = ''
  }
})

const appLabel = computed(() => {
  return appVersion.value ? `Markdown+ v${appVersion.value}` : 'Markdown+'
})

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
 * 顺序：分屏预览 -> 源码编辑 -> 即时渲染 -> 分屏预览
 */
function toggleEditorMode(): void {
  const modes: EditorMode[] = ['split', 'source', 'ir']
  const currentIndex = modes.indexOf(fileStore.editorMode)
  const nextIndex = (currentIndex + 1) % modes.length
  fileStore.setEditorMode(modes[nextIndex])
}

/**
 * 获取模式图标
 */
const modeIcon = computed(() => {
  const icons: Record<EditorMode, string> = {
    split: 'split',
    source: 'source',
    ir: 'ir'
  }
  return icons[fileStore.editorMode]
})

/**
 * 获取模式提示文字
 */
const modeTooltip = computed(() => {
  const tooltips: Record<EditorMode, string> = {
    split: '分屏预览',
    source: '源码编辑',
    ir: '即时渲染'
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
        <!-- 分屏预览图标 -->
        <svg
          v-if="modeIcon === 'split'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
            stroke-width="2"
          />
          <path
            stroke-width="2"
            d="M12 3v18"
          />
        </svg>
        <!-- 即时渲染图标 -->
        <svg
          v-else-if="modeIcon === 'ir'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-width="2"
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
          />
          <polyline
            points="14 2 14 8 20 8"
            stroke-width="2"
          />
          <line
            x1="9"
            y1="15"
            x2="15"
            y2="15"
            stroke-width="2"
          />
        </svg>
        <!-- 源码编辑图标 -->
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <polyline
            points="16 18 22 12 16 6"
            stroke-width="2"
          />
          <polyline
            points="8 6 2 12 8 18"
            stroke-width="2"
          />
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
      <template v-if="appVersion">
        <span class="status-separator">|</span>
        <span class="status-item">{{ appLabel }}</span>
      </template>
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

.mode-toggle-btn.ir {
  color: #f59e0b;
  border-color: #f59e0b;
  background-color: rgba(245, 158, 11, 0.1);
}

.mode-label {
  white-space: nowrap;
}
</style>
