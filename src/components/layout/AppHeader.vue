<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'

const fileStore = useFileStore()
const themeStore = useThemeStore()

// 菜单显示状态
const showFileMenu = ref(false)
const showRecentSubmenu = ref(false)
const isMaximized = ref(false)

/** 从完整路径提取文件名用于显示 */
function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

/** 显示路径（只显示父目录名 + 文件名，类似 VSCode） */
function getDisplayPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  if (parts.length <= 2) return filePath
  return '...' + parts.slice(-2).join('/')
}

/**
 * 新建文件
 */
async function newFile(): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  await fileStore.newFile()
  showFileMenu.value = false
}

/**
 * 打开文件
 */
async function openFile(): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  const success = await fileStore.openFile()
  if (success) {
    console.log('文件打开成功')
  }
  showFileMenu.value = false
}

/**
 * 打开文件夹
 */
async function openFolder(): Promise<void> {
  await fileStore.openFolder()
  showFileMenu.value = false
}

/**
 * 从最近列表打开文件
 */
async function openRecentFile(filePath: string): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  const success = await fileStore.openFile(filePath)
  if (!success) {
    // 文件可能已被删除，从最近列表中移除
    await fileStore.removeRecent(filePath)
  }
  showFileMenu.value = false
  showRecentSubmenu.value = false
}

/**
 * 清空最近文件列表
 */
async function clearRecentFiles(): Promise<void> {
  await fileStore.clearRecent()
  showRecentSubmenu.value = false
}

/**
 * 保存文件
 */
async function saveFile(): Promise<void> {
  const success = await fileStore.saveFile()
  if (success) {
    console.log('文件保存成功')
  }
  showFileMenu.value = false
}

/**
 * 另存为
 */
async function saveAsFile(): Promise<void> {
  const success = await fileStore.saveAsFile()
  if (success) {
    console.log('文件另存成功')
  }
  showFileMenu.value = false
}

/**
 * 导入 Markdown
 */
async function importMarkdown(): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  const success = await fileStore.importMarkdown()
  if (success) {
    console.log('导入成功')
  }
  showFileMenu.value = false
}

/**
 * 从文件夹批量导入 Markdown
 */
async function importFolder(): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  const success = await fileStore.importFolder()
  if (success) {
    console.log('批量导入成功')
  }
  showFileMenu.value = false
}

/**
 * 导出 Markdown
 */
async function exportMarkdown(): Promise<void> {
  const success = await fileStore.exportMarkdown()
  if (success) {
    console.log('导出成功')
  }
  showFileMenu.value = false
}

/**
 * 切换主题
 */
function toggleTheme(): void {
  themeStore.toggleTheme()
}

/**
 * 切换文件菜单
 */
function toggleFileMenu(): void {
  showFileMenu.value = !showFileMenu.value
  showRecentSubmenu.value = false
}

/**
 * 关闭菜单
 */
function closeMenu(): void {
  showFileMenu.value = false
  showRecentSubmenu.value = false
}

/**
 * 窗口控制
 */
function handleMinimize(): void {
  window.electronAPI?.windowMinimize()
}

function handleMaximize(): void {
  window.electronAPI?.windowMaximize()
}

function handleClose(): void {
  window.electronAPI?.windowClose()
}

let removeMaximizedListener: (() => void) | null = null
let removeUnmaximizedListener: (() => void) | null = null

// 快捷键监听
function handleKeydown(e: KeyboardEvent) {
  // Ctrl+N 新建
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault()
    newFile()
  }
  // Ctrl+O 打开
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault()
    openFile()
  }
  // Ctrl+S 保存
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault()
    if (e.shiftKey) {
      saveAsFile()
    } else {
      saveFile()
    }
  }
}

// 添加全局键盘监听
window.addEventListener('keydown', handleKeydown)

