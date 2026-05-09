<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import { useFileStore } from './stores/file'
import AppHeader from './components/layout/AppHeader.vue'
import ToolBar from './components/layout/ToolBar.vue'
import SideBar from './components/layout/SideBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import EditorPanel from './components/editor/EditorPanel.vue'

const themeStore = useThemeStore()
const fileStore = useFileStore()

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()
  // 初始化文件状态
  fileStore.init()
})
</script>

<template>
  <div
    class="app-container"
    :data-theme="themeStore.currentTheme"
  >
    <!-- 顶部菜单栏 -->
    <AppHeader />
    
    <!-- 工具栏 -->
    <ToolBar />
    
    <!-- 主体区域 -->
    <div class="main-content">
      <!-- 左侧边栏 -->
      <SideBar />
      
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
