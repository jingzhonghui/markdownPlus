<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'

const fileStore = useFileStore()
const themeStore = useThemeStore()
const isMaximized = ref(false)

async function newFile(): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  await fileStore.newFile()
}

async function openFile(): Promise<void> {
  if (!await fileStore.confirmSaveBeforeAction()) return
  await fileStore.openFile()
}

async function saveFile(): Promise<void> {
  await fileStore.saveFile()
}

async function saveAsFile(): Promise<void> {
  await fileStore.saveAsFile()
}

function toggleTheme(): void {
  themeStore.toggleTheme()
}

function handleMinimize(): void {
  window.electronAPI?.windowMinimize()
}

function handleMaximize(): void {
  window.electronAPI?.windowMaximize()
}

function handleClose(): void {
  window.electronAPI?.windowClose()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!event.ctrlKey) return

  if (event.key === 'n') {
    event.preventDefault()
    newFile()
  } else if (event.key === 'o') {
    event.preventDefault()
    openFile()
  } else if (event.key === 's') {
    event.preventDefault()
    if (event.shiftKey) {
      saveAsFile()
    } else {
      saveFile()
    }
  }
}

let removeMaximizedListener: (() => void) | null = null
let removeUnmaximizedListener: (() => void) | null = null

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)

  const maximized = await window.electronAPI?.windowIsMaximized()
  isMaximized.value = maximized ?? false

  removeMaximizedListener = window.electronAPI?.onWindowMaximized(() => {
    isMaximized.value = true
  }) ?? null
  removeUnmaximizedListener = window.electronAPI?.onWindowUnmaximized(() => {
    isMaximized.value = false
  }) ?? null
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  removeMaximizedListener?.()
  removeUnmaximizedListener?.()
})
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <img
        src="../../assets/logo.svg"
        alt="M+"
        class="logo-icon"
      >
    </div>

    <div class="window-drag-region" />

    <div class="header-right">
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
  height: var(--header-height);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.logo-icon {
  width: 32px;
  height: 32px;
  display: block;
}

.window-drag-region {
  align-self: stretch;
  flex: 1;
  min-width: 24px;
  -webkit-app-region: drag;
}

.header-right {
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
