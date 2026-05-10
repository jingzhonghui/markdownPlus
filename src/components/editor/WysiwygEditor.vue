<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  computed
} from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'
import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import {
  markdownSchema,
  parseMarkdown,
  serializeMarkdown,
  createPlugins,
  createDocumentChangePlugin,
  taskListClickPlugin,
  toggleHeading,
  insertImage
} from '../../utils/prosemirror'
import { toggleMark, wrapIn, setBlockType } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import FloatToolbar from './FloatToolbar.vue'

const fileStore = useFileStore()
const themeStore = useThemeStore()
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

// 图片工具栏状态
const imageToolbar = ref({
  visible: false,
  top: 0,
  left: 0,
  nodePos: -1,
  currentAlign: 'center',
  currentWidth: null as number | null
})

/**
 * 创建编辑器状态
 */
function createEditorState(content: string): EditorState {
  const doc = parseMarkdown(content || '')

  const plugins = [
    ...createPlugins(markdownSchema),
    taskListClickPlugin,
    createDocumentChangePlugin((state) => {
      if (isUpdating.value) return

      const markdown = serializeMarkdown(state.doc)
      fileStore.updateContent(markdown)
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

  viewRef.value = new EditorView(editorRef.value, {
    state,
    dispatchTransaction: (tr) => {
      const view = viewRef.value
      if (!view) return

      const newState = view.state.apply(tr)
      view.updateState(newState)

      // 更新浮动工具栏状态
      updateFloatToolbar()
    },
    attributes: {
      class: 'proseMirror-editor'
    }
  })

  // 监听选区变化
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

  // 如果没有选中文本，隐藏工具栏
  if (empty) {
    floatToolbar.value.visible = false
    return
  }

  // 获取选区的坐标位置
  const startCoords = view.coordsAtPos(from)
  const endCoords = view.coordsAtPos(to)

  // 计算工具栏位置（选区上方居中）
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
  toggleHeading(level)(state, dispatch)
  view.focus()
}

/**
 * 隐藏浮动工具栏
 */
function hideFloatToolbar(): void {
  floatToolbar.value.visible = false
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

  // 处理文件拖放
  const files = Array.from(e.dataTransfer.files)
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await insertImageFromFile(file)
    }
  }

  // 处理 URL 拖放
  const url = e.dataTransfer.getData('text/uri-list')
  if (url && isImageUrl(url)) {
    insertImage(url)
  }
}

/**
 * 处理粘贴事件
 */
async function handlePaste(e: ClipboardEvent): Promise<void> {
  if (!e.clipboardData) return

  // 优先处理图片文件
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
    insertImage(result.path, file.name)(state, dispatch)
    view.focus()
  }
}

/**
 * 检查是否是图片 URL
 */
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)
}

/**
 * 加载并显示编辑器中的图片
 * 将相对路径的图片转换为 Data URL
 */
async function loadEditorImages(): Promise<void> {
  if (!editorRef.value) return

  const images = editorRef.value.querySelectorAll('img')

  for (const img of images) {
    const src = img.getAttribute('src')
    if (!src) continue

    // 外部链接直接显示
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      continue
    }

    // 从缓存获取
    if (imageCache.has(src)) {
      img.src = imageCache.get(src)!
      continue
    }

    // 异步加载图片数据
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

  // 监听文件内容变化（外部更新时同步到编辑器）
watch(() => fileStore.fileContent, (newContent) => {
  const view = viewRef.value
  if (!view) return

  // 避免循环更新
  const currentMarkdown = serializeMarkdown(view.state.doc)
  if (currentMarkdown === newContent) return

  isUpdating.value = true
  const newState = createEditorState(newContent)
  view.updateState(newState)

  nextTick(() => {
    isUpdating.value = false
    // 内容变化后加载图片
    loadEditorImages()
  })
})

// 监听主题变化，更新编辑器样式
watch(() => themeStore.currentTheme, () => {
  nextTick(() => {
    // 主题变化时重新渲染
    const view = viewRef.value
    if (view) {
      view.updateState(view.state)
    }
  })
})

// 监听文档切换，清空图片缓存
watch(() => fileStore.currentFile?.path, (newPath, oldPath) => {
  if (newPath !== oldPath) {
    imageCache.clear()
    // 切换文档后重新加载图片
    nextTick(() => {
      loadEditorImages()
    })
  }
})

// 生命周期
onMounted(() => {
  initEditor()

  // 添加拖放和粘贴事件监听
  const editorEl = editorRef.value
  if (editorEl) {
    editorEl.addEventListener('dragover', handleDragOver)
    editorEl.addEventListener('dragleave', handleDragLeave)
    editorEl.addEventListener('drop', handleDrop)
    editorEl.addEventListener('paste', handlePaste)
  }

  // 初始化后加载图片
  nextTick(() => {
    loadEditorImages()
  })
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', handleSelectionChange)

  // 移除事件监听
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
    insertImage(src, alt, title)(state, dispatch)
    view.focus()
  },
  getView: () => viewRef.value,
  focus: () => viewRef.value?.focus()
})
</script>

