<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()
const textareaRef = ref<HTMLTextAreaElement>()

// 监听文件内容变化（打开新文件时）
watch(() => fileStore.fileContent, (newContent) => {
  nextTick(() => {
    if (textareaRef.value && textareaRef.value.value !== newContent) {
      textareaRef.value.value = newContent
    }
  })
}, { immediate: true })

/**
 * 处理输入事件
 */
function handleInput(): void {
  if (textareaRef.value) {
    fileStore.updateContent(textareaRef.value.value)
    updateCursorPosition()
  }
}

/**
 * 处理键盘快捷键
 */
function handleKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    fileStore.saveFile()
  }
  
  // Tab 键插入空格
  if (e.key === 'Tab') {
    e.preventDefault()
    const textarea = textareaRef.value
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end)
      textarea.selectionStart = textarea.selectionEnd = start + 4
      handleInput()
    }
  }
}

/**
 * 更新光标位置
 */
function updateCursorPosition(): void {
  const textarea = textareaRef.value
  if (!textarea) return
  
  const pos = textarea.selectionStart
  const text = textarea.value.substring(0, pos)
  const lines = text.split('\n')
  
  fileStore.setCursorPosition(lines.length, lines[lines.length - 1].length + 1)
}

/**
 * 处理点击和键盘事件更新光标位置
 */
function handleClick(): void {
  updateCursorPosition()
}

function handleKeyup(): void {
  updateCursorPosition()
}
</script>

<template>
  <div class="source-container">
    <textarea
      ref="textareaRef"
      class="source-editor"
      placeholder="在此输入 Markdown 源码..."
      spellcheck="false"
      @input="handleInput"
      @keydown="handleKeydown"
      @click="handleClick"
      @keyup="handleKeyup"
    />
  </div>
</template>

<style scoped>
.source-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.source-editor {
  flex: 1;
  width: 100%;
  height: 100%;
  padding: 24px 32px;
  border: none;
  outline: none;
  resize: none;
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  background-color: var(--color-bg-primary);
  tab-size: 4;
}

.source-editor::placeholder {
  color: var(--color-text-tertiary);
}
</style>
