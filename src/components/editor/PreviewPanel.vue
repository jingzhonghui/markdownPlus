<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'
import { renderMarkdown } from '../../utils/markdown'
import { createHighlighter, type Highlighter } from 'shiki'

// Props
interface Props {
  /** 是否允许滚动同步 */
  enableScrollSync?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enableScrollSync: false
})

// Emits
const emit = defineEmits<{
  (e: 'scroll', scrollTop: number, scrollHeight: number): void
}>()

// Store
const fileStore = useFileStore()
const themeStore = useThemeStore()

// Refs
const previewRef = ref<HTMLDivElement>()
const shikiHighlighter = ref<Highlighter | null>(null)
const isShikiReady = ref(false)

// 防抖计时器
let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 初始化 Shiki 高亮器
 */
async function initShiki(): Promise<void> {
  try {
    const highlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript', 'typescript', 'python', 'go', 'rust', 'java',
        'c', 'cpp', 'csharp', 'php', 'ruby', 'swift', 'kotlin',
        'html', 'css', 'scss', 'json', 'yaml', 'xml', 'sql',
        'bash', 'powershell', 'dockerfile', 'markdown', 'vue',
        'svelte', 'astro', 'lua', 'perl', 'haskell', 'r', 'dart'
      ]
    })
    shikiHighlighter.value = highlighter
    isShikiReady.value = true
    // 重新渲染以应用高亮
    renderPreview()
  } catch (err) {
    console.error('Shiki 初始化失败:', err)
    isShikiReady.value = false
  }
}

/**
 * 获取当前主题对应的 Shiki 主题
 */
const shikiTheme = computed(() => {
  return themeStore.isDark ? 'github-dark' : 'github-light'
})

/**
 * 渲染后的 HTML 内容
 */
const previewHtml = computed(() => {
  const content = fileStore.fileContent
  const assets = fileStore.imageAssets
  return renderMarkdown(content, assets)
})

/**
 * 渲染预览（带防抖）
 */
function renderPreview(): void {
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer)
  }
  
  renderDebounceTimer = setTimeout(() => {
    applyCodeHighlight()
  }, 100)
}

/**
 * 应用 Shiki 代码高亮
 */
async function applyCodeHighlight(): Promise<void> {
  if (!shikiHighlighter.value || !previewRef.value) return

  const codeBlocks = previewRef.value.querySelectorAll('pre code')
  
  for (const codeBlock of codeBlocks) {
    const element = codeBlock as HTMLElement
    const className = element.className
    const match = className.match(/language-(\w+)/)
    const lang = match ? match[1] : 'text'
    const code = element.textContent || ''

    try {
      const highlighted = shikiHighlighter.value.codeToHtml(code, {
        lang,
        theme: shikiTheme.value
      })
      
      // 提取高亮后的代码内容（去掉外层的 pre 标签）
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = highlighted
      const preElement = tempDiv.querySelector('pre')
      if (preElement) {
        element.innerHTML = preElement.innerHTML
        element.className = `shiki ${className}`
      }
    } catch {
      // 如果语言不支持，保持原样
      element.className = `shiki ${className}`
    }
  }
}

/**
 * 处理滚动事件
 */
function handleScroll(): void {
  if (!previewRef.value || !props.enableScrollSync) return
  
  const container = previewRef.value.parentElement
  if (!container) return
  
  emit('scroll', container.scrollTop, container.scrollHeight)
}

/**
 * 滚动到指定位置
 */
function scrollTo(position: number): void {
  const container = previewRef.value?.parentElement
  if (container) {
    container.scrollTop = position
  }
}

/**
 * 滚动到指定行对应的元素
 */
function scrollToLine(line: number): void {
  if (!previewRef.value) return
  
  // 根据行号查找对应元素（这里简化处理，实际可能需要更复杂的映射）
  const headings = previewRef.value.querySelectorAll('h1, h2, h3, h4, h5, h6')
  if (headings.length > 0 && line <= headings.length) {
    const target = headings[line - 1]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

// 监听内容变化
watch(() => fileStore.fileContent, () => {
  nextTick(() => {
    renderPreview()
  })
})

// 监听主题变化
watch(() => themeStore.isDark, () => {
  nextTick(() => {
    applyCodeHighlight()
  })
})

// Lifecycle
onMounted(() => {
  initShiki()
  renderPreview()
})

// Expose methods
defineExpose({
  scrollTo,
  scrollToLine
})
</script>

<template>
  <div class="preview-container">
    <div class="preview-header">
      <span class="preview-title">预览</span>
      <div class="preview-actions">
        <button 
          v-if="!isShikiReady" 
          class="preview-status"
          title="代码高亮加载中"
        >
          <span class="loading-dot" />
          加载中
        </button>
      </div>
    </div>
    <div
      class="preview-content-wrapper"
      @scroll="handleScroll"
    >
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
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.preview-title {
  font-weight: 600;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  cursor: default;
}

.loading-dot {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  border-radius: 50%;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.preview-content-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.preview-content {
  padding: 24px 32px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text);
  max-width: 100%;
}

/* Markdown 样式 */
.preview-content :deep(h1),
.preview-content :deep(h2),
.preview-content :deep(h3),
.preview-content :deep(h4),
.preview-content :deep(h5),
.preview-content :deep(h6) {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-text);
}

.preview-content :deep(h1) {
  font-size: 2em;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.3em;
}

.preview-content :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.3em;
}

