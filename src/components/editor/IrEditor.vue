<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
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
  taskListClickPlugin,
  toggleHeading,
  insertImage,
  insertLink,
  createIRPlugin,
  irPluginKey,
  createPastePlugin,
} from '../../utils/prosemirror'
import type { IRPluginState } from '../../utils/prosemirror'
import { TextSelection } from 'prosemirror-state'
import { wrapIn, setBlockType } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { NodeView } from 'prosemirror-view'

class MathInlineView implements NodeView {
  dom: HTMLSpanElement
  private node
  constructor(node: any) {
    this.node = node
    this.dom = document.createElement('span')
    this.dom.className = 'math-inline'
    this.dom.contentEditable = 'false'
    this.renderMath()
  }
  update(node: any) {
    if (node.type.name !== 'math_inline') return false
    this.node = node
    this.renderMath()
    return true
  }
  private renderMath() {
    try {
      this.dom.innerHTML = katex.renderToString(this.node.attrs.source || '', { displayMode: false, throwOnError: false })
    } catch {
      this.dom.textContent = '$' + (this.node.attrs.source || '') + '$'
    }
  }
  selectNode() { this.dom.classList.add('ProseMirror-selectednode') }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode') }
  stopEvent(): boolean { return true }
  ignoreMutation(): boolean { return true }
  destroy() {}
}

class MathBlockView implements NodeView {
  dom: HTMLDivElement
  private node
  constructor(node: any) {
    this.node = node
    this.dom = document.createElement('div')
    this.dom.className = 'math-block'
    this.dom.setAttribute('data-type', 'math_block')
    this.dom.contentEditable = 'false'
    this.renderMath()
  }
  update(node: any) {
    if (node.type.name !== 'math_block') return false
    this.node = node
    this.renderMath()
    return true
  }
  private renderMath() {
    try {
      this.dom.innerHTML = katex.renderToString(this.node.attrs.source || '', { displayMode: true, throwOnError: false })
    } catch {
      this.dom.textContent = '$$\n' + (this.node.attrs.source || '') + '\n$$'
    }
  }
  selectNode() { this.dom.classList.add('ProseMirror-selectednode') }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode') }
  stopEvent(): boolean { return true }
  ignoreMutation(): boolean { return true }
  destroy() {}
}

const fileStore = useFileStore()
const themeStore = useThemeStore()
const { fileContent } = storeToRefs(fileStore)
const editorRef = ref<HTMLDivElement>()
const viewRef = ref<EditorView | null>(null)
const isDragging = ref(false)
const showMarkers = ref(false)
const imageCache = new Map<string, string>()

function createEditorState(content: string): EditorState {
  const doc = parseMarkdown(content || '')
  const plugins = [
    ...createPlugins(markdownSchema),
    taskListClickPlugin,
    createPastePlugin((view, file) => {
      // 异步处理图片插入，使用最新的 view 状态
      handlePasteImage(view, file)
    }),
    createDocumentChangePlugin((state) => {
      const markdown = serializeMarkdown(state.doc)
      const currentContent = (fileStore.fileContent || '').replace(/\n+$/, '')
      const newMarkdown = markdown.replace(/\n+$/, '')
      if (currentContent !== newMarkdown) {
        fileStore.updateContent(markdown)
      }
    }),
    createIRPlugin(),
  ]
  return EditorState.create({ doc, plugins })
}

async function handlePasteImage(view: EditorView, file: File): Promise<void> {
  const result = await fileStore.addImage(file)
  if (result.success && result.path) {
    // 使用 view.state 和 view.dispatch 来确保状态一致性
    const { state } = view
    const tr = state.tr
    const imageNode = state.schema.nodes.image.create({ src: result.path, alt: file.name })
    tr.replaceSelectionWith(imageNode)
    view.dispatch(tr)
    view.focus()
    // 加载并渲染图片
    await nextTick(() => loadEditorImages())
  }
}

