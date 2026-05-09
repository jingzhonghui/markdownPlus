<script setup lang="ts">
import { ref } from 'vue'
import FileExplorer from '../sidebar/FileExplorer.vue'
import AssetManager from '../sidebar/AssetManager.vue'

type PanelType = 'files' | 'assets'

interface Props {
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false
})

const emit = defineEmits<{
  toggle: []
}>()

const activePanel = ref<PanelType>('files')

/**
 * 切换面板
 */
function switchPanel(panel: PanelType): void {
  activePanel.value = panel
}

/**
 * 切换侧边栏折叠状态
 */
function toggleSidebar(): void {
  emit('toggle')
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
        :class="{ active: activePanel === 'files' }"
        @click="switchPanel('files')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </button>
      <button
        class="collapsed-btn"
        :class="{ active: activePanel === 'assets' }"
        @click="switchPanel('assets')"
      >
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
            stroke-width="2"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="1.5"
            fill="currentColor"
          />
          <path
            stroke-width="2"
            d="M21 15l-5-5L5 21"
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

    <!-- 展开状态下的完整侧边栏 -->
    <template v-else>
      <!-- 面板切换标签 -->
      <div class="sidebar-tabs">
        <button
          class="tab-btn"
          :class="{ active: activePanel === 'files' }"
          @click="switchPanel('files')"
        >
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
          <span>文件</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activePanel === 'assets' }"
          @click="switchPanel('assets')"
        >
          <svg
            class="tab-icon"
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
              stroke-width="2"
            />
            <circle
              cx="8.5"
              cy="8.5"
              r="1.5"
              fill="currentColor"
            />
            <path
              stroke-width="2"
              d="M21 15l-5-5L5 21"
            />
          </svg>
          <span>资源</span>
        </button>
      </div>

      <!-- 折叠按钮 -->
      <button
        class="collapse-btn"
        title="收起侧边栏"
        @click="toggleSidebar"
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

      <!-- 面板内容 -->
      <div class="sidebar-content">
        <FileExplorer v-show="activePanel === 'files'" />
        <AssetManager v-show="activePanel === 'assets'" />
      </div>
    </template>
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

.collapsed-btn.active {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
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

/* 展开状态下的样式 */
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--color-text);
  background-color: var(--color-bg-secondary);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-primary);
  margin-bottom: -1px;
}

.tab-icon {
  width: 16px;
  height: 16px;
}

.collapse-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
}

.collapse-btn:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
}

.collapse-btn svg {
  width: 14px;
  height: 14px;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
