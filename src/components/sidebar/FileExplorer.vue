<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useFileStore, type FileTreeNode } from '../../stores/file'
import FileTreeItem from './FileTreeItem.vue'

const fileStore = useFileStore()

const emit = defineEmits<{
  (e: 'collapse'): void
}>()

// ========== 右键菜单状态 ==========
interface ContextMenuItem {
  label: string
  action: () => void
}

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  items: [] as ContextMenuItem[]
})

function closeContextMenu(): void {
  contextMenu.visible = false
}

function showContextMenu(event: MouseEvent, items: ContextMenuItem[]): void {
  contextMenu.items = items
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.visible = true

  // 菜单打开后，下个 tick 调整位置防止超出视口
  nextTick(() => {
    const menuEl = document.querySelector('.context-menu') as HTMLElement | null
    if (!menuEl) return
    const rect = menuEl.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      contextMenu.x = window.innerWidth - rect.width - 8
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.y = window.innerHeight - rect.height - 8
    }
  })
}

function onEmptyContextMenu(event: MouseEvent): void {
  const items: ContextMenuItem[] = [
    { label: '新建文件', action: () => promptCreateFile(fileStore.openedFolderPath!) },
    { label: '新建文件夹', action: () => promptCreateFolder(fileStore.openedFolderPath!) },
    { label: '刷新', action: () => fileStore.readFolder(fileStore.openedFolderPath!) }
  ]
  showContextMenu(event, items)
}

function onFileContextMenu(event: MouseEvent, node: FileTreeNode): void {
  const items: ContextMenuItem[] = [
    { label: '打开', action: () => fileStore.openFile(node.path) },
    { label: '重命名', action: () => promptRename(node) },
    { label: '删除', action: () => promptDelete(node) },
    { label: '复制路径', action: () => fileStore.copyPath(node.path) }
  ]
  showContextMenu(event, items)
}

function onFolderContextMenu(event: MouseEvent, node: FileTreeNode): void {
  const items: ContextMenuItem[] = [
    { label: '新建文件', action: () => promptCreateFile(node.path) },
    { label: '新建文件夹', action: () => promptCreateFolder(node.path) },
    { label: '刷新', action: () => fileStore.loadChildren(node) },
    { label: '重命名', action: () => promptRename(node) },
    { label: '删除', action: () => promptDelete(node) },
    { label: '复制路径', action: () => fileStore.copyPath(node.path) }
  ]
  showContextMenu(event, items)
}

// ========== 输入对话框 ==========
const showInputDialog = ref(false)
const inputDialogTitle = ref('')
const inputValue = ref('')
const inputPlaceholder = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
let inputResolve: ((value: string | null) => void) | null = null

function openInputDialog(title: string, initialValue: string, placeholder: string): Promise<string | null> {
  return new Promise((resolve) => {
    inputDialogTitle.value = title
    inputValue.value = initialValue
    inputPlaceholder.value = placeholder
    showInputDialog.value = true
    inputResolve = resolve
    nextTick(() => inputRef.value?.focus())
  })
}

function confirmInput(): void {
  const val = inputValue.value.trim()
  if (!val) return
  showInputDialog.value = false
  inputResolve?.(val)
  inputResolve = null
}

function cancelInput(): void {
  showInputDialog.value = false
  inputResolve?.(null)
  inputResolve = null
}

// ========== 操作函数 ==========
async function promptCreateFile(dirPath: string): Promise<void> {
  const name = await openInputDialog('新建文件', '未命名.mdx', '文件名 (.mdx / .md)')
  if (!name) return
  await fileStore.createFile(dirPath, name)
}

async function promptCreateFolder(dirPath: string): Promise<void> {
  const name = await openInputDialog('新建文件夹', '新建文件夹', '文件夹名称')
  if (!name) return
  await fileStore.createFolder(dirPath, name)
}

async function promptRename(node: FileTreeNode): Promise<void> {
  const name = await openInputDialog('重命名', node.name, '新名称')
  if (!name || name === node.name) return
  await fileStore.renameItem(node.path, name)
}

async function promptDelete(node: FileTreeNode): Promise<void> {
  const type = node.isDirectory ? '文件夹' : '文件'
  if (!window.confirm(`确定要删除${type} "${node.name}" 吗？\n此操作不可恢复。`)) return
  await fileStore.deleteItem(node.path)
}