function syncShowMarkers(): void {
  const view = viewRef.value
  if (!view) return
  const pluginState = irPluginKey.getState(view.state) as IRPluginState | undefined
  showMarkers.value = pluginState?.showMarkers ?? false
}

function initEditor(): void {
  if (!editorRef.value) return
  const content = fileStore.fileContent
  const state = createEditorState(content)
  viewRef.value = new EditorView(editorRef.value, {
    state,
    dispatchTransaction(tr) {
      this.updateState(this.state.apply(tr))
      syncShowMarkers()
    },
    attributes: { class: 'ir-editor' },
    nodeViews: {
      math_inline: (node) => new MathInlineView(node),
      math_block: (node) => new MathBlockView(node),
    },
  })
}

function setBlockTypeCommand(type: string, attrs?: Record<string, unknown>): void {
  const view = viewRef.value
  if (!view) return
  const { state, dispatch } = view
  const nodeType = state.schema.nodes[type]
  if (type === 'paragraph') setBlockType(nodeType)(state, dispatch)
  else if (type === 'heading') setBlockType(nodeType, attrs)(state, dispatch)
  else if (type === 'code_block') setBlockType(nodeType, attrs)(state, dispatch)
  else if (type === 'blockquote') wrapIn(nodeType)(state, dispatch)
  else if (type === 'bullet_list') wrapInList(nodeType)(state, dispatch)
  else if (type === 'ordered_list') wrapInList(nodeType, attrs)(state, dispatch)
  view.focus()
}

function toggleHeadingLevel(level: number): void {
  const view = viewRef.value
  if (!view) return
  const { state, dispatch } = view
  toggleHeading(level)(state, dispatch)
  view.focus()
}

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
  for (const file of Array.from(e.dataTransfer.files)) {
    if (file.type.startsWith('image/')) await insertImageFromFile(file)
  }
  const url = e.dataTransfer.getData('text/uri-list')
  if (url && isImageUrl(url)) insertImage(url)
}
// 注意：粘贴图片处理已移至 ProseMirror 插件 createPastePlugin
// 保留此函数是为了防止其他组件依赖，但实际处理在插件中完成
async function handlePaste(e: ClipboardEvent): Promise<void> {
  // ProseMirror 插件会处理图片粘贴，这里不再重复处理
  // 这样可以避免事务冲突
}
async function insertImageFromFile(file: File): Promise<void> {
  const result = await fileStore.addImage(file)
  if (result.success && result.path) {
    const view = viewRef.value
    if (!view) return
    // 使用 view.state 创建事务，确保状态一致性
    const tr = view.state.tr
    const imageNode = view.state.schema.nodes.image.create({ src: result.path, alt: file.name })
    tr.replaceSelectionWith(imageNode)
    view.dispatch(tr)
    view.focus()
  }
}
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)
}

async function loadEditorImages(): Promise<void> {
  if (!editorRef.value) return
  for (const img of editorRef.value.querySelectorAll('img')) {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) continue
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
    } catch { /* ignore */ }
  }
}

watch(fileContent, (newContent) => {
  const view = viewRef.value
  if (!view) return
  const currentMarkdown = serializeMarkdown(view.state.doc).replace(/\n+$/, '')
  const normalizedNewContent = (newContent || '').replace(/\n+$/, '')
  if (currentMarkdown === normalizedNewContent) return

  const { selection } = view.state
  const anchorPos = selection.anchor
  const headPos = selection.head
  const newDoc = parseMarkdown(newContent || '')
  const newDocLength = newDoc.content.size
  const safeAnchor = Math.min(anchorPos, newDocLength)
  const safeHead = Math.min(headPos, newDocLength)

  const tr = view.state.tr
    .replaceWith(0, view.state.doc.content.size, newDoc.content)
    .setMeta('addToHistory', false)
    .setSelection(
      safeAnchor <= safeHead
        ? TextSelection.create(newDoc, safeAnchor, safeHead)
        : TextSelection.create(newDoc, safeHead, safeAnchor)
    )

  // 防御：如果 state 在此期间被改变，跳过 dispatch 避免 mismatched transaction
  if (tr.doc === view.state.doc) {
    view.dispatch(tr)
    syncShowMarkers()
    nextTick(() => loadEditorImages())
  }
})

