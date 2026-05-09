<script setup lang="ts">
import { ref } from 'vue'
import FileExplorer from '../sidebar/FileExplorer.vue'
import AssetManager from '../sidebar/AssetManager.vue'

type PanelType = 'files' | 'assets'

const activePanel = ref<PanelType>('files')

/**
 * 切换面板
 */
function switchPanel(panel: PanelType): void {
  activePanel.value = panel
}
</script>

<template>
  <aside class="sidebar">
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
    
    <!-- 面板内容 -->
    <div class="sidebar-content">
      <FileExplorer v-show="activePanel === 'files'" />
      <AssetManager v-show="activePanel === 'assets'" />
    </div>
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
}

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

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