// ========== 基础操作 ==========
async function createNewFile(): Promise<void> {
  await fileStore.newFile()
}

async function openFile(): Promise<void> {
  await fileStore.openFile()
}

async function openFolder(): Promise<void> {
  await fileStore.openFolder()
}

function handleNodeContextMenu(event: MouseEvent, node: FileTreeNode): void {
  if (node.isDirectory) {
    onFolderContextMenu(event, node)
  } else {
    onFileContextMenu(event, node)
  }
}

onMounted(() => {
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
})
</script>

<template>
  <div class="file-explorer">
    <!-- 头部操作栏 -->
    <div class="explorer-header">
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
              d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
            />
            <path
              stroke-width="2"
              d="M14 2v6h6"
            />
          </svg>
        </button>
        <button
          class="action-btn"
          title="打开文件夹"
          @click="openFolder"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>
      </div>
      <div class="explorer-collapse">
        <button
          class="action-btn"
          title="收起侧边栏"
          @click="emit('collapse')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M11 17l-5-5 5-5M18 17l-5-5 5-5"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- 文件列表 -->
    <div
      class="file-list"
      @contextmenu.prevent.stop="onEmptyContextMenu"
    >
      <!-- 文件夹浏览 -->
      <div
        v-if="fileStore.openedFolderPath && fileStore.fileTree.length > 0"
        class="file-section"
      >
        <!-- 树形文件列表 -->
        <div class="tree-list">
          <FileTreeItem
            v-for="node in fileStore.fileTree"
            :key="node.path"
            :node="node"
            :depth="0"
            @context-menu="handleNodeContextMenu"
          />
        </div>
      </div>

      <!-- 空状态（未打开文件夹） -->
      <div
        v-if="!fileStore.openedFolderPath"
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
          打开文件夹以浏览文件
        </p>
        <button
          class="empty-action"
          @click="openFolder"
        >
          打开文件夹
        </button>
      </div>
    </div>

    <!-- ====== 右键菜单 ====== -->
    <teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <div
          v-for="(item, index) in contextMenu.items"
          :key="index"
          class="context-menu-item"
          @click="item.action(); closeContextMenu()"
        >
          {{ item.label }}
        </div>
      </div>
    </teleport>

    <!-- ====== 输入对话框（新建/重命名） ====== -->
    <teleport to="body">
      <div
        v-if="showInputDialog"
        class="dialog-overlay"
        @click="cancelInput"
      >
        <div
          class="dialog"
          @click.stop
        >
          <h3 class="dialog-title">
            {{ inputDialogTitle }}
          </h3>
          <input
            ref="inputRef"
            v-model="inputValue"
            class="dialog-input"
            :placeholder="inputPlaceholder"
            @keyup.enter="confirmInput"
            @keyup.escape="cancelInput"
          >
          <div class="dialog-actions">
            <button
              class="dialog-btn dialog-btn-cancel"
              @click="cancelInput"
            >
              取消
            </button>
            <button
              class="dialog-btn dialog-btn-confirm"
              @click="confirmInput"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </teleport>
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

.explorer-actions {
  display: flex;
  gap: 4px;
}

.explorer-collapse {
  display: flex;
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

.action-btn-sm svg {
  width: 14px;
  height: 14px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.folder-title-actions {
  display: flex;
  gap: 2px;
}

.folder-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
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

.file-item.is-directory .file-name {
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

.folder-icon {
  color: var(--color-accent-yellow, #d4a017);
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

.folder-empty {
  padding: 16px 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
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

<!-- 全局样式（不受 scoped 限制，用于 teleport 出去的组件） -->
<style>
.context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 160px;
  padding: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.context-menu-item {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}

.context-menu-item:hover {
  background: var(--color-bg-secondary);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.dialog {
  min-width: 360px;
  padding: 20px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.dialog-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  outline: none;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: var(--color-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-btn {
  padding: 6px 16px;
  font-size: 13px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-btn-cancel {
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
}

.dialog-btn-cancel:hover {
  color: var(--color-text);
}

.dialog-btn-confirm {
  color: #fff;
  background: var(--color-primary);
}

.dialog-btn-confirm:hover {
  background: var(--color-primary-hover);
}
</style>