watch(() => themeStore.currentTheme, () => {
  nextTick(() => { viewRef.value?.updateState(viewRef.value.state) })
})

watch(() => fileStore.currentFile?.path, (newPath, oldPath) => {
  if (newPath !== oldPath) { imageCache.clear(); nextTick(() => loadEditorImages()) }
})

// ========== 工具栏事件处理 ==========

/** 手动 toggle mark，有选区时直接 addMark，无选区时 addStoredMark */
function toggleMarkInView(view: EditorView, markType: import('prosemirror-model').MarkType): void {
  const { from, to } = view.state.selection
  if (from === to) {
    const tr = view.state.tr.addStoredMark(markType.create())
    view.updateState(view.state.apply(tr))
    syncShowMarkers()
  } else {
    const text = view.state.doc.textBetween(from, to)
    const mark = markType.create()
    const markedText = view.state.schema.text(text, [mark])
    const tr = view.state.tr.replaceWith(from, to, markedText)
    view.updateState(view.state.apply(tr))
    syncShowMarkers()
  }
  view.focus()
}

function applyAndSync(view: EditorView, tr: any): void {
  view.updateState(view.state.apply(tr))
  syncShowMarkers()
}

function insertTableNode(): void {
  const view = viewRef.value
  if (!view) return
  const { schema } = view.state
  const createCell = (isHeader: boolean) => {
    const type = isHeader ? schema.nodes.table_header : schema.nodes.table_cell
    return type.createAndFill()!
  }
  const headerRow = schema.nodes.table_row.create(null, [
    createCell(true), createCell(true), createCell(true)
  ])
  const dataRow = schema.nodes.table_row.create(null, [
    createCell(false), createCell(false), createCell(false)
  ])
  const tableNode = schema.nodes.table.create(null, [headerRow, dataRow, dataRow])
  const tr = view.state.tr.replaceSelectionWith(tableNode)
  applyAndSync(view, tr)
  view.focus()
}

function handleFormatEvent(e: Event): void {
  const view = viewRef.value
  if (!view) return
  const { marks, nodes } = view.state.schema
const format = (e as CustomEvent).detail as string
  switch (format) {
    case 'bold':
      toggleMarkInView(view, marks.bold)
      return
    case 'italic':
      toggleMarkInView(view, marks.italic)
      return
    case 'strikethrough':
      toggleMarkInView(view, marks.strikethrough)
      return
    case 'unorderedList':
      wrapInList(nodes.bullet_list)(view.state, (tr) => applyAndSync(view, tr))
      break
    case 'orderedList':
      wrapInList(nodes.ordered_list)(view.state, (tr) => applyAndSync(view, tr))
      break
    case 'blockquote':
      wrapIn(nodes.blockquote)(view.state, (tr) => applyAndSync(view, tr))
      break
    case 'table':
      insertTableNode()
      return
  }
  view.focus()
}

function handleHeadingEvent(e: Event): void {
  const view = viewRef.value
  if (!view) return
  const level = (e as CustomEvent).detail as number
  if (level === 0) {
    setBlockType(view.state.schema.nodes.paragraph)(view.state, (tr) => applyAndSync(view, tr))
  } else {
    toggleHeading(level)(view.state, (tr) => applyAndSync(view, tr))
  }
  view.focus()
}

function handleLinkEvent(e: Event): void {
  const view = viewRef.value
  if (!view) return
  const { href, title } = (e as CustomEvent).detail as { href: string; title: string }
  insertLink(href, title)(view.state, (tr) => applyAndSync(view, tr))
  view.focus()
}

function handleImageEvent(e: Event): void {
  const view = viewRef.value
  if (!view) return
  const { src, alt } = (e as CustomEvent).detail as { src: string; alt: string }
  insertImage(src, alt)(view.state, (tr) => applyAndSync(view, tr))
  view.focus()
}

