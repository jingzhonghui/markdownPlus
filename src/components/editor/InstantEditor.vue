<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick
} from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'
import { storeToRefs } from 'pinia'
import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import {
  markdownSchema,
  parseMarkdown,
  serializeMarkdown,
  createPlugins,
  createDocumentChangePlugin,
  taskListClickPlugin
} from '../../utils/prosemirror'
import {
  createInstantPlugins,
  createInstantNodeViews,
  toggleBlockSourceMode
} from '../../utils/prosemirror/instant'
import { TextSelection } from 'prosemirror-state'
import { toggleMark, wrapIn, setBlockType } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { insertImage as insertImageCmd } from '../../utils/prosemirror/keymap'
import FloatToolbar from './FloatToolbar.vue'

const fileStore = useFileStore()
const themeStore = useThemeStore()
const { fileContent } = storeToRefs(fileStore)
const editorRef = ref<HTMLDivElement>()
const viewRef = ref<EditorView | null>(null)
const isUpdating = ref(false)
const isDragging = ref(false)

// 图片缓存
const imageCache = new Map<string, string>()

// 浮动工具栏状态
const floatToolbar = ref({
  visible: false,
  top: 0,
  left: 0,
  isBold: false,
  isItalic: false,
  isStrikethrough: false,
  isCode: false,
  isLink: false
})

/**
 * 当前是否处于源码态（用于 CSS 类切换）
 */
const hasFocus = ref(false)

/**
 * 创建编辑器状态
 */
function createEditorState(content: string): EditorState {
  const doc = parseMarkdown(content || '')

  const plugins = [
    ...createPlugins(markdownSchema),
    ...createInstantPlugins(markdownSchema),
    taskListClickPlugin,
    createDocumentChangePlugin((state) => {
      const markdown = serializeMarkdown(state.doc)
      const currentContent = (fileStore.fileContent || '').replace(/\n+$/, '')
      const newMarkdown = markdown.replace(/\n+$/, '')
      if (currentContent !== newMarkdown) {
        fileStore.updateContent(markdown)
      }
    })
  ]

  return EditorState.create({ doc, plugins })
}

/**
 * 初始化编辑器
 */
function initEditor(): void {
  if (!editorRef.value) return

  const state = createEditorState(fileStore.fileContent)

  const nodeViews = createInstantNodeViews()

  viewRef.value = new EditorView(editorRef.value, {
    state,
    dispatchTransaction: (tr) => {
      const view = viewRef.value
      if (!view) return

      const newState = view.state.apply(tr)
      view.updateState(newState)

      updateFloatToolbar()
    },
    nodeViews,
    attributes: {
      class: 'proseMirror-editor instant-render-editor'
    },
    handleDOMEvents: {
      focus: () => {
        hasFocus.value = true
        return false
      },
      blur: () => {
        hasFocus.value = false
        return false
      }
    }
  })

  document.addEventListener('selectionchange', handleSelectionChange)
}

/**
 * 处理选区变化
 */
function handleSelectionChange(): void {
  if (!viewRef.value) return
  updateFloatToolbar()
}

/**
 * 更新浮动工具栏状态和位置
 */
function updateFloatToolbar(): void {
  const view = viewRef.value
  if (!view) return

  const { state } = view
  const { selection } = state
  const { from, to, empty } = selection

  if (empty) {
    floatToolbar.value.visible = false
    return
  }

  const startCoords = view.coordsAtPos(from)
  const endCoords = view.coordsAtPos(to)
  const editorRect = editorRef.value?.getBoundingClientRect()
  if (!editorRect) return

  const toolbarWidth = 280
  const centerX = (startCoords.left + endCoords.left) / 2
  const left = Math.max(10, Math.min(
    centerX - toolbarWidth / 2 - editorRect.left,
    editorRect.width - toolbarWidth - 10
  ))

  floatToolbar.value = {
    visible: true,
    top: startCoords.top - editorRect.top - 50,
    left,
    isBold: !!state.doc.rangeHasMark(from, to, state.schema.marks.bold),
    isItalic: !!state.doc.rangeHasMark(from, to, state.schema.marks.italic),
    isStrikethrough: !!state.doc.rangeHasMark(from, to, state.schema.marks.strikethrough),
    isCode: !!state.doc.rangeHasMark(from, to, state.schema.marks.code),
    isLink: !!state.doc.rangeHasMark(from, to, state.schema.marks.link)
  }
}

