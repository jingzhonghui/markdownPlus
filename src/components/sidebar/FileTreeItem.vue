<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore, type FileTreeNode } from '../../stores/file'

const props = defineProps<{
  node: FileTreeNode
  depth?: number
}>()

const emit = defineEmits<{
  contextMenu: [event: MouseEvent, node: FileTreeNode]
}>()

const fileStore = useFileStore()

const depth = computed(() => props.depth ?? 0)

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
    await fileStore.openFile(props.node.path)
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
</script>

<template>
  <div class="tree-item">
    <div
      class="item-content"
      :class="{
        'is-directory': node.isDirectory,
        'is-active': !node.isDirectory && isActiveFile(node),
      }"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      @click="onClick"
      @contextmenu.prevent.stop="onContextMenu"
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