function handleCodeBlockEvent(e: Event): void {
  const view = viewRef.value
  if (!view) return
  const { language } = (e as CustomEvent).detail as { language?: string }
  setBlockType(view.state.schema.nodes.code_block, { language: language || '' })(view.state, (tr) => applyAndSync(view, tr))
  view.focus()
}

onMounted(() => {
  initEditor()
  const el = editorRef.value
  if (el) {
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)
    el.addEventListener('paste', handlePaste)
  }
  window.addEventListener('editor:format', handleFormatEvent)
  window.addEventListener('editor:heading', handleHeadingEvent)
  window.addEventListener('editor:link', handleLinkEvent)
  window.addEventListener('editor:image', handleImageEvent)
  window.addEventListener('editor:codeBlock', handleCodeBlockEvent)
  nextTick(() => { loadEditorImages(); viewRef.value?.focus() })
})

onUnmounted(() => {
  // 组件卸载前强制同步内容到 store，防止切换模式时内容丢失
  const view = viewRef.value
  if (view) {
    const markdown = serializeMarkdown(view.state.doc)
    fileStore.updateContent(markdown)
  }

  const el = editorRef.value
  if (el) {
    el.removeEventListener('dragover', handleDragOver)
    el.removeEventListener('dragleave', handleDragLeave)
    el.removeEventListener('drop', handleDrop)
    el.removeEventListener('paste', handlePaste)
  }
  window.removeEventListener('editor:format', handleFormatEvent)
  window.removeEventListener('editor:heading', handleHeadingEvent)
  window.removeEventListener('editor:link', handleLinkEvent)
  window.removeEventListener('editor:image', handleImageEvent)
  window.removeEventListener('editor:codeBlock', handleCodeBlockEvent)
  viewRef.value?.destroy()
})

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
  focus: () => viewRef.value?.focus(),
})
</script>

<template>
  <div
    class="ir-container"
    :class="{ dragging: isDragging, 'ir-show-markers': showMarkers }"
  >
    <div
      ref="editorRef"
      class="ir-editor-wrapper"
    />
  </div>
</template>

