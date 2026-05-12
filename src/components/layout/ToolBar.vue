<script setup lang="ts">
import { inject, ref } from 'vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()

interface EditorController {
  applyFormat: (format: string) => void
  setHeading: (level: number) => void
  insertLink: (href?: string, title?: string) => void
  insertImage: (src?: string, alt?: string, title?: string) => void
  insertCodeBlock: (language?: string) => void
}

const editorController = inject<EditorController>('editorController')

// 标题下拉菜单状态
const headingMenuOpen = ref(false)
const headingLevels = [
  { label: '正文', level: 0 },
  { label: '标题 1', level: 1 },
  { label: '标题 2', level: 2 },
  { label: '标题 3', level: 3 },
  { label: '标题 4', level: 4 }
]

// 链接对话框状态
const linkDialogOpen = ref(false)
const linkHref = ref('')
const linkTitle = ref('')

// 图片对话框状态
const imageDialogOpen = ref(false)
const imageSrc = ref('')
const imageAlt = ref('')

// 代码块对话框状态
const codeBlockDialogOpen = ref(false)
const codeLanguage = ref('')

/**
 * 应用格式
 */
function applyFormat(format: string): void {
  if (fileStore.editorMode === 'instant' && editorController) {
    editorController.applyFormat(format)
  } else {
    // 源码模式：通过事件通知 SourceEditor
    window.dispatchEvent(new CustomEvent('editor:format', { detail: format }))
  }
}

/**
 * 切换标题级别
 */
function handleHeadingSelect(level: number): void {
  headingMenuOpen.value = false
  if (fileStore.editorMode === 'instant' && editorController) {
    editorController.setHeading(level)
  } else {
    window.dispatchEvent(new CustomEvent('editor:heading', { detail: level }))
  }
}

/**
 * 显示插入链接对话框
 */
function insertLink(): void {
  linkDialogOpen.value = true
  linkHref.value = ''
  linkTitle.value = ''
}

/**
 * 确认插入链接
 */
function confirmInsertLink(): void {
  if (linkHref.value.trim()) {
    if (fileStore.editorMode === 'instant' && editorController) {
      editorController.insertLink(linkHref.value.trim(), linkTitle.value.trim())
    } else {
      window.dispatchEvent(new CustomEvent('editor:link', {
        detail: { href: linkHref.value.trim(), title: linkTitle.value.trim() }
      }))
    }
  }
  linkDialogOpen.value = false
}

/**
 * 显示插入图片对话框
 */
function insertImage(): void {
  imageDialogOpen.value = true
  imageSrc.value = ''
  imageAlt.value = ''
}

/**
 * 确认插入图片
 */
function confirmInsertImage(): void {
  if (imageSrc.value.trim()) {
    if (fileStore.editorMode === 'instant' && editorController) {
      editorController.insertImage(imageSrc.value.trim(), imageAlt.value.trim())
    } else {
      window.dispatchEvent(new CustomEvent('editor:image', {
        detail: { src: imageSrc.value.trim(), alt: imageAlt.value.trim() }
      }))
    }
  }
  imageDialogOpen.value = false
}

/**
 * 显示插入代码块对话框
 */
function insertCodeBlock(): void {
  codeBlockDialogOpen.value = true
  codeLanguage.value = ''
}

/**
 * 确认插入代码块
 */
function confirmInsertCodeBlock(): void {
  if (fileStore.editorMode === 'instant' && editorController) {
    editorController.insertCodeBlock(codeLanguage.value.trim())
  } else {
    window.dispatchEvent(new CustomEvent('editor:codeBlock', {
      detail: { language: codeLanguage.value.trim() }
    }))
  }
  codeBlockDialogOpen.value = false
}

/**
 * 插入表格
 */
function insertTable(): void {
  // TODO: 实现表格插入
  console.log('Insert table')
}

/**
 * 选择本地图片文件
 */
async function selectImageFile(): Promise<void> {
  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        // 读取文件为 data URL
        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          if (fileStore.editorMode === 'instant' && editorController) {
            editorController.insertImage(dataUrl, file.name)
          } else {
            window.dispatchEvent(new CustomEvent('editor:image', {
              detail: { src: dataUrl, alt: file.name }
            }))
          }
          imageDialogOpen.value = false
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  } catch (error) {
    console.error('选择图片失败:', error)
  }
}
</script>

