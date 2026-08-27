<script setup lang="ts">
import { computed, inject } from 'vue'
import { useFileStore, type FileTreeNode } from '../../stores/file'

interface DragState {
  sourcePath: string | null
  /** 当前悬停的合法目标目录路径（只高亮最内层/第一级目标） */
  hoverPath: string | null
}

const props = defineProps<{
  node: FileTreeNode
  depth?: number
}>()

const emit = defineEmits<{
  contextMenu: [event: MouseEvent, node: FileTreeNode]
}>()

const fileStore = useFileStore()

const dragState = inject<DragState | null>('fileTreeDragState', null)
const onDropToFolder = inject<((targetDir: string) => void) | null>('fileTreeOnDropToFolder', null)

// 高亮由共享 hoverPath 决定：dragover 在内层目录 stopPropagation，
// 因此 hoverPath 只会是最内层的合法目标，祖先目录不会同时高亮
const isDragOver = computed(() => dragState?.hoverPath === props.node.path)

const depth = computed(() => props.depth ?? 0)

function normalizePath(value: string): string {
  return value.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
}

function getParentDir(filePath: string): string {
  const normalized = normalizePath(filePath)
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? '' : normalized.slice(0, idx)
}

function isValidDropTarget(): boolean {
  if (!props.node.isDirectory || !dragState?.sourcePath) return false
  const source = dragState.sourcePath
  const normalizedSource = normalizePath(source)
  const normalizedNode = normalizePath(props.node.path)
  // 不能拖到自身、自身子目录或源所在的父目录（原地移动）
  if (normalizedNode === normalizedSource) return false
  if (normalizedNode.startsWith(`${normalizedSource}/`)) return false
  if (normalizedNode === getParentDir(source)) return false
  return true
}

function isActiveFile(node: FileTreeNode): boolean {
  return !node.isDirectory && fileStore.currentFile?.path === node.path
}

function isModifiedFile(node: FileTreeNode): boolean {
  return isActiveFile(node) && fileStore.isModified
}

async function onClick(): Promise<void> {
  if (props.node.isDirectory) {
    await fileStore.toggleNode(props.node)
  } else {
    await fileStore.openFile(props.node.path, { addToRecent: false })
  }
}

function onContextMenu(event: MouseEvent): void {
  emit('contextMenu', event, props.node)
}

function onExpandClick(): void {
  if (props.node.isDirectory) {
    fileStore.toggleNode(props.node)
  }
}

function onDragStart(event: DragEvent): void {
  if (!dragState) return
  dragState.sourcePath = props.node.path
  dragState.hoverPath = null
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', props.node.path)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragEnd(): void {
  if (dragState) {
    dragState.sourcePath = null
    dragState.hoverPath = null
  }
}

function onDragOver(event: DragEvent): void {
  // 文件节点不处理也不拦截，让 dragover 冒泡到父目录统一处理
  if (!props.node.isDirectory) return
  // 目录节点总是停止冒泡，避免拖到其展开区域时误高亮列表空白区
  event.stopPropagation()
  if (!isValidDropTarget()) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  // 只记录最内层的合法目标（外层目录收不到被 stop 的事件，天然不会同时高亮）
  dragState!.hoverPath = props.node.path
}

function onDragLeave(event: DragEvent): void {
  if (!dragState) return
  const el = event.currentTarget as HTMLElement
  if (el.contains(event.relatedTarget as Node)) return
  // 鼠标离开当前悬停的节点后清除高亮；下一个 dragover 会立即设置新的目标
  if (dragState.hoverPath === props.node.path) dragState.hoverPath = null
}

function onDrop(event: DragEvent): void {
  // 文件节点不拦截 drop，让事件冒泡到父目录节点处理
  if (!props.node.isDirectory) return
  // 目录节点总是停止冒泡，避免拖到其展开区域时误落到列表空白区（移动到根目录）
  event.stopPropagation()
  dragState!.hoverPath = null
  if (!isValidDropTarget() || !onDropToFolder) return
  void onDropToFolder(props.node.path)
}
</script>

<template>
  <!-- dragover/drop 绑定在外层 tree-item 上：子节点的事件冒泡经过父级 tree-item，
       但不经过父级 item-content（二者是兄弟），故不能绑在 item-content 上 -->
  <div
    class="tree-item"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      class="item-content"
      :data-file-path="node.path"
      :class="{
        'is-directory': node.isDirectory,
        'is-active': !node.isDirectory && isActiveFile(node),
        'is-drag-over': isDragOver,
      }"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      draggable="true"
      @click="onClick"
      @contextmenu.prevent.stop="onContextMenu"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
    >
      <!-- 展开/折叠图标 -->
      <span
        v-if="node.isDirectory"
        class="expand-icon"
        :class="{ 'is-expanded': node.isExpanded }"
        @click.stop="onExpandClick"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </span>
      <span
        v-else
        class="expand-icon-placeholder"
      />

      <!-- 文件夹/文件图标 -->
      <span class="node-icon">
        <svg
          v-if="node.isDirectory"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="folder-icon"
        >
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      </span>

      <!-- 名称 -->
      <span class="node-name">{{ node.name }}</span>

      <!-- 加载中指示器 -->
      <span
        v-if="node.isLoading"
        class="loading-indicator"
      >
        <span class="loading-dot" />
      </span>

      <!-- 修改标记 -->
      <span
        v-if="isModifiedFile(node)"
        class="modified-indicator"
      >●</span>
    </div>

    <!-- 递归渲染子节点 -->
    <div
      v-if="node.isExpanded && node.children.length > 0"
      class="tree-children"
    >
      <FileTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        @context-menu="(e, n) => $emit('contextMenu', e, n)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-item {
  user-select: none;
}

.item-content {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 28px;
}

.item-content:hover {
  background-color: var(--color-bg-secondary);
}

.item-content.is-active {
  background-color: var(--color-primary-light);
}

.item-content.is-drag-over {
  background-color: var(--color-primary-light);
  outline: 1px dashed var(--color-primary);
}

.item-content.is-active .node-name {
  color: var(--color-primary);
  font-weight: 500;
}

.expand-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  transition: transform 0.15s ease;
  cursor: pointer;
  border-radius: 3px;
}

.expand-icon:hover {
  background-color: var(--color-bg-tertiary);
}

.expand-icon svg {
  width: 12px;
  height: 12px;
  transition: transform 0.15s ease;
}

.expand-icon.is-expanded svg {
  transform: rotate(90deg);
}

.expand-icon-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.node-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.node-icon svg {
  width: 16px;
  height: 16px;
}

.node-icon .folder-icon {
  color: var(--color-accent-yellow, #d4a017);
}

.item-content.is-active .node-icon {
  color: var(--color-primary);
}

.node-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-indicator {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-dot {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  border-radius: 50%;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.modified-indicator {
  font-size: 8px;
  color: var(--color-warning);
  flex-shrink: 0;
}

.tree-children {
  /* 子节点容器，递归渲染 */
}
</style>
