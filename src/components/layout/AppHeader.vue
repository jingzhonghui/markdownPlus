<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'

const fileStore = useFileStore()
const themeStore = useThemeStore()

const title = computed(() => {
  return fileStore.displayTitle + ' - Markdown+'
})

/**
 * 处理菜单点击
 */
function handleMenuClick(menu: string): void {
  console.log('Menu clicked:', menu)
  // TODO: 实现菜单功能
}

/**
 * 新建文件
 */
async function newFile(): Promise<void> {
  await fileStore.newFile()
}

/**
 * 打开文件
 */
async function openFile(): Promise<void> {
  await fileStore.openFile()
}

/**
 * 保存文件
 */
async function saveFile(): Promise<void> {
  await fileStore.saveFile()
}

/**
 * 切换主题
 */
function toggleTheme(): void {
  themeStore.toggleTheme()
}

/**
 * 显示导出对话框
 */
function showExport(): void {
  console.log('Show export dialog')
  // TODO: 实现导出功能
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <!-- Logo -->
      <div class="logo">
        <div class="logo-icon">
          M+
        </div>
        <span class="logo-text">Markdown+</span>
      </div>
      
      <!-- 菜单栏 -->
      <nav class="menu-bar">
        <div
          class="menu-item"
          @click="newFile"
        >
          新建
        </div>
        <div
          class="menu-item"
          @click="openFile"
        >
          打开
        </div>
        <div
          class="menu-item"
          @click="saveFile"
        >
          保存
        </div>
        <div class="menu-divider" />
        <div
          class="menu-item"
          @click="handleMenuClick('undo')"
        >
          撤销
        </div>
        <div
          class="menu-item"
          @click="handleMenuClick('redo')"
        >
          重做
        </div>
      </nav>
    </div>
    
    <div class="header-right">
      <!-- 主题切换按钮 -->
      <button 
        class="icon-btn" 
        :title="themeStore.isDark ? '切换到浅色主题' : '切换到深色主题'"
        @click="toggleTheme"
      >
        <svg
          v-if="themeStore.isDark"
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx="12"
            cy="12"
            r="5"
            stroke-width="2"
          />
          <path
            stroke-width="2"
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          />
        </svg>
        <svg
          v-else
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-width="2"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      </button>
      
      <!-- 导出按钮 -->
      <button
        class="export-btn"
        @click="showExport"
      >
        导出
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 14px;
}

.logo-text {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text);
}

.menu-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.menu-item {
  padding: 4px 10px;
  font-size: 13px;
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.2s;
}

.menu-item:hover {
  background-color: var(--color-bg-secondary);
}

.menu-divider {
  width: 1px;
  height: 16px;
  background-color: var(--color-border);
  margin: 0 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.icon-btn {
  width: 32px;
  height: 32px;
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

.icon-btn:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
}

.icon {
  width: 18px;
  height: 18px;
}

.export-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  background-color: var(--color-primary);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.2s;
}

.export-btn:hover {
  background-color: var(--color-primary-hover);
}
</style>
