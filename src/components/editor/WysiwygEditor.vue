<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()
const editorRef = ref<HTMLDivElement>()

/**
 * 处理输入事件
 */
function handleInput(): void {
  if (editorRef.value) {
    fileStore.updateContent(editorRef.value.innerText)
  }
}

/**
 * 处理键盘快捷键
 */
function handleKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'b':
        e.preventDefault()
        document.execCommand('bold', false)
        break
      case 'i':
        e.preventDefault()
        document.execCommand('italic', false)
        break
      case 's':
        e.preventDefault()
        fileStore.saveFile()
        break
    }
  }
  
  // Tab 键插入空格
  if (e.key === 'Tab') {
    e.preventDefault()
    document.execCommand('insertText', false, '    ')
  }
}

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerText = fileStore.fileContent
  }
})
</script>

<template>
  <div class="wysiwyg-container">
    <div
      ref="editorRef"
      class="wysiwyg-editor"
      contenteditable="true"
      spellcheck="false"
      @input="handleInput"
      @keydown="handleKeydown"
    >
      <p>在此输入内容，支持 Markdown 语法...</p>
    </div>
  </div>
</template>

<style scoped>
.wysiwyg-container {
  flex: 1;
  overflow-y: auto;
  background-color: var(--color-bg-primary);
}

.wysiwyg-editor {
  min-height: 100%;
  padding: 24px 32px;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.8;
  color: var(--color-text);
  outline: none;
}

.wysiwyg-editor:empty::before {
  content: '在此输入内容，支持 Markdown 语法...';
  color: var(--color-text-tertiary);
}

/* 基础排版样式 */
.wysiwyg-editor :deep(h1) {
  font-size: 2em;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.67em 0;
  font-weight: 700;
}

.wysiwyg-editor :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.75em 0;
  font-weight: 600;
}

.wysiwyg-editor :deep(h3) {
  font-size: 1.25em;
  margin: 0.83em 0;
  font-weight: 600;
}

.wysiwyg-editor :deep(p) {
  margin: 0.5em 0;
}

.wysiwyg-editor :deep(ul),
.wysiwyg-editor :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.wysiwyg-editor :deep(li) {
  margin: 0.25em 0;
}

.wysiwyg-editor :deep(blockquote) {
  border-left: 4px solid var(--color-primary);
  padding: 8px 16px;
  margin: 0.5em 0;
  background: var(--color-primary-light);
  border-radius: 0 4px 4px 0;
}

.wysiwyg-editor :deep(pre) {
  background: var(--color-bg-secondary);
  padding: 12px 16px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.9em;
  overflow-x: auto;
  margin: 0.5em 0;
}

.wysiwyg-editor :deep(code) {
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: var(--font-mono);
}

.wysiwyg-editor :deep(pre code) {
  background: none;
  padding: 0;
}

.wysiwyg-editor :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.wysiwyg-editor :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
}

.wysiwyg-editor :deep(hr) {
  border: none;
  border-top: 2px solid var(--color-border);
  margin: 1.5em 0;
}

.wysiwyg-editor :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.wysiwyg-editor :deep(th),
.wysiwyg-editor :deep(td) {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  min-width: 60px;
}

.wysiwyg-editor :deep(th) {
  background: var(--color-bg-secondary);
  font-weight: 600;
}
</style>