<template>
  <div
    class="wysiwyg-container"
    :class="{ 'dragging': isDragging }"
  >
    <div
      ref="editorRef"
      class="wysiwyg-editor"
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
.wysiwyg-container {
  flex: 1;
  overflow-y: auto;
  background-color: var(--color-bg-primary);
  position: relative;
}

.wysiwyg-container.dragging .wysiwyg-editor {
  background-color: var(--color-primary-light);
  border: 2px dashed var(--color-primary);
}

.wysiwyg-editor {
  min-height: 100%;
  padding: 24px 32px;
}

.wysiwyg-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.8;
  color: var(--color-text);
}

/* 基础排版样式 */
.wysiwyg-editor :deep(.ProseMirror p) {
  margin: 0.5em 0;
}

.wysiwyg-editor :deep(.ProseMirror h1) {
  font-size: 2em;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.67em 0;
  font-weight: 700;
}

.wysiwyg-editor :deep(.ProseMirror h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.3em;
  margin: 0.75em 0;
  font-weight: 600;
}

.wysiwyg-editor :deep(.ProseMirror h3) {
  font-size: 1.25em;
  margin: 0.83em 0;
  font-weight: 600;
}

.wysiwyg-editor :deep(.ProseMirror h4) {
  font-size: 1.1em;
  margin: 1em 0;
  font-weight: 600;
}

.wysiwyg-editor :deep(.ProseMirror ul),
.wysiwyg-editor :deep(.ProseMirror ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.wysiwyg-editor :deep(.ProseMirror li) {
  margin: 0.25em 0;
}

.wysiwyg-editor :deep(.ProseMirror blockquote) {
  border-left: 4px solid var(--color-primary);
  padding: 8px 16px;
  margin: 0.5em 0;
  background: var(--color-primary-light);
  border-radius: 0 4px 4px 0;
}

.wysiwyg-editor :deep(.ProseMirror pre) {
  background: var(--color-bg-secondary);
  padding: 12px 16px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.9em;
  overflow-x: auto;
  margin: 0.5em 0;
}

.wysiwyg-editor :deep(.ProseMirror code) {
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: var(--font-mono);
}

.wysiwyg-editor :deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
}

.wysiwyg-editor :deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.wysiwyg-editor :deep(.ProseMirror img:hover) {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.wysiwyg-editor :deep(.ProseMirror a) {
  color: var(--color-primary);
  text-decoration: underline;
}

.wysiwyg-editor :deep(.ProseMirror hr) {
  border: none;
  border-top: 2px solid var(--color-border);
  margin: 1.5em 0;
}

.wysiwyg-editor :deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.wysiwyg-editor :deep(.ProseMirror th),
.wysiwyg-editor :deep(.ProseMirror td) {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  min-width: 60px;
}

.wysiwyg-editor :deep(.ProseMirror th) {
  background: var(--color-bg-secondary);
  font-weight: 600;
}

/* 任务列表样式 */
.wysiwyg-editor :deep(.ProseMirror ul[data-type="task_list"]) {
  list-style: none;
  padding-left: 0;
}

.wysiwyg-editor :deep(.ProseMirror li[data-type="task_item"]) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.wysiwyg-editor :deep(.ProseMirror li[data-type="task_item"] input[type="checkbox"]) {
  margin-top: 0.3em;
  cursor: pointer;
}

/* 选中状态 */
.wysiwyg-editor :deep(.ProseMirror ::selection) {
  background: var(--color-primary-light);
}

/* 占位符 */
.wysiwyg-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: '在此输入内容，支持 Markdown 语法...';
  color: var(--color-text-tertiary);
  float: left;
  height: 0;
  pointer-events: none;
}

/* 拖拽时的样式 */
.wysiwyg-editor :deep(.ProseMirror.drop-target) {
  background: var(--color-primary-light);
}

/* ProseMirror 光标 */
.wysiwyg-editor :deep(.ProseMirror .ProseMirror-cursor) {
  border-left: 2px solid var(--color-primary);
}

/* 间隙光标 */
.wysiwyg-editor :deep(.ProseMirror-gapcursor) {
  display: none;
  pointer-events: none;
  position: absolute;
}

.wysiwyg-editor :deep(.ProseMirror-focused .ProseMirror-gapcursor) {
  display: block;
}

.wysiwyg-editor :deep(.ProseMirror-gapcursor:after) {
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