/** 点击外部关闭菜单 */
function handleClickOutside(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.menu-dropdown')) {
    closeMenu()
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)

  // 初始化最大化状态
  const maximized = await window.electronAPI?.windowIsMaximized()
  isMaximized.value = maximized ?? false

  // 监听最大化状态变化
  removeMaximizedListener = window.electronAPI?.onWindowMaximized(() => {
    isMaximized.value = true
  }) ?? null
  removeUnmaximizedListener = window.electronAPI?.onWindowUnmaximized(() => {
    isMaximized.value = false
  }) ?? null
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  removeMaximizedListener?.()
  removeUnmaximizedListener?.()
})
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <!-- Logo -->
      <div class="logo">
        <img
          src="../../assets/logo.svg"
          alt="M+"
          class="logo-icon"
        >
        <span class="logo-text">Markdown+</span>
      </div>

      <!-- 菜单栏 -->
      <nav class="menu-bar">
        <!-- 文件菜单 -->
        <div class="menu-dropdown">
          <button
            class="menu-btn"
            :class="{ active: showFileMenu }"
            @click="toggleFileMenu"
          >
            文件
            <svg
              class="menu-arrow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-width="2"
                d="M6 9l6 6 6-6"
              />
            </svg>
          </button>
          <div
            v-show="showFileMenu"
            class="dropdown-menu"
          >
            <div
              class="menu-item"
              @click="newFile"
            >
              <span class="item-label">新建</span>
              <span class="item-shortcut">Ctrl+N</span>
            </div>
            <div
              class="menu-item"
              @click="openFile"
            >
              <span class="item-label">打开...</span>
              <span class="item-shortcut">Ctrl+O</span>
            </div>
            <div
              class="menu-item"
              @click="openFolder"
            >
              <span class="item-label">打开文件夹...</span>
            </div>

            <!-- 打开最近的文件（子菜单） -->
            <div
              class="menu-item submenu-trigger"
              @mouseenter="showRecentSubmenu = true"
              @mouseleave="showRecentSubmenu = false"
            >
              <span class="item-label">打开最近的文件</span>
              <svg
                class="submenu-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  stroke-width="2"
                  d="M9 6l6 6-6 6"
                />
              </svg>

              <!-- 最近文件子菜单 -->
              <div
                v-show="showRecentSubmenu"
                class="submenu"
              >
                <template v-if="fileStore.recentFiles.length > 0">
                  <div
                    v-for="(filePath, index) in fileStore.recentFiles"
                    :key="filePath"
                    class="menu-item recent-file-item"
                    :title="filePath"
                    @click.stop="openRecentFile(filePath)"
                  >
                    <span class="recent-index">{{ index + 1 }}</span>
                    <span class="recent-info">
                      <span class="recent-name">{{ getFileName(filePath) }}</span>
                      <span class="recent-path">{{ getDisplayPath(filePath) }}</span>
                    </span>
                  </div>
                  <div class="menu-divider" />
                  <div
                    class="menu-item clear-recent-item"
                    @click.stop="clearRecentFiles"
                  >
                    <span class="item-label">清除最近文件列表</span>
                  </div>
                </template>
                <div
                  v-else
                  class="menu-item disabled-item"
                >
                  <span class="item-label">无最近打开的文件</span>
                </div>
              </div>
            </div>

            <div class="menu-divider" />
            <div
              class="menu-item"
              @click="saveFile"
            >
              <span class="item-label">保存</span>
              <span class="item-shortcut">Ctrl+S</span>
            </div>
            <div
              class="menu-item"
              @click="saveAsFile"
            >
              <span class="item-label">另存为...</span>
              <span class="item-shortcut">Ctrl+Shift+S</span>
            </div>
            <div class="menu-divider" />
            <div
              class="menu-item"
              @click="importMarkdown"
            >
              <span class="item-label">导入 Markdown</span>
            </div>
            <div
              class="menu-item"
              @click="importFolder"
            >
              <span class="item-label">从文件夹导入</span>
            </div>
            <div
              class="menu-item"
              @click="exportMarkdown"
            >
              <span class="item-label">导出 Markdown</span>
            </div>
          </div>
        </div>

        <div class="menu-divider" />

        <!-- 直接操作按钮 -->
        <button
          class="icon-btn"
          title="新建 (Ctrl+N)"
          @click="newFile"
        >
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>

        <button
          class="icon-btn"
          title="打开文件 (Ctrl+O)"
          @click="openFile"
        >
          <svg
            class="icon"
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
          class="icon-btn"
          title="保存 (Ctrl+S)"
          @click="saveFile"
        >
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-width="2"
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
        </button>
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

      <!-- 窗口控制按钮 -->
      <div class="window-controls">
        <button
          class="window-btn"
          title="最小化"
          @click="handleMinimize"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M3 8h10v1H3z" />
          </svg>
        </button>
        <button
          class="window-btn"
          :title="isMaximized ? '还原' : '最大化'"
          @click="handleMaximize"
        >
          <svg
            v-if="isMaximized"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M3 3h8v2H5v6H3V3zm2 2h8v8H5V5zm2 2v4h4V7H7z" />
          </svg>
          <svg
            v-else
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M3 3h10v10H3V3zm1 1v8h8V4H4z" />
          </svg>
        </button>
        <button
          class="window-btn close"
          title="关闭"
          @click="handleClose"
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
  -webkit-app-region: drag;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  -webkit-app-region: no-drag;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
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

.menu-dropdown {
  position: relative;
}

.menu-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--color-text);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.2s;
}

.menu-btn:hover,
.menu-btn.active {
  background-color: var(--color-bg-secondary);
}

.menu-arrow {
  width: 14px;
  height: 14px;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 220px;
  padding: 6px;
  padding-top: 10px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.2s;
}

.menu-item:hover {
  background-color: var(--color-bg-secondary);
}

.item-label {
  flex: 1;
}

.item-shortcut {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: 16px;
}

.menu-divider {
  height: 1px;
  margin: 6px 0;
  background-color: var(--color-border);
}

/* 子菜单触发器 */
.submenu-trigger {
  position: relative;
}

.submenu-arrow {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.submenu {
  position: absolute;
  top: 0;
  left: 100%;
  min-width: 300px;
  max-height: 400px;
  overflow-y: auto;
  margin-left: 2px;
  padding: 6px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1001;
}

/* 最近文件列表项 */
.recent-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px !important;
}

.recent-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-secondary);
  border-radius: 3px;
  flex-shrink: 0;
}

.recent-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.recent-name {
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-path {
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clear-recent-item {
  color: var(--color-text-secondary) !important;
  font-size: 12px;
}

.clear-recent-item:hover {
  color: var(--color-text) !important;
}

.disabled-item {
  color: var(--color-text-secondary) !important;
  cursor: default !important;
  font-size: 12px;
}

.disabled-item:hover {
  background-color: transparent !important;
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

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  -webkit-app-region: no-drag;
}

/* 窗口控制按钮 */
.window-controls {
  display: flex;
  align-items: center;
  margin-left: 4px;
}

.window-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.window-btn:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
}

.window-btn svg {
  width: 16px;
  height: 16px;
}

.window-btn.close:hover {
  background-color: #e81123;
  color: white;
}
</style>