<style scoped>
.ir-container {
  flex: 1;
  overflow-y: auto;
  background-color: var(--color-bg-primary);
  position: relative;
}
.ir-container.dragging .ir-editor-wrapper {
  background-color: var(--color-primary-light);
  border: 2px dashed var(--color-primary);
}
.ir-editor-wrapper {
  min-height: 100%;
  padding: 24px 32px;
}
.ir-editor-wrapper :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.8;
  color: var(--color-text);
}
.ir-editor-wrapper :deep(.ProseMirror p) { margin: 0.5em 0; }
.ir-editor-wrapper :deep(.ProseMirror h1) {
  font-size: 2em; border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.3em; margin: 0.67em 0; font-weight: 700;
}
.ir-editor-wrapper :deep(.ProseMirror h2) {
  font-size: 1.5em; border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.3em; margin: 0.75em 0; font-weight: 600;
}
.ir-editor-wrapper :deep(.ProseMirror h3) {
  font-size: 1.25em; margin: 0.83em 0; font-weight: 600;
}
.ir-editor-wrapper :deep(.ProseMirror h4) {
  font-size: 1.1em; margin: 1em 0; font-weight: 600;
}
.ir-editor-wrapper :deep(.ProseMirror ul),
.ir-editor-wrapper :deep(.ProseMirror ol) {
  margin: 0.5em 0; padding-left: 1.5em;
}
.ir-editor-wrapper :deep(.ProseMirror li) { margin: 0.25em 0; }
/* IR 模式：列表标记 */
.ir-editor-wrapper :deep(.ProseMirror ul) { list-style: none; }
.ir-editor-wrapper :deep(.ProseMirror ul > li) { position: relative; }
.ir-editor-wrapper :deep(.ProseMirror ul > li::before) {
  content: '- ';
  position: absolute; left: -1.2em;
  opacity: 0.4; font-family: var(--font-mono); font-size: 0.85em;
  user-select: none; pointer-events: none;
}
.ir-editor-wrapper :deep(.ProseMirror ol) { counter-reset: ir-ordered; list-style: none; }
.ir-editor-wrapper :deep(.ProseMirror ol > li) { counter-increment: ir-ordered; position: relative; }
.ir-editor-wrapper :deep(.ProseMirror ol > li::before) {
  content: counter(ir-ordered) '. ';
  position: absolute; left: -2em;
  opacity: 0.4; font-family: var(--font-mono); font-size: 0.85em;
  user-select: none; pointer-events: none;
}
.ir-editor-wrapper :deep(.ProseMirror li[data-type="task_item"][data-checked="true"]::before) {
  content: '- [x] ';
}
.ir-editor-wrapper :deep(.ProseMirror li[data-type="task_item"][data-checked="false"]::before) {
  content: '- [ ] ';
}
.ir-editor-wrapper :deep(.ProseMirror li[data-type="task_item"] input[type="checkbox"]) {
  display: none;
}
.ir-editor-wrapper :deep(.ProseMirror blockquote) {
  border-left: 4px solid var(--color-primary);
  padding: 8px 16px; margin: 0.5em 0;
  background: var(--color-primary-light);
  border-radius: 0 4px 4px 0;
}
/* IR 模式：块级标记 */
.ir-editor-wrapper :deep(.ProseMirror h1::before) { content: '# '; }
.ir-editor-wrapper :deep(.ProseMirror h2::before) { content: '## '; }
.ir-editor-wrapper :deep(.ProseMirror h3::before) { content: '### '; }
.ir-editor-wrapper :deep(.ProseMirror h4::before) { content: '#### '; }
.ir-editor-wrapper :deep(.ProseMirror blockquote::before) { content: '> '; display: inline; }
.ir-editor-wrapper :deep(.ProseMirror h1::before),
.ir-editor-wrapper :deep(.ProseMirror h2::before),
.ir-editor-wrapper :deep(.ProseMirror h3::before),
.ir-editor-wrapper :deep(.ProseMirror h4::before),
.ir-editor-wrapper :deep(.ProseMirror blockquote::before) {
  opacity: 0.4;
  font-family: var(--font-mono);
  font-size: 0.85em;
  font-weight: 400;
  user-select: none;
  pointer-events: none;
}
/* 标题标记与标题文本之间的间距 */
.ir-editor-wrapper :deep(.ProseMirror h1) { padding-left: 0.2em; }
.ir-editor-wrapper :deep(.ProseMirror h2) { padding-left: 0.4em; }
.ir-editor-wrapper :deep(.ProseMirror h3) { padding-left: 0.6em; }
.ir-editor-wrapper :deep(.ProseMirror h4) { padding-left: 0.8em; }

