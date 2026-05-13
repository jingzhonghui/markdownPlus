<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useThemeStore } from './stores/theme'
import { useFileStore } from './stores/file'
import AppHeader from './components/layout/AppHeader.vue'
import ToolBar from './components/layout/ToolBar.vue'
import SideBar from './components/layout/SideBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import EditorPanel from './components/editor/EditorPanel.vue'

const themeStore = useThemeStore()
const fileStore = useFileStore()

// 侧边栏折叠状态
const sidebarCollapsed = ref(false)

/**
 * 切换侧边栏折叠状态
 */
function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

/**
 * 处理窗口关闭确认事件
 * 主进程检测到未保存修改时发送此事件
 */
async function handleConfirmClose(): Promise<void> {
  const canClose = await fileStore.confirmSaveBeforeClose()
  if (canClose && window.electronAPI?.closeConfirmed) {
    await window.electronAPI.closeConfirmed()
  }
}

let removeConfirmCloseListener: (() => void) | null = null

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()
  // 初始化文件状态
  fileStore.init()

  // 监听窗口关闭确认事件
  if (window.electronAPI?.onConfirmClose) {
    removeConfirmCloseListener = window.electronAPI.onConfirmClose(handleConfirmClose)
  }
})

onUnmounted(() => {
  if (removeConfirmCloseListener) {
    removeConfirmCloseListener()
  }
})
</script>

<template>
  <div
    class="app-container"
    :data-theme="themeStore.currentTheme"
  >
    <!-- 顶部菜单栏 -->
    <AppHeader @toggle-sidebar="toggleSidebar" />
    
    <!-- 工具栏 -->
    <ToolBar />

    <!-- 主体区域 -->
    <div class="main-content">
      <!-- 左侧边栏 -->
      <SideBar
        :collapsed="sidebarCollapsed"
        @toggle="toggleSidebar"
      />
      
      <!-- 编辑区域 -->
      <EditorPanel />
    </div>
    
    <!-- 状态栏 -->
    <StatusBar />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg);
  color: var(--color-text);
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
