<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFileStore } from '../../stores/file'
import type { MdxImageAsset, MdxAttachmentAsset } from '../../types/mdx'

/**
 * 资源项类型
 */
type AssetItem = MdxImageAsset | MdxAttachmentAsset

/**
 * 排序字段
 */
type SortField = 'name' | 'size' | 'type'

/**
 * 排序方向
 */
type SortOrder = 'asc' | 'desc'

const fileStore = useFileStore()

// 本地状态
const selectedAssets = ref<string[]>([])
const sortField = ref<SortField>('name')
const sortOrder = ref<SortOrder>('asc')
const isDragging = ref(false)

// 图片 URL 缓存 - 使用 ref 存储对象
const imageDataUrls = ref<Record<string, string>>({})

/**
 * 获取图片 URL（用于模板）
 */
function getImageUrl(id: string): string {
  return imageDataUrls.value[id] || ''
}

// 获取资源列表
const assets = computed<AssetItem[]>(() => {
  const images = fileStore.document?.assets.images || []
  const attachments = fileStore.document?.assets.attachments || []
  return [...images, ...attachments]
})

// 图片资源
const images = computed(() => fileStore.document?.assets.images || [])

// 附件资源
const attachments = computed(() => fileStore.document?.assets.attachments || [])

// 排序后的资源
const sortedImages = computed(() => {
  return sortAssets([...images.value], sortField.value, sortOrder.value)
})

const sortedAttachments = computed(() => {
  return sortAssets([...attachments.value], sortField.value, sortOrder.value)
})

// 是否有文档打开
const hasDocument = computed(() => fileStore.hasFile)

/**
 * 排序资源列表
 */
function sortAssets(list: AssetItem[], field: SortField, order: SortOrder): AssetItem[] {
  return list.sort((a, b) => {
    let comparison = 0
    switch (field) {
      case 'name':
        comparison = a.filename.localeCompare(b.filename)
        break
      case 'size':
        comparison = a.size - b.size
        break
      case 'type':
        comparison = a.mime_type.localeCompare(b.mime_type)
        break
    }
    return order === 'asc' ? comparison : -comparison
  })
}

/**
 * 切换排序
 */
