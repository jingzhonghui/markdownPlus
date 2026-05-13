<script setup lang="ts">
import FileExplorer from '../sidebar/FileExplorer.vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()

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
    :class="{ collapsed: props.collapsed }"
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

    <!-- 展开状态：直接显示文件浏览器 -->
    <FileExplorer
      v-else
      @collapse="toggleSidebar"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  background-color: var(--color-bg-primary);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  transition: width 0.2s ease;
  position: relative;
}

.sidebar.collapsed {
  width: 48px;
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
</style>
