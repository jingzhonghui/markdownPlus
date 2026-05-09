<script setup lang="ts">
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()

/**
 * 新建文件
 */
async function createNewFile(): Promise<void> {
  await fileStore.newFile()
}

/**
 * 打开文件
 */
async function openFile(): Promise<void> {
  await fileStore.openFile()
}
</script>

<template>
  <div class="file-explorer">
    <!-- 头部操作栏 -->
    <div class="explorer-header">
      <span class="explorer-title">文件浏览器</span>
      <div class="explorer-actions">
        <button
          class="action-btn"
          title="新建文件"
          @click="createNewFile"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
        <button
          class="action-btn"
          title="打开文件"
          @click="openFile"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
            />
          </svg>
        </button>
      </div>
    </div>
    
    <!-- 文件列表 -->
    <div class="file-list">
      <!-- 当前打开的文件 -->
      <div
        v-if="fileStore.currentFile"
        class="file-section"
      >
        <div class="section-title">
          当前文档
        </div>
        <div class="file-item active">
          <svg
            class="file-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span class="file-name">{{ fileStore.fileName }}</span>
          <span
            v-if="fileStore.isModified"
            class="modified-indicator"
          >●</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="!fileStore.currentFile"
        class="empty-state"
      >
        <svg
          class="empty-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-width="1.5"
            d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
          />
        </svg>
        <p class="empty-text">
          暂无文件
        </p>
        <button
          class="empty-action"
          @click="createNewFile"
        >
          创建新文件
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}

.explorer-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.explorer-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
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

.action-btn:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.file-section {
  margin-bottom: 16px;
}

.section-title {
  padding: 0 8px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.file-item:hover {
  background-color: var(--color-bg-secondary);
}

.file-item.active {
  background-color: var(--color-primary-light);
}

.file-item.active .file-name {
  color: var(--color-primary);
  font-weight: 500;
}

.file-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.file-item.active .file-icon {
  color: var(--color-primary);
}

.file-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modified-indicator {
  font-size: 10px;
  color: var(--color-warning);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
}

.empty-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.empty-action {
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary);
  background-color: var(--color-primary-light);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.empty-action:hover {
  background-color: var(--color-primary);
  color: white;
}
</style>
