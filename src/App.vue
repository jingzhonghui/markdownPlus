<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useThemeStore } from './stores/theme'
import { useFileStore } from './stores/file'
import AppHeader from './components/layout/AppHeader.vue'
import SideBar from './components/layout/SideBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import EditorPanel from './components/editor/EditorPanel.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'

const themeStore = useThemeStore()
const fileStore = useFileStore()

/**
 * 处理窗口关闭确认事件
 * 主进程检测到未保存修改时发送此事件
 */
async function handleConfirmClose(): Promise<void> {
  const canClose = await fileStore.confirmSaveBeforeClose()
  if (canClose && window.electronAPI?.closeConfirmed) {
    fileStore.stopAutoSave()
    await window.electronAPI.closeConfirmed()
  }
}

let removeConfirmCloseListener: (() => void) | null = null
let cleanupAutoSaveListeners: (() => void) | null = null

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()
  // 初始化文件状态
  void fileStore.init()

  const saveOnBackground = (): void => {
    void fileStore.autoSave()
  }
  document.addEventListener('visibilitychange', saveOnBackground)
  window.addEventListener('blur', saveOnBackground)
  cleanupAutoSaveListeners = () => {
    document.removeEventListener('visibilitychange', saveOnBackground)
    window.removeEventListener('blur', saveOnBackground)
  }

  // 监听窗口关闭确认事件
  if (window.electronAPI?.onConfirmClose) {
    removeConfirmCloseListener = window.electronAPI.onConfirmClose(handleConfirmClose)
  }
})

onUnmounted(() => {
  if (removeConfirmCloseListener) {
    removeConfirmCloseListener()
  }
  cleanupAutoSaveListeners?.()
  fileStore.stopAutoSave()
})
</script>

<template>
  <div
    class="app-container"
    :data-theme="themeStore.currentTheme"
  >
    <!-- 顶部标题栏 -->
    <AppHeader />

    <!-- 主体区域 -->
    <div class="main-content">
      <!-- 左侧边栏 -->
      <SideBar
        :collapsed="fileStore.sidebarCollapsed"
        @toggle="fileStore.toggleSidebar"
      />
      
      <!-- 编辑区域 -->
      <EditorPanel />
    </div>
    
    <!-- 状态栏 -->
    <StatusBar />

    <ConfirmDialog />
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
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