.ir-editor-wrapper :deep(.ProseMirror pre) {
  background: var(--color-bg-secondary);
  padding: 2em 16px 1.5em;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.9em; overflow-x: auto; margin: 0.5em 0;
  position: relative;
}
.ir-editor-wrapper :deep(.ProseMirror pre::before) {
  content: '```' attr(data-lang);
  display: block;
  position: absolute;
  top: 0; left: 0; right: 0;
  padding: 2px 12px;
  font-size: 0.8em;
  opacity: 0.4;
  user-select: none;
  pointer-events: none;
  white-space: pre;
}
.ir-editor-wrapper :deep(.ProseMirror pre::after) {
  content: '```';
  display: block;
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 2px 12px;
  font-size: 0.8em;
  opacity: 0.4;
  user-select: none;
  pointer-events: none;
}
.ir-editor-wrapper :deep(.ProseMirror code) {
  background: var(--color-bg-secondary);
  padding: 2px 6px; border-radius: 3px;
  font-size: 0.9em; font-family: var(--font-mono);
}
.ir-editor-wrapper :deep(.ProseMirror pre code) { background: none; padding: 0; }
.ir-editor-wrapper :deep(.ProseMirror img) {
  max-width: 100%; height: auto; border-radius: 4px; cursor: pointer;
}
.ir-editor-wrapper :deep(.ProseMirror a) {
  color: var(--color-primary); text-decoration: underline;
}
.ir-editor-wrapper :deep(.ProseMirror hr) {
  border: none;
  border-top: 2px solid var(--color-border);
  margin: 1.5em 0;
  position: relative;
  height: 2em;
}
.ir-editor-wrapper :deep(.ProseMirror hr::before) {
  content: '---';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-bg-primary);
  padding: 0 8px;
  opacity: 0.4;
  font-family: var(--font-mono);
  font-size: 0.85em;
  user-select: none;
  pointer-events: none;
}
.ir-editor-wrapper :deep(.ProseMirror table) { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
.ir-editor-wrapper :deep(.ProseMirror th),
.ir-editor-wrapper :deep(.ProseMirror td) {
  border: 1px solid var(--color-border); padding: 8px 12px; min-width: 60px;
}
.ir-editor-wrapper :deep(.ProseMirror th) {
  background: var(--color-bg-secondary); font-weight: 600;
}
.ir-editor-wrapper :deep(.ProseMirror ul[data-type="task_list"]) { list-style: none; padding-left: 0; }
.ir-editor-wrapper :deep(.ProseMirror li[data-type="task_item"]) {
  display: flex; align-items: flex-start; gap: 8px;
}
.ir-editor-wrapper :deep(.ProseMirror li[data-type="task_item"] input[type="checkbox"]) {
  margin-top: 0.3em; cursor: pointer;
}
.ir-editor-wrapper :deep(.ProseMirror ::selection) { background: var(--color-primary-light); }
.ir-editor-wrapper :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: '在此输入内容，支持 Markdown 语法...';
  color: var(--color-text-tertiary); float: left; height: 0; pointer-events: none;
}
/* 内联标记（默认隐藏，选区附近展开） */
.ir-editor-wrapper :deep([data-mark]::before),
.ir-editor-wrapper :deep([data-mark]::after) {
  opacity: 0;
  transition: opacity 0.15s ease;
  user-select: none;
  pointer-events: none;
}
.ir-editor-wrapper.ir-show-markers :deep([data-mark]::before),
.ir-editor-wrapper.ir-show-markers :deep([data-mark]::after) {
  opacity: 0.4;
}
.ir-editor-wrapper :deep([data-mark="bold"]::before) { content: '**'; }
.ir-editor-wrapper :deep([data-mark="bold"]::after) { content: '**'; }
.ir-editor-wrapper :deep([data-mark="italic"]::before) { content: '*'; }
.ir-editor-wrapper :deep([data-mark="italic"]::after) { content: '*'; }
.ir-editor-wrapper :deep([data-mark="strikethrough"]::before) { content: '~~'; }
.ir-editor-wrapper :deep([data-mark="strikethrough"]::after) { content: '~~'; }
.ir-editor-wrapper :deep([data-mark="code"]::before) { content: '`'; }
.ir-editor-wrapper :deep([data-mark="code"]::after) { content: '`'; }
.ir-editor-wrapper :deep([data-mark="link"]::before) { content: '['; }
.ir-editor-wrapper :deep([data-mark="link"]::after) { content: '](' attr(href) ')'; }

.ir-editor-wrapper :deep(.ProseMirror .ProseMirror-cursor) {
  border-left: 2px solid var(--color-primary);
}
.ir-editor-wrapper :deep(.ProseMirror-gapcursor) { display: none; pointer-events: none; position: absolute; }
.ir-editor-wrapper :deep(.ProseMirror-focused .ProseMirror-gapcursor) { display: block; }
.ir-editor-wrapper :deep(.ProseMirror-gapcursor:after) {
  content: ''; display: block; position: absolute; top: -2px; width: 20px;
  border-top: 1px solid var(--color-text);
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}
@keyframes ProseMirror-cursor-blink { to { visibility: hidden; } }
</style>
