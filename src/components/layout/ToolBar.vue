<script setup lang="ts">
import { useFileStore, type EditorMode } from '../../stores/file'

const fileStore = useFileStore()

/**
 * 切换编辑器模式
 */
function switchMode(mode: EditorMode): void {
  fileStore.setEditorMode(mode)
}

/**
 * 应用格式
 */
function applyFormat(format: string): void {
  console.log('Apply format:', format)
  // TODO: 实现格式功能
  // 通过 IPC 或事件通知编辑器组件
}

/**
 * 切换标题级别
 */
function setHeading(level: string): void {
  console.log('Set heading:', level)
  // TODO: 实现标题切换
}

/**
 * 插入链接
 */
function insertLink(): void {
  console.log('Insert link')
  // TODO: 实现插入链接
}

/**
 * 插入图片
 */
function insertImage(): void {
  console.log('Insert image')
  // TODO: 实现插入图片
}

/**
 * 插入表格
 */
function insertTable(): void {
  console.log('Insert table')
  // TODO: 实现插入表格
}

/**
 * 插入代码块
 */
function insertCodeBlock(): void {
  console.log('Insert code block')
  // TODO: 实现插入代码块
}
</script>

<template>
  <div class="toolbar">
    <!-- 模式切换 -->
    <div class="mode-switcher">
      <button 
        class="mode-btn" 
        :class="{ active: fileStore.editorMode === 'wysiwyg' }"
        @click="switchMode('wysiwyg')"
      >
        所见即所得
      </button>
      <button 
        class="mode-btn" 
        :class="{ active: fileStore.editorMode === 'split' }"
        @click="switchMode('split')"
      >
        分屏预览
      </button>
      <button 
        class="mode-btn" 
        :class="{ active: fileStore.editorMode === 'source' }"
        @click="switchMode('source')"
      >
        源码编辑
      </button>
    </div>
    
    <div class="toolbar-divider" />
    
    <!-- 格式化按钮组 -->
    <div class="format-group">
      <button
        class="format-btn"
        title="粗体 Ctrl+B"
        @click="applyFormat('bold')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="斜体 Ctrl+I"
        @click="applyFormat('italic')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line
            x1="19"
            y1="4"
            x2="10"
            y2="4"
          />
          <line
            x1="14"
            y1="20"
            x2="5"
            y2="20"
          />
          <line
            x1="15"
            y1="4"
            x2="9"
            y2="20"
          />
        </svg>
      </button>
      <button
        class="format-btn"
        title="删除线"
        @click="applyFormat('strikethrough')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M16 4H9a3 3 0 000 6h6a3 3 0 010 6H8" />
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
          />
        </svg>
      </button>
    </div>
    
    <div class="toolbar-divider" />
    
    <!-- 块级元素 -->
    <div class="format-group">
      <button
        class="format-btn"
        title="标题"
        @click="setHeading('h1')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 12h16M4 4v16M20 4v16" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="无序列表"
        @click="applyFormat('unorderedList')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="有序列表"
        @click="applyFormat('orderedList')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M10 6h11M10 12h11M10 18h11M4 6V4l-1 1M3 10h2M4 10v4" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="引用"
        @click="applyFormat('blockquote')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="代码块"
        @click="insertCodeBlock"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
    </div>
    
    <div class="toolbar-divider" />
    
    <!-- 插入元素 -->
    <div class="format-group">
      <button
        class="format-btn"
        title="链接 Ctrl+K"
        @click="insertLink"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="图片"
        @click="insertImage"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
            ry="2"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="1.5"
          />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="表格"
        @click="insertTable"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
          />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  height: var(--toolbar-height);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.mode-switcher {
  display: flex;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: 2px;
}

.mode-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  color: var(--color-text);
}

.mode-btn.active {
  color: white;
  background-color: var(--color-primary);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background-color: var(--color-border);
}

.format-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.format-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.format-btn:hover {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
}

.format-btn svg {
  width: 16px;
  height: 16px;
}
</style>