.preview-content :deep(h3) {
  font-size: 1.25em;
}

.preview-content :deep(h4) {
  font-size: 1em;
}

.preview-content :deep(h5) {
  font-size: 0.875em;
}

.preview-content :deep(h6) {
  font-size: 0.85em;
  color: var(--color-text-secondary);
}

.preview-content :deep(p) {
  margin: 0 0 16px;
}

.preview-content :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}

.preview-content :deep(a:hover) {
  text-decoration: underline;
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
  margin: 0 0 16px;
  padding-left: 2em;
}

.preview-content :deep(ul ul),
.preview-content :deep(ul ol),
.preview-content :deep(ol ul),
.preview-content :deep(ol ol) {
  margin-top: 0;
  margin-bottom: 0;
}

.preview-content :deep(li) {
  margin: 0.25em 0;
}

.preview-content :deep(li + li) {
  margin-top: 0.25em;
}

.preview-content :deep(li > p) {
  margin-top: 16px;
}

.preview-content :deep(li + li > p) {
  margin-top: 0;
}

.preview-content :deep(li > p:first-child) {
  margin-top: 0;
}

.preview-content :deep(li > p:last-child) {
  margin-bottom: 0;
}

/* 任务列表 */
.preview-content :deep(li.task-list-item) {
  list-style-type: none;
  padding-left: 1.5em;
  position: relative;
}

.preview-content :deep(li.task-list-item::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0.35em;
  width: 1em;
  height: 1em;
  border: 2px solid var(--color-border);
  border-radius: 3px;
  background-color: var(--color-bg-primary);
}

.preview-content :deep(li.task-list-item[data-checked="true"]::before) {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z'/%3E%3C/svg%3E");
  background-size: 75%;
  background-position: center;
  background-repeat: no-repeat;
}

.preview-content :deep(li.task-list-item[data-checked="true"]) {
  text-decoration: line-through;
  color: var(--color-text-tertiary);
}

.preview-content :deep(blockquote) {
  margin: 0 0 16px;
  padding: 0 1em;
  color: var(--color-text-secondary);
  border-left: 4px solid var(--color-border);
}

.preview-content :deep(blockquote > :first-child) {
  margin-top: 0;
}

.preview-content :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.preview-content :deep(code) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  font-family: var(--font-mono);
  background-color: var(--color-bg-secondary);
  border-radius: 3px;
}

.preview-content :deep(pre) {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background-color: var(--color-bg-secondary);
  border-radius: 6px;
  margin: 0 0 16px;
}

.preview-content :deep(pre code) {
  display: inline;
  max-width: auto;
  padding: 0;
  margin: 0;
  overflow: visible;
  line-height: inherit;
  word-wrap: normal;
  background-color: transparent;
  border: 0;
}

/* Shiki 高亮样式 */
.preview-content :deep(.shiki) {
  background-color: var(--color-bg-secondary) !important;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
}

.preview-content :deep(.shiki code) {
  background: none;
  padding: 0;
  font-size: 100%;
}

.preview-content :deep(table) {
  display: block;
  width: 100%;
  overflow: auto;
  margin: 0 0 16px;
  border-spacing: 0;
  border-collapse: collapse;
}

.preview-content :deep(table th),
.preview-content :deep(table td) {
  padding: 6px 13px;
  border: 1px solid var(--color-border);
}

.preview-content :deep(table tr) {
  background-color: var(--color-bg-primary);
  border-top: 1px solid var(--color-border);
}

.preview-content :deep(table tr:nth-child(2n)) {
  background-color: var(--color-bg-secondary);
}

.preview-content :deep(table th) {
  font-weight: 600;
  background-color: var(--color-bg-secondary);
}

.preview-content :deep(img) {
  max-width: 100%;
  box-sizing: content-box;
  background-color: var(--color-bg-primary);
  border-radius: 4px;
}

.preview-content :deep(hr) {
  height: 4px;
  padding: 0;
  margin: 24px 0;
  background-color: var(--color-border);
  border: 0;
}

.preview-content :deep(del) {
  text-decoration: line-through;
  color: var(--color-text-tertiary);
}

.preview-content :deep(.emoji) {
  font-size: 1.2em;
}

/* 代码块语言标签 */
.preview-content :deep(pre[class*="language-"]) {
  position: relative;
}

.preview-content :deep(pre[class*="language-"])::before {
  content: attr(data-lang);
  position: absolute;
  top: 0;
  right: 0;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background-color: var(--color-bg-tertiary);
  border-bottom-left-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
