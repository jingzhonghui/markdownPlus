<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Props {
  top: number
  left: number
  isBold: boolean
  isItalic: boolean
  isStrikethrough: boolean
  isCode: boolean
  isLink: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  bold: []
  italic: []
  strikethrough: []
  code: []
  link: [href: string, title?: string]
  hide: []
}>()

const linkDialogVisible = ref(false)
const linkHref = ref('')
const linkTitle = ref('')
const toolbarRef = ref<HTMLDivElement>()

/**
 * 点击外部时隐藏工具栏
 */
function handleClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (toolbarRef.value && !toolbarRef.value.contains(target)) {
    emit('hide')
  }
}

/**
 * 显示链接对话框
 */
function showLinkDialog(): void {
  linkDialogVisible.value = true
  linkHref.value = ''
  linkTitle.value = ''
}

/**
 * 确认插入链接
 */
function confirmLink(): void {
  if (linkHref.value.trim()) {
    emit('link', linkHref.value.trim(), linkTitle.value.trim() || undefined)
  }
  linkDialogVisible.value = false
}

/**
 * 取消链接对话框
 */
function cancelLink(): void {
  linkDialogVisible.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div
    ref="toolbarRef"
    class="float-toolbar"
    :style="{ top: top + 'px', left: left + 'px' }"
    @mousedown.stop
  >
    <!-- 格式按钮组 -->
    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        :class="{ active: isBold }"
        title="粗体 (Ctrl+B)"
        @click="emit('bold')"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"
          />
        </svg>
      </button>

      <button
        class="toolbar-btn"
        :class="{ active: isItalic }"
        title="斜体 (Ctrl+I)"
        @click="emit('italic')"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"
          />
        </svg>
      </button>

      <button
        class="toolbar-btn"
        :class="{ active: isStrikethrough }"
        title="删除线"
        @click="emit('strikethrough')"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M17.75 9L14 4.5l-1.08 1.09L12.11 4H20c1.1 0 2 .9 2 2v12c0 .55-.45 1-1 1s-1-.45-1-1V9h-2.25zM2.41 2.13L1 3.54l4.39 4.39C4.2 8.56 4 9.27 4 10v8H2c-.55 0-1 .45-1 1s.45 1 1 1h11.17l3.46 3.46 1.41-1.41L2.41 2.13zM8 14c0 .55.45 1 1 1h3.17l-4.2-4.2C7.22 11.22 8 12.55 8 14z"
          />
        </svg>
      </button>

      <div class="toolbar-divider" />

      <button
        class="toolbar-btn"
        :class="{ active: isCode }"
        title="行内代码"
        @click="emit('code')"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"
          />
        </svg>
      </button>

      <button
        class="toolbar-btn"
        :class="{ active: isLink }"
        title="插入链接 (Ctrl+K)"
        @click="showLinkDialog"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
          />
        </svg>
      </button>
    </div>

    <!-- 链接对话框 -->
    <div
      v-if="linkDialogVisible"
      class="link-dialog"
    >
      <input
        v-model="linkHref"
        type="text"
        placeholder="输入链接地址 (https://...)"
        class="link-input"
        @keydown.enter="confirmLink"
        @keydown.esc="cancelLink"
      >
      <input
        v-model="linkTitle"
        type="text"
        placeholder="标题 (可选)"
        class="link-input"
        @keydown.enter="confirmLink"
        @keydown.esc="cancelLink"
      >
      <div class="link-actions">
        <button
          class="link-btn link-btn-cancel"
          @click="cancelLink"
        >
          取消
        </button>
        <button
          class="link-btn link-btn-confirm"
          @click="confirmLink"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.float-toolbar {
  position: absolute;
  z-index: 100;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  animation: toolbar-appear 0.15s ease;
}

@keyframes toolbar-appear {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.toolbar-btn.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 4px;
}

/* 链接对话框 */
.link-dialog {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  min-width: 280px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.link-input {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}

.link-input:focus {
  border-color: var(--color-primary);
}

.link-input::placeholder {
  color: var(--color-text-tertiary);
}

.link-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.link-btn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.link-btn-cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.link-btn-cancel:hover {
  background: var(--color-bg-secondary);
}

.link-btn-confirm {
  border: none;
  background: var(--color-primary);
  color: white;
}

.link-btn-confirm:hover {
  background: var(--color-primary);
  filter: brightness(1.1);
}

/* 深色主题适配 */
[data-theme="dark"] .float-toolbar {
  background: var(--color-bg-secondary);
}

[data-theme="dark"] .link-dialog {
  background: var(--color-bg-secondary);
}
</style>