/**
 * 应用行内标记
 */
function applyMark(markName: 'bold' | 'italic' | 'strikethrough' | 'code'): void {
  const view = viewRef.value
  if (!view) return
  const { state, dispatch } = view
  const markType = state.schema.marks[markName]
  toggleMark(markType)(state, dispatch)
  view.focus()
}

/**
 * 应用链接
 */
function applyLink(href: string, title?: string): void {
  const view = viewRef.value
  if (!view) return
  const { state, dispatch } = view
  const markType = state.schema.marks.link
  toggleMark(markType, { href, title })(state, dispatch)
  view.focus()
}

/**
 * 设置块级类型
 */
function setBlockTypeCommand(type: string, attrs?: Record<string, unknown>): void {
  const view = viewRef.value
  if (!view) return
  const { state, dispatch } = view
  const nodeType = state.schema.nodes[type]

  if (type === 'paragraph') {
    setBlockType(nodeType)(state, dispatch)
  } else if (type === 'heading') {
    setBlockType(nodeType, attrs)(state, dispatch)
  } else if (type === 'code_block') {
    setBlockType(nodeType, attrs)(state, dispatch)
  } else if (type === 'blockquote') {
    wrapIn(nodeType)(state, dispatch)
  } else if (type === 'bullet_list') {
    wrapInList(nodeType)(state, dispatch)
  } else if (type === 'ordered_list') {
    wrapInList(nodeType, attrs)(state, dispatch)
  }

  view.focus()
}

/**
 * 切换标题
 */
function toggleHeadingLevel(level: number): void {
  const view = viewRef.value
  if (!view) return

  const { state, dispatch } = view
  import('../../utils/prosemirror/keymap').then(({ toggleHeading }) => {
    toggleHeading(level)(state, dispatch)
    view.focus()
  })
}

/**
 * 隐藏浮动工具栏
 */
function hideFloatToolbar(): void {
  floatToolbar.value.visible = false
}

/**
 * 处理容器点击
 */
function handleContainerClick(e: MouseEvent): void {
  const view = viewRef.value
  if (!view) return

  const target = e.target as HTMLElement
  if (target === editorRef.value || target.classList.contains('instant-container')) {
    view.focus()
  }

  // 处理代码块点击（从渲染态切换到源码态）
  const codeBlock = target.closest('.ir-code-rendered')
  if (codeBlock) {
    const blockEl = codeBlock.closest('.ir-block')
    if (blockEl) {
      // 通过 ProseMirror 获取位置并切换
      const pos = view.posAtDOM(blockEl as Node, 0)
      if (pos !== null) {
        const tr = toggleBlockSourceMode(view.state, pos)
        view.dispatch(tr)
        view.focus()
      }
    }
  }
}

/**
 * 处理拖放事件
 */
function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent): void {
  e.preventDefault()
  isDragging.value = false
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  isDragging.value = false

  if (!e.dataTransfer) return

  const files = Array.from(e.dataTransfer.files)
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await insertImageFromFile(file)
    }
  }

  const url = e.dataTransfer.getData('text/uri-list')
  if (url && isImageUrl(url)) {
    insertImageFromUrl(url)
  }
}

/**
 * 处理粘贴事件
 */
async function handlePaste(e: ClipboardEvent): Promise<void> {
  if (!e.clipboardData) return

  const files = Array.from(e.clipboardData.files)
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      e.preventDefault()
      await insertImageFromFile(file)
      return
    }
  }
}

