<script setup lang="ts">
import { ref, computed } from 'vue'

/**
 * 资源项接口
 */
interface AssetItem {
  id: string
  name: string
  size: number
  type: 'image' | 'attachment'
  url?: string
}

// 模拟资源数据
const assets = ref<AssetItem[]>([
  { id: '1', name: 'screenshot.png', size: 24576, type: 'image' },
  { id: '2', name: 'diagram.jpg', size: 156300, type: 'image' },
  { id: '3', name: 'document.pdf', size: 1024000, type: 'attachment' }
])

const selectedAssets = ref<string[]>([])

/**
 * 图片资源
 */
const images = computed(() => assets.value.filter(a => a.type === 'image'))

/**
 * 附件资源
 */
const attachments = computed(() => assets.value.filter(a => a.type === 'attachment'))

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 选择/取消选择资源
 */
function toggleSelection(id: string): void {
  const index = selectedAssets.value.indexOf(id)
  if (index > -1) {
    selectedAssets.value.splice(index, 1)
  } else {
    selectedAssets.value.push(id)
  }
}

/**
 * 添加资源
 */
function addAsset(): void {
  console.log('Add asset')
  // TODO: 实现添加资源功能
}

/**
 * 删除选中的资源
 */
function deleteSelected(): void {
  assets.value = assets.value.filter(a => !selectedAssets.value.includes(a.id))
  selectedAssets.value = []
}

/**
 * 插入资源到编辑器
 */
function insertAsset(asset: AssetItem): void {
  console.log('Insert asset:', asset)
  // TODO: 实现插入资源到编辑器
}
</script>

<template>
  <div class="asset-manager">
    <!-- 头部操作栏 -->
    <div class="manager-header">
      <span class="manager-title">资源管理器</span>
      <span class="asset-count">{{ assets.length }} 个文件</span>
    </div>
    
    <!-- 资源列表 -->
    <div class="asset-list">
      <!-- 图片资源 -->
      <div
        v-if="images.length > 0"
        class="asset-section"
      >
        <div class="section-title">
          图片 ({{ images.length }})
        </div>
        <div class="image-grid">
          <div
            v-for="image in images"
            :key="image.id"
            class="image-card"
            :class="{ selected: selectedAssets.includes(image.id) }"
            @click="toggleSelection(image.id)"
            @dblclick="insertAsset(image)"
          >
            <div class="image-thumbnail">
              <svg
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
                  stroke-width="1.5"
                />
                <circle
                  cx="8.5"
                  cy="8.5"
                  r="1.5"
                  fill="currentColor"
                />
                <path
                  stroke-width="1.5"
                  d="M21 15l-5-5L5 21"
                />
              </svg>
            </div>
            <div class="image-info">
              <div class="image-name">
                {{ image.name }}
              </div>
              <div class="image-size">
                {{ formatSize(image.size) }}
              </div>
            </div>
          </div>
          
          <!-- 添加图片按钮 -->
          <div
            class="image-card add-card"
            @click="addAsset"
          >
            <div class="add-icon">
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
            </div>
            <div class="add-text">
              添加图片
            </div>
          </div>
        </div>
      </div>
      
      <!-- 附件资源 -->
      <div
        v-if="attachments.length > 0"
        class="asset-section"
      >
        <div class="section-title">
          附件 ({{ attachments.length }})
        </div>
        <div class="attachment-list">
          <div
            v-for="attachment in attachments"
            :key="attachment.id"
            class="attachment-item"
            :class="{ selected: selectedAssets.includes(attachment.id) }"
            @click="toggleSelection(attachment.id)"
          >
            <svg
              class="attachment-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-width="2"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <div class="attachment-info">
              <div class="attachment-name">
                {{ attachment.name }}
              </div>
              <div class="attachment-size">
                {{ formatSize(attachment.size) }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 空状态 -->
      <div
        v-if="assets.length === 0"
        class="empty-state"
      >
        <svg
          class="empty-icon"
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
            stroke-width="1.5"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="1.5"
            fill="currentColor"
          />
          <path
            stroke-width="1.5"
            d="M21 15l-5-5L5 21"
          />
        </svg>
        <p class="empty-text">
          暂无资源文件
        </p>
        <p class="empty-hint">
          拖拽图片到此处或点击添加
        </p>
        <button
          class="empty-action"
          @click="addAsset"
        >
          添加资源
        </button>
      </div>
    </div>
    
    <!-- 底部操作栏 -->
    <div
      v-if="selectedAssets.length > 0"
      class="manager-footer"
    >
      <span class="selected-count">已选择 {{ selectedAssets.length }} 个</span>
      <button
        class="delete-btn"
        @click="deleteSelected"
      >
        删除
      </button>
    </div>
  </div>
</template>

<style scoped>
.asset-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}

.manager-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.asset-count {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.asset-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.asset-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.image-card {
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-secondary);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.image-card:hover {
  border-color: var(--color-border-hover);
}

.image-card.selected {
  border-color: var(--color-primary);
}

.image-thumbnail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
}

.image-thumbnail svg {
  width: 24px;
  height: 24px;
}

.image-info {
  padding: 6px;
  background-color: var(--color-bg-primary);
}

.image-name {
  font-size: 11px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-size {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.add-card {
  border: 2px dashed var(--color-border);
  background-color: transparent;
  align-items: center;
  justify-content: center;
}

.add-card:hover {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.add-icon {
  color: var(--color-text-tertiary);
}

.add-icon svg {
  width: 20px;
  height: 20px;
}

.add-text {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.attachment-item:hover {
  background-color: var(--color-bg-secondary);
}

.attachment-item.selected {
  background-color: var(--color-primary-light);
}

.attachment-icon {
  width: 20px;
  height: 20px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.attachment-info {
  flex: 1;
  min-width: 0;
}

.attachment-name {
  font-size: 12px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  font-size: 10px;
  color: var(--color-text-tertiary);
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
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
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

.manager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-secondary);
}

.selected-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.delete-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-error);
  background-color: transparent;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background-color: var(--color-error);
  color: white;
}
</style>
