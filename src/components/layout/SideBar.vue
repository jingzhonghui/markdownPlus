<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import FileExplorer from '../sidebar/FileExplorer.vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()

const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 420
const COLLAPSED_SIDEBAR_WIDTH = 48
const sidebarStyle = computed(() => ({
  width: `${props.collapsed ? COLLAPSED_SIDEBAR_WIDTH : fileStore.sidebarWidth}px`
}))
const resizeHandleRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)
let resizeStartX = 0
let resizeStartWidth = 0

interface Props {
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false
})

const emit = defineEmits<{
  toggle: []
}>()

/**
 * 切换侧边栏折叠状态
 */
function toggleSidebar(): void {
  emit('toggle')
}

function updateSidebarWidth(width: number, persist = false): void {
  fileStore.setSidebarWidth(width, persist)
}

function handleResizeMove(event: PointerEvent): void {
  if (!isResizing.value) return
  updateSidebarWidth(resizeStartWidth + event.clientX - resizeStartX)
}

function stopResize(): void {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('pointermove', handleResizeMove)
  document.removeEventListener('pointerup', stopResize)
  document.removeEventListener('pointercancel', stopResize)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  updateSidebarWidth(fileStore.sidebarWidth, true)
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0 || props.collapsed) return
  event.preventDefault()
  resizeStartX = event.clientX
  resizeStartWidth = fileStore.sidebarWidth
  isResizing.value = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  document.addEventListener('pointermove', handleResizeMove)
  document.addEventListener('pointerup', stopResize)
  document.addEventListener('pointercancel', stopResize)
  resizeHandleRef.value?.setPointerCapture(event.pointerId)
}

function handleResizeKeydown(event: KeyboardEvent): void {
  let nextWidth: number | null = null
  if (event.key === 'ArrowLeft') nextWidth = fileStore.sidebarWidth - 10
  if (event.key === 'ArrowRight') nextWidth = fileStore.sidebarWidth + 10
  if (event.key === 'Home') nextWidth = MIN_SIDEBAR_WIDTH
  if (event.key === 'End') nextWidth = MAX_SIDEBAR_WIDTH
  if (nextWidth === null) return
  event.preventDefault()
  updateSidebarWidth(nextWidth, true)
}

onUnmounted(stopResize)

/**
 * 打开文件夹
 */
function openFolder(): void {
  fileStore.openFolder()
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed: props.collapsed, 'is-resizing': isResizing }"
    :style="sidebarStyle"
  >
    <!-- 折叠状态下的图标栏 -->
    <div
      v-if="props.collapsed"
      class="collapsed-bar"
    >
      <button
        class="collapsed-btn"
        title="新建文件"
        @click="fileStore.newFile()"
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
        class="collapsed-btn"
        title="打开文件"
        @click="fileStore.openFile()"
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
        class="collapsed-btn"
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
      <div class="collapsed-divider" />
      <button
        class="collapsed-btn"
        title="展开侧边栏"
        @click="toggleSidebar"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-width="2"
            d="M13 17l5-5-5-5M6 17l5-5-5-5"
          />
        </svg>
      </button>
    </div>

    <!-- 展开状态：显示资源管理器 -->
    <FileExplorer
      v-else
      @collapse="toggleSidebar"
    />
    <div
      v-if="!props.collapsed"
      ref="resizeHandleRef"
      class="sidebar-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧边栏宽度"
      :aria-valuemin="MIN_SIDEBAR_WIDTH"
      :aria-valuemax="MAX_SIDEBAR_WIDTH"
      :aria-valuenow="fileStore.sidebarWidth"
      tabindex="0"
      @pointerdown="startResize"
      @keydown="handleResizeKeydown"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  transition: width 0.2s ease;
  position: relative;
}

.sidebar.is-resizing {
  transition: none;
}

.sidebar.collapsed {
  width: 48px !important;
}

/* 折叠状态下的图标栏 */
.collapsed-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.collapsed-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.collapsed-btn:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
}

.collapsed-btn svg {
  width: 20px;
  height: 20px;
}

.collapsed-divider {
  width: 24px;
  height: 1px;
  background-color: var(--color-border);
  margin: 8px 0;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: 0;
  z-index: 3;
  width: 4px;
  cursor: col-resize;
  touch-action: none;
}

.sidebar-resize-handle:hover,
.sidebar-resize-handle:focus-visible {
  background: var(--color-primary);
  opacity: 0.5;
  outline: none;
}
</style>