/**
 * 从文件插入图片
 */
async function insertImageFromFile(file: File): Promise<void> {
  const result = await fileStore.addImage(file)
  if (result.success && result.path) {
    const view = viewRef.value
    if (!view) return
    const { state, dispatch } = view
    insertImageCmd(result.path, file.name)(state, dispatch)
    view.focus()
  }
}

/**
 * 从 URL 插入图片
 */
function insertImageFromUrl(url: string): void {
  const view = viewRef.value
  if (!view) return
  const { state, dispatch } = view
  insertImageCmd(url)(state, dispatch)
  view.focus()
}

/**
 * 检查是否是图片 URL
 */
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)
}

/**
 * 加载并显示编辑器中的图片
 */
async function loadEditorImages(): Promise<void> {
  if (!editorRef.value) return

  const images = editorRef.value.querySelectorAll('img')

  for (const img of images) {
    const src = img.getAttribute('src')
    if (!src) continue

    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      continue
    }

    if (imageCache.has(src)) {
      img.src = imageCache.get(src)!
      continue
    }

    try {
      const result = await fileStore.getImage(src)
      if (result.success && result.data) {
        imageCache.set(src, result.data)
        img.src = result.data
      }
    } catch (err) {
      console.error('加载图片失败:', src, err)
    }
  }
}

// 监听文件内容变化
watch(fileContent, (newContent) => {
  const view = viewRef.value
  if (!view) return

  const currentMarkdown = serializeMarkdown(view.state.doc).replace(/\n+$/, '')
  const normalizedNewContent = (newContent || '').replace(/\n+$/, '')
  if (currentMarkdown === normalizedNewContent) return

  isUpdating.value = true

  const { selection } = view.state
  const anchorPos = selection.anchor
  const headPos = selection.head

  const newState = createEditorState(newContent || '')
  view.updateState(newState)

  const newDocLength = newState.doc.content.size
  const safeAnchor = Math.min(anchorPos, newDocLength)
  const safeHead = Math.min(headPos, newDocLength)

  try {
    if (safeAnchor <= safeHead) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, safeAnchor, safeHead)))
    } else {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, safeHead, safeAnchor)))
    }
  } catch {
    // 忽略选区恢复失败
  }

  nextTick(() => {
    isUpdating.value = false
    loadEditorImages()
  })
})

// 监听主题变化
watch(() => themeStore.currentTheme, () => {
  nextTick(() => {
    const view = viewRef.value
    if (view) {
      view.updateState(view.state)
    }
  })
})

// 监听文档切换
watch(() => fileStore.currentFile?.path, (newPath, oldPath) => {
  if (newPath !== oldPath) {
    imageCache.clear()
    nextTick(() => {
      loadEditorImages()
    })
  }
})

// 生命周期
onMounted(() => {
  initEditor()

  const editorEl = editorRef.value
  if (editorEl) {
    editorEl.addEventListener('dragover', handleDragOver)
    editorEl.addEventListener('dragleave', handleDragLeave)
    editorEl.addEventListener('drop', handleDrop)
    editorEl.addEventListener('paste', handlePaste)
  }

  nextTick(() => {
    loadEditorImages()
    viewRef.value?.focus()
  })
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', handleSelectionChange)

  const editorEl = editorRef.value
  if (editorEl) {
    editorEl.removeEventListener('dragover', handleDragOver)
    editorEl.removeEventListener('dragleave', handleDragLeave)
    editorEl.removeEventListener('drop', handleDrop)
    editorEl.removeEventListener('paste', handlePaste)
  }

  viewRef.value?.destroy()
})

/**
 * 公开方法供父组件调用
 */