<template>
  <div class="toolbar">
    <!-- 格式化按钮组 -->
    <div class="format-group">
      <button
        class="format-btn"
        title="粗体 Ctrl+B"
        @click="applyFormat('bold')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="斜体 Ctrl+I"
        @click="applyFormat('italic')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line
            x1="19"
            y1="4"
            x2="10"
            y2="4"
          />
          <line
            x1="14"
            y1="20"
            x2="5"
            y2="20"
          />
          <line
            x1="15"
            y1="4"
            x2="9"
            y2="20"
          />
        </svg>
      </button>
      <button
        class="format-btn"
        title="删除线"
        @click="applyFormat('strikethrough')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M16 4H9a3 3 0 000 6h6a3 3 0 010 6H8" />
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
          />
        </svg>
      </button>
    </div>

    <div class="toolbar-divider" />

    <!-- 块级元素 -->
    <div class="format-group">
      <!-- 标题下拉菜单 -->
      <div class="dropdown-container">
        <button
          class="format-btn"
          title="标题"
          @click="headingMenuOpen = !headingMenuOpen"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M6 4v16M18 4v16M6 12h12" />
          </svg>
          <!-- 标题下拉菜单 -->
          <div
            v-if="headingMenuOpen"
            class="dropdown-menu"
          >
            <button
              v-for="item in headingLevels"
              :key="item.level"
              class="dropdown-item"
              @click.stop="handleHeadingSelect(item.level)"
            >
              <span v-if="item.level === 0">正文</span>
              <span
                v-else
                :class="'h' + item.level"
              >{{ item.label }}</span>
            </button>
          </div>
        </button>
      </div>
      <button
        class="format-btn"
        title="无序列表"
        @click="applyFormat('unorderedList')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="有序列表"
        @click="applyFormat('orderedList')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M10 6h11M10 12h11M10 18h11M4 6V4l-1 1M3 10h2M4 10v4" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="引用"
        @click="applyFormat('blockquote')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="代码块"
        @click="insertCodeBlock"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
    </div>
    <div class="toolbar-divider" />

    <!-- 插入元素 -->
    <div class="format-group">
      <button
        class="format-btn"
        title="链接 Ctrl+K"
        @click="insertLink"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="图片"
        @click="insertImage"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
            ry="2"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="1.5"
          />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>
      <button
        class="format-btn"
        title="表格"
        @click="insertTable"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
          />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
      </button>
    </div>

    <!-- 链接对话框 -->
    <div
      v-if="linkDialogOpen"
      class="dialog-overlay"
      @click="linkDialogOpen = false"
    >
      <div
        class="dialog"
        @click.stop
      >
        <h3 class="dialog-title">
          插入链接
        </h3>
        <input
          v-model="linkHref"
          type="text"
          placeholder="链接地址 (https://...)"
          class="dialog-input"
          @keydown.enter="confirmInsertLink"
        >
        <input
          v-model="linkTitle"
          type="text"
          placeholder="标题 (可选)"
          class="dialog-input"
          @keydown.enter="confirmInsertLink"
        >
        <div class="dialog-actions">
          <button
            class="dialog-btn dialog-btn-cancel"
            @click="linkDialogOpen = false"
          >
            取消
          </button>
          <button
            class="dialog-btn dialog-btn-confirm"
            @click="confirmInsertLink"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- 图片对话框 -->
    <div
      v-if="imageDialogOpen"
      class="dialog-overlay"
      @click="imageDialogOpen = false"
    >
      <div
        class="dialog"
        @click.stop
      >
        <h3 class="dialog-title">
          插入图片
        </h3>
        <input
          v-model="imageSrc"
          type="text"
          placeholder="图片地址 (URL 或相对路径)"
          class="dialog-input"
          @keydown.enter="confirmInsertImage"
        >
        <input
          v-model="imageAlt"
          type="text"
          placeholder="替代文本 (可选)"
          class="dialog-input"
          @keydown.enter="confirmInsertImage"
        >
        <div class="dialog-divider">
          或
        </div>
        <button
          class="dialog-file-btn"
          @click="selectImageFile"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
          >
            <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
          </svg>
          选择本地图片
        </button>
        <div class="dialog-actions">
          <button
            class="dialog-btn dialog-btn-cancel"
            @click="imageDialogOpen = false"
          >
            取消
          </button>
          <button
            class="dialog-btn dialog-btn-confirm"
            @click="confirmInsertImage"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- 代码块对话框 -->
    <div
      v-if="codeBlockDialogOpen"
      class="dialog-overlay"
      @click="codeBlockDialogOpen = false"
    >
      <div
        class="dialog"
        @click.stop
      >
        <h3 class="dialog-title">
          插入代码块
        </h3>
        <input
          v-model="codeLanguage"
          type="text"
          placeholder="编程语言 (如: javascript, python, 可选)"
          class="dialog-input"
          @keydown.enter="confirmInsertCodeBlock"
        >
        <div class="dialog-actions">
          <button
            class="dialog-btn dialog-btn-cancel"
            @click="codeBlockDialogOpen = false"
          >
            取消
          </button>
          <button
            class="dialog-btn dialog-btn-confirm"
            @click="confirmInsertCodeBlock"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  height: var(--toolbar-height);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background-color: var(--color-border);
}

.format-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.format-btn {
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

.format-btn:hover {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
}

.format-btn svg {
  width: 16px;
  height: 16px;
}

/* 下拉菜单 */
.dropdown-container {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 120px;
  z-index: 100;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
}

.dropdown-item:hover {
  background: var(--color-bg-secondary);
}

.dropdown-item .h1 { font-size: 1.5em; font-weight: 700; }
.dropdown-item .h2 { font-size: 1.3em; font-weight: 600; }
.dropdown-item .h3 { font-size: 1.15em; font-weight: 600; }
.dropdown-item .h4 { font-size: 1em; font-weight: 600; }

/* 对话框 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--color-bg-primary);
  border-radius: 8px;
  padding: 20px;
  min-width: 360px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.dialog-input {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}

.dialog-input:focus {
  border-color: var(--color-primary);
}

.dialog-input::placeholder {
  color: var(--color-text-tertiary);
}

.dialog-divider {
  text-align: center;
  margin: 12px 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  position: relative;
}

.dialog-divider::before,
.dialog-divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 40%;
  height: 1px;
  background: var(--color-border);
}

.dialog-divider::before { left: 0; }
.dialog-divider::after { right: 0; }

.dialog-file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.15s;
}

.dialog-file-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.dialog-btn-cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.dialog-btn-cancel:hover {
  background: var(--color-bg-secondary);
}

.dialog-btn-confirm {
  border: none;
  background: var(--color-primary);
  color: white;
}

.dialog-btn-confirm:hover {
  filter: brightness(1.1);
}
</style>