function toggleSort(field: SortField): void {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'asc'
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 获取图片的缩略图 URL
 */
async function getImageThumbnail(asset: MdxImageAsset): Promise<string> {
  // 如果已经加载过，直接返回
  if (imageDataUrls.value[asset.id]) {
    return imageDataUrls.value[asset.id]
  }

  // 从主进程获取图片数据
  const result = await fileStore.getImage(asset.path)
  if (result.success && result.data) {
    // 使用对象赋值触发响应式更新
    imageDataUrls.value = { ...imageDataUrls.value, [asset.id]: result.data }
    return result.data
  }

  // 返回占位符
  return ''
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
async function addAsset(): Promise<void> {
  if (!window.electronAPI) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  if (result.success && result.data) {
    for (const filePath of result.data) {
      // 读取文件并添加
      try {
        const response = await fetch(`file://${filePath}`)
        const blob = await response.blob()
        const file = new File([blob], filePath.split(/[/\\]/).pop() || 'unnamed', { type: blob.type })
        await fileStore.addImage(file)
      } catch (err) {
        console.error('添加资源失败:', err)
      }
    }
    // 刷新资源列表
    await fileStore.refreshAssets()
  }
}

/**
 * 删除选中的资源
 */
async function deleteSelected(): Promise<void> {
  for (const id of selectedAssets.value) {
    await fileStore.removeAsset(id)
  }
  selectedAssets.value = []
}

/**
 * 插入图片到编辑器
 */
function insertImage(asset: MdxImageAsset): void {
  // 构建 Markdown 图片语法
  const imageMarkdown = `![${asset.filename}](${asset.path})`

  // 插入到编辑器
  const content = fileStore.fileContent
  const newContent = content + '\n\n' + imageMarkdown + '\n'
  fileStore.updateContent(newContent)
}

/**
 * 插入附件到编辑器
 */
function insertAttachment(asset: MdxAttachmentAsset): void {
  // 构建附件链接
  const attachmentMarkdown = `[📎 ${asset.filename}](${asset.path})`

  // 插入到编辑器
  const content = fileStore.fileContent
  const newContent = content + '\n\n' + attachmentMarkdown + '\n'
  fileStore.updateContent(newContent)
}

/**
 * 拖放事件处理
 */
function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent): void {
  e.preventDefault()
  isDragging.value = false
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  isDragging.value = false

  if (!e.dataTransfer?.files) return

  for (const file of Array.from(e.dataTransfer.files)) {
    if (file.type.startsWith('image/')) {
      await fileStore.addImage(file)
    } else {
      await fileStore.addAttachment(file)
    }
  }

  // 刷新资源列表
  await fileStore.refreshAssets()
}

// 监听文档变化，加载图片缩略图
watch(() => fileStore.document, async (doc) => {
  if (!doc) {
    imageDataUrls.value = {}
    return
  }
  // 文档加载后，延迟加载图片确保资源列表已更新
  setTimeout(async () => {
    const imgs = doc.assets.images || []
    for (const image of imgs) {
      if (!imageDataUrls.value[image.id]) {
        await getImageThumbnail(image)
      }
    }
  }, 100)
}, { immediate: true })

// 监听文档打开状态，清空选择
watch(() => fileStore.currentFile?.path, () => {
  selectedAssets.value = []
})

// onMounted 时 watch 的 immediate 已经会触发加载，这里不需要重复加载
</script>

<template>
  <div
    class="asset-manager"
    :class="{ 'dragging': isDragging }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- 头部操作栏 -->
    <div class="manager-header">
      <span class="manager-title">资源管理器</span>
      <span class="asset-count">{{ assets.length }} 个文件</span>
    </div>

    <!-- 排序选项 -->
    <div
      v-if="assets.length > 0"
      class="sort-bar"
    >
      <button
        class="sort-btn"
        :class="{ active: sortField === 'name' }"
        @click="toggleSort('name')"
      >
        名称 {{ sortField === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
      </button>
      <button
        class="sort-btn"
        :class="{ active: sortField === 'size' }"
        @click="toggleSort('size')"
      >
        大小 {{ sortField === 'size' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
      </button>
      <button
        class="sort-btn"
        :class="{ active: sortField === 'type' }"
        @click="toggleSort('type')"
      >
        类型 {{ sortField === 'type' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
      </button>
    </div>

    <!-- 资源列表 -->
    <div class="asset-list">
      <!-- 图片资源 -->
      <div
        v-if="sortedImages.length > 0"
        class="asset-section"
      >
        <div class="section-title">
          图片 ({{ sortedImages.length }})
        </div>
        <div class="image-grid">
          <div
            v-for="image in sortedImages"
            :key="image.id"
            class="image-card"
            :class="{ selected: selectedAssets.includes(image.id) }"
            @click="toggleSelection(image.id)"
            @dblclick="insertImage(image)"
          >
            <div class="image-thumbnail">
              <img
                v-if="getImageUrl(image.id)"
                :src="getImageUrl(image.id)"
                :alt="image.filename"
              >
              <svg
                v-else
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
                {{ image.filename }}
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
        v-if="sortedAttachments.length > 0"
        class="asset-section"
      >
        <div class="section-title">
          附件 ({{ sortedAttachments.length }})
        </div>
        <div class="attachment-list">
          <div
            v-for="attachment in sortedAttachments"
            :key="attachment.id"
            class="attachment-item"
            :class="{ selected: selectedAssets.includes(attachment.id) }"
            @click="toggleSelection(attachment.id)"
            @dblclick="insertAttachment(attachment)"
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
                {{ attachment.filename }}
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
        v-if="assets.length === 0 && hasDocument"
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

      <!-- 无文档打开状态 -->
      <div
        v-if="!hasDocument"
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p class="empty-text">
          未打开文档
        </p>
        <p class="empty-hint">
          新建或打开文件以管理资源
        </p>
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

    <!-- 拖放提示 -->
    <div
      v-if="isDragging"
      class="drag-overlay"
    >
      <div class="drag-message">
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
        <span>释放以添加资源</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.asset-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.asset-manager.dragging {
  border: 2px dashed var(--color-primary);
  background-color: var(--color-primary-light);
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

.sort-bar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

.sort-btn {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.sort-btn:hover {
  border-color: var(--color-border-hover);
}

.sort-btn.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
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
  overflow: hidden;
}

.image-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--color-primary-rgb), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 48px;
  background-color: var(--color-bg-primary);
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.drag-message svg {
  width: 32px;
  height: 32px;
  color: var(--color-primary);
}

.drag-message span {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-primary);
}
</style>
