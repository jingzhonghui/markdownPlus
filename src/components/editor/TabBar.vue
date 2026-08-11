<script setup lang="ts">
import { reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useFileStore } from '../../stores/file'
import type { TabInfo } from '../../stores/file'

const fileStore = useFileStore()

async function handleTabClick(tabId: string): Promise<void> {
  await fileStore.setActiveTab(tabId)
}

function handleMiddleClick(tabId: string, event: MouseEvent): void {
  if (event.button === 1) {
    event.preventDefault()
    fileStore.closeTab(tabId)
  }
}

async function handleCloseTab(tabId: string, event: MouseEvent): Promise<void> {
  event.stopPropagation()
  await fileStore.closeTab(tabId)
}

function getTabLabel(tab: TabInfo): string {
  if (tab.fileInfo?.format !== 'markdown' && tab.document?.metadata?.title && tab.document.metadata.title !== '未命名文档') {
    return `${tab.document.metadata.title}.mdx`
  }
  return tab.fileInfo?.name || '未命名.mdx'
}

const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'markdown-plus:close-context-menus'

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
  window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
  contextMenu.items = items
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.visible = true

  nextTick(() => {
    const menuEl = document.querySelector('.tab-context-menu') as HTMLElement | null
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

function onTabContextMenu(event: MouseEvent, tab: TabInfo): void {
  const items: ContextMenuItem[] = [
    {
      label: '导出 PDF',
      action: () => { void fileStore.exportTabToPdf(tab.id) }
    },
    {
      label: '关闭',
      action: () => { void fileStore.closeTab(tab.id) }
    },
    {
      label: '关闭其他',
      action: () => { void fileStore.closeOtherTabs(tab.id) }
    },
    {
      label: '关闭全部',
      action: () => { void fileStore.closeAllTabs() }
    },
    {
      label: '打开文件所在位置',
      action: () => { tab.fileInfo?.path && fileStore.revealInExplorer(tab.fileInfo.path) }
    }
  ]
  showContextMenu(event, items)
}

onMounted(() => {
  document.addEventListener('click', closeContextMenu)
  document.addEventListener('contextmenu', closeContextMenu, true)
  window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('contextmenu', closeContextMenu, true)
  window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
})
</script>

<template>
  <div
    v-if="fileStore.tabs.length > 0"
    class="tab-bar"
  >
    <div
      v-for="tab in fileStore.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === fileStore.activeTabId }"
      @click="handleTabClick(tab.id)"
      @mousedown="handleMiddleClick(tab.id, $event)"
      @contextmenu.prevent.stop="onTabContextMenu($event, tab)"
    >
      <!-- 文件图标 -->
      <svg
        class="tab-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>

      <span class="tab-label">{{ getTabLabel(tab) }}</span>

      <!-- 修改指示器（未保存时显示圆点） -->
      <span
        v-if="tab.fileInfo?.modified"
        class="tab-modified-dot"
      />

      <!-- 关闭按钮 -->
      <button
        class="tab-close-btn"
        @click="handleCloseTab(tab.id, $event)"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  </div>

  <teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="tab-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <div
        v-for="(item, index) in contextMenu.items"
        :key="index"
        class="context-menu-item"
        @click="closeContextMenu(); item.action()"
      >
        {{ item.label }}
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  scrollbar-width: thin;
}

.tab-bar::-webkit-scrollbar {
  height: 3px;
}

.tab-bar::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: 2px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  min-width: 0;
  max-width: 200px;
  border-right: 1px solid var(--color-border);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text-secondary);
  background-color: transparent;
  transition: background-color 0.15s, color 0.15s;
  user-select: none;
}

.tab:hover {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
}

.tab.active {
  background-color: var(--color-bg-primary);
  color: var(--color-text);
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--color-primary);
}

.tab-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.tab.active .tab-icon {
  color: var(--color-primary);
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.tab-modified-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-warning);
  flex-shrink: 0;
}

.tab-close-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s, color 0.15s;
  padding: 0;
}

.tab:hover .tab-close-btn {
  opacity: 1;
}

.tab-close-btn:hover {
  background-color: rgba(128, 128, 128, 0.2);
  color: var(--color-text);
}

.tab-close-btn svg {
  width: 12px;
  height: 12px;
}
</style>

<style>
.tab-context-menu {
  position: fixed;
  z-index: 10001;
  min-width: 160px;
  padding: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.tab-context-menu .context-menu-item {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}

.tab-context-menu .context-menu-item:hover {
  background: var(--color-bg-secondary);
}
</style>
