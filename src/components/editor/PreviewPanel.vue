<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFileStore } from '../../stores/file'

const fileStore = useFileStore()
const previewRef = ref<HTMLDivElement>()

/**
 * 简单的 Markdown 转 HTML（演示用）
 */
const previewHtml = computed(() => {
  let html = fileStore.fileContent
    // 转义 HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 标题
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // 粗体和斜体
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // 删除线
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 代码块
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // 引用
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    // 无序列表
    .replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>')
    .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
    // 有序列表
    .replace(/^\d+\. (.*$)/gim, '<ol><li>$1</li></ol>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    // 水平线
    .replace(/^\-\-\-+/gim, '<hr>')
    .replace(/^\*\*\*+/gim, '<hr>')
    // 段落
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  
  // 合并相邻的列表项
  html = html
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/<\/ol>\s*<ol>/g, '')
    .replace(/<\/blockquote>\s*<blockquote>/g, '<br>')
  
  return '<p>' + html + '</p>'
})

// 监听内容变化，可以在这里添加滚动同步逻辑
watch(() => fileStore.fileContent, () => {
  // TODO: 滚动同步
})
</script>

<template>
  <div class="preview-container">
    <div class="preview-header">
      <span>预览</span>
    </div>
    <div class="preview-content-wrapper">
      <div
        ref="previewRef"
        class="preview-content"
        v-html="previewHtml"
      />
    </div>
  </div>
</template>

<style scoped>
.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
  border-left: 1px solid var(--color-border);
}

.preview-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.preview-content-wrapper {
  flex: 1;
  overflow-y: auto;
}

.preview-content {
  padding: 24px 32px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text);
}

/* Markdown 样式 */
.preview-content :deep(h1) {
  font-size: 2em;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.67em 0;
  font-weight: 700;
}

.preview-content :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.75em 0;
  font-weight: 600;
}

.preview-content :deep(h3) {
  font-size: 1.25em;
  margin: 0.83em 0;
  font-weight: 600;
}

.preview-content :deep(p) {
  margin: 1em 0;
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
  margin: 1em 0;
  padding-left: 2em;
}

.preview-content :deep(li) {
  margin: 0.5em 0;
}

.preview-content :deep(blockquote) {
  border-left: 4px solid var(--color-border);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--color-text-secondary);
}

.preview-content :deep(code) {
  background: var(--color-bg-secondary);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: var(--font-mono);
}

.preview-content :deep(pre) {
  background: var(--color-bg-secondary);
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 1em 0;
}

.preview-content :deep(pre code) {
  background: none;
  padding: 0;
}

.preview-content :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}

.preview-content :deep(a:hover) {
  text-decoration: underline;
}

.preview-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.preview-content :deep(hr) {
  border: none;
  border-top: 2px solid var(--color-border);
  margin: 1.5em 0;
}

.preview-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.5em;
}

.preview-content :deep(th) {
  background: var(--color-bg-secondary);
  font-weight: 600;
}

.preview-content :deep(del) {
  text-decoration: line-through;
  color: var(--color-text-tertiary);
}
</style>