defineExpose({
  setBlockTypeCommand,
  toggleHeadingLevel,
  insertImage: (src: string, alt?: string, title?: string) => {
    const view = viewRef.value
    if (!view) return
    const { state, dispatch } = view
    insertImageCmd(src, alt, title)(state, dispatch)
    view.focus()
  },
  getView: () => viewRef.value,
  focus: () => viewRef.value?.focus()
})
</script>

<template>
  <div
    class="instant-container"
    :class="{ 'dragging': isDragging, 'has-focus': hasFocus }"
    @click="handleContainerClick"
  >
    <div
      ref="editorRef"
      class="instant-editor"
    />

    <!-- 浮动工具栏 -->
    <FloatToolbar
      v-if="floatToolbar.visible"
      :top="floatToolbar.top"
      :left="floatToolbar.left"
      :is-bold="floatToolbar.isBold"
      :is-italic="floatToolbar.isItalic"
      :is-strikethrough="floatToolbar.isStrikethrough"
      :is-code="floatToolbar.isCode"
      :is-link="floatToolbar.isLink"
      @bold="applyMark('bold')"
      @italic="applyMark('italic')"
      @strikethrough="applyMark('strikethrough')"
      @code="applyMark('code')"
      @link="applyLink"
      @hide="hideFloatToolbar"
    />
  </div>
</template>

<style scoped>
.instant-container {
  flex: 1;
  overflow-y: auto;
  background-color: var(--color-bg-primary);
  position: relative;
}

.instant-container.dragging .instant-editor {
  background-color: var(--color-primary-light);
  border: 2px dashed var(--color-primary);
}

.instant-editor {
  min-height: 100%;
  padding: 24px 32px;
}

/* ProseMirror 编辑器基础样式 */
.instant-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.8;
  color: var(--color-text);
}

/* ========== 即时渲染模式样式 ========== */

/* 源码态：显示 Markdown 标记符 */
.instant-editor :deep(.ir-source) {
  position: relative;
  padding-left: 4px;
  border-left: 3px solid var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 59, 130, 246), 0.05);
}

.instant-editor :deep(.ir-source .ir-marker) {
  display: inline !important;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.9em;
  user-select: none;
  pointer-events: none;
  margin-right: 4px;
}

/* 渲染态：隐藏 Markdown 标记符 */
.instant-editor :deep(.ir-rendered .ir-marker) {
  display: none !important;
}

/* 块级节点通用样式 */
.instant-editor :deep(.ir-block) {
  position: relative;
  transition: background-color 0.2s, border-color 0.2s;
}

.instant-editor :deep(.ir-block:hover) {
  background-color: rgba(var(--color-primary-rgb, 59, 130, 246), 0.02);
}

/* 标题样式 */
.instant-editor :deep(.ProseMirror h1) {
  font-size: 2em;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.67em 0;
  font-weight: 700;
}

.instant-editor :deep(.ProseMirror h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.75em 0;
  font-weight: 600;
}

.instant-editor :deep(.ProseMirror h3) {
  font-size: 1.25em;
  margin: 0.83em 0;
  font-weight: 600;
}

.instant-editor :deep(.ProseMirror h4) {
  font-size: 1.1em;
  margin: 1em 0;
  font-weight: 600;
}

/* 段落 */
.instant-editor :deep(.ProseMirror p) {
  margin: 0.5em 0;
}

/* 列表 */
.instant-editor :deep(.ProseMirror ul),
.instant-editor :deep(.ProseMirror ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.instant-editor :deep(.ProseMirror li) {
  margin: 0.25em 0;
}

/* 引用块 */
.instant-editor :deep(.ProseMirror blockquote) {
  border-left: 4px solid var(--color-primary);
  padding: 8px 16px;
  margin: 0.5em 0;
  background: var(--color-primary-light);
  border-radius: 0 4px 4px 0;
}

/* ========== 代码块样式 ========== */

/* 源码态代码块 */
.instant-editor :deep(.ir-code-source) {
  background: var(--color-bg-secondary);
  border-radius: 6px;
  margin: 0.5em 0;
  overflow: hidden;
}

.instant-editor :deep(.ir-code-source .ir-code-lang) {
  padding: 4px 12px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--color-border);
}

