<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useThemeStore } from './stores/theme'
import { useFileStore } from './stores/file'
import { useUpdateStore } from './stores/update'
import { useFileDrop } from './composables/useFileDrop'
import { useAiStore } from './stores/ai'
import AppHeader from './components/layout/AppHeader.vue'
import SideBar from './components/layout/SideBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import EditorPanel from './components/editor/EditorPanel.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import PdfExportView from './components/export/PdfExportView.vue'
import PdfBatchProgressDialog from './components/export/PdfBatchProgressDialog.vue'
import UpdateDialog from './components/update/UpdateDialog.vue'
import FileDropOverlay from './components/common/FileDropOverlay.vue'
import AiSettingsDialog from './components/ai/AiSettingsDialog.vue'
import AiApprovalDialog from './components/ai/AiApprovalDialog.vue'

const themeStore = useThemeStore()
const fileStore = useFileStore()
const updateStore = useUpdateStore()
const { init: initFileDrop, dispose: disposeFileDrop } = useFileDrop()
const aiStore = useAiStore()
const aiSettingsOpen = ref(false)
const aiReady = ref(false)
const openAiSettings = (): void => { aiSettingsOpen.value = true }

async function loadAiReadiness(): Promise<void> {
  aiReady.value = false
  try {
    const result = await window.electronAPI.getAiConfig()
    aiReady.value = result.success && result.data?.ready === true
  } catch {
    aiReady.value = false
  }
}

/**
 * 处理窗口关闭确认事件
 * 主进程检测到未保存修改时发送此事件
 */
async function handleConfirmClose(): Promise<void> {
  const canClose = await fileStore.confirmSaveBeforeClose()
  if (canClose && window.electronAPI?.closeConfirmed) {
    fileStore.cleanupTimers()
    await window.electronAPI.closeConfirmed()
  }
}

let removeConfirmCloseListener: (() => void) | null = null

onMounted(() => {
  themeStore.initTheme()
  void fileStore.init()
  updateStore.init()
  initFileDrop()
  aiStore.init()
  void loadAiReadiness()

  if (window.electronAPI?.onConfirmClose) {
    removeConfirmCloseListener = window.electronAPI.onConfirmClose(handleConfirmClose)
  }
})

onUnmounted(() => {
  if (removeConfirmCloseListener) {
    removeConfirmCloseListener()
  }
  disposeFileDrop()
  updateStore.dispose()
  fileStore.cleanupTimers()
  aiStore.dispose()
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
      <EditorPanel
        :ai-ready="aiReady"
        @open-ai-settings="openAiSettings"
      />
    </div>
    
    <!-- 状态栏 -->
    <StatusBar />

    <ConfirmDialog />
    <PdfExportView />
    <PdfBatchProgressDialog />
    <UpdateDialog />
    <FileDropOverlay />
    <AiSettingsDialog
      :open="aiSettingsOpen"
      @close="aiSettingsOpen = false"
      @readiness="aiReady = $event"
    />
    <AiApprovalDialog />
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