.instant-editor :deep(.ir-code-source pre) {
  margin: 0;
  padding: 12px 16px;
  background: none;
  overflow-x: auto;
}

.instant-editor :deep(.ir-code-source code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  line-height: 1.6;
  background: none;
  padding: 0;
}

/* 渲染态代码块（Shiki 高亮） */
.instant-editor :deep(.ir-code-rendered) {
  background: var(--color-bg-secondary);
  border-radius: 6px;
  margin: 0.5em 0;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.instant-editor :deep(.ir-code-rendered:hover) {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.instant-editor :deep(.ir-code-rendered .ir-code-lang) {
  padding: 4px 12px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--color-border);
}

.instant-editor :deep(.ir-code-rendered .ir-shiki-container) {
  padding: 12px 16px;
  overflow-x: auto;
}

.instant-editor :deep(.ir-code-rendered .ir-shiki-container pre) {
  margin: 0;
  background: none !important;
}

.instant-editor :deep(.ir-code-rendered .ir-shiki-container code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  line-height: 1.6;
}

/* 行内代码 */
.instant-editor :deep(.ProseMirror code) {
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: var(--font-mono);
}

/* ========== 图片样式 ========== */
.instant-editor :deep(.ir-image-wrapper) {
  display: inline-block;
  max-width: 100%;
}

.instant-editor :deep(.ir-image) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.instant-editor :deep(.ir-image:hover) {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.instant-editor :deep(.ir-image-selected) {
  box-shadow: 0 0 0 3px var(--color-primary);
}

.instant-editor :deep(.ir-image-placeholder) {
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* 链接 */
.instant-editor :deep(.ProseMirror a) {
  color: var(--color-primary);
  text-decoration: underline;
}

/* 分割线 */
.instant-editor :deep(.ProseMirror hr) {
  border: none;
  border-top: 2px solid var(--color-border);
  margin: 1.5em 0;
}

/* ========== 表格样式 ========== */
.instant-editor :deep(.ir-table-block) {
  margin: 0.5em 0;
}

.instant-editor :deep(.ir-table-rendered) {
  border-collapse: collapse;
  width: 100%;
}

.instant-editor :deep(.ir-table-rendered th),
.instant-editor :deep(.ir-table-rendered td) {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  min-width: 60px;
}

.instant-editor :deep(.ir-table-rendered th) {
  background: var(--color-bg-secondary);
  font-weight: 600;
}

.instant-editor :deep(.ir-table-rendered tr:hover td) {
  background: var(--color-primary-light);
}

/* 任务列表 */
.instant-editor :deep(.ProseMirror ul[data-type="task_list"]) {
  list-style: none;
  padding-left: 0;
}

.instant-editor :deep(.ProseMirror li[data-type="task_item"]) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.instant-editor :deep(.ProseMirror li[data-type="task_item"] input[type="checkbox"]) {
  margin-top: 0.3em;
  cursor: pointer;
}

/* 选中状态 */
.instant-editor :deep(.ProseMirror ::selection) {
  background: var(--color-primary-light);
}

/* 占位符 */
.instant-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: '在此输入内容，支持 Markdown 语法...';
  color: var(--color-text-tertiary);
  float: left;
  height: 0;
  pointer-events: none;
}

/* 光标 */
.instant-editor :deep(.ProseMirror .ProseMirror-cursor) {
  border-left: 2px solid var(--color-primary);
}

/* 间隙光标 */
.instant-editor :deep(.ProseMirror-gapcursor) {
  display: none;
  pointer-events: none;
  position: absolute;
}

.instant-editor :deep(.ProseMirror-focused .ProseMirror-gapcursor) {
  display: block;
}

.instant-editor :deep(.ProseMirror-gapcursor:after) {
  content: '';
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid var(--color-text);
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}
</style>
