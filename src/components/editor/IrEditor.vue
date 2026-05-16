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
  createIRPlugin,
  irPluginKey,
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
  destroy() {}
}

const fileStore = useFileStore()
const themeStore = useThemeStore()
const { fileContent } = storeToRefs(fileStore)
const editorRef = ref<HTMLDivElement>()
const viewRef = ref<EditorView | null>(null)
const isUpdating = ref(false)
const isDragging = ref(false)
const showMarkers = ref(false)
const imageCache = new Map<string, string>()

function createEditorState(content: string): EditorState {
  const doc = parseMarkdown(content || '')
  const plugins = [
    ...createPlugins(markdownSchema),
    taskListClickPlugin,
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

function syncShowMarkers(): void {
  const view = viewRef.value
  if (!view) return
  const pluginState = irPluginKey.getState(view.state) as IRPluginState | undefined
  showMarkers.value = pluginState?.showMarkers ?? false
}

function initEditor(): void {
  if (!editorRef.value) return
  const state = createEditorState(fileStore.fileContent)
  viewRef.value = new EditorView(editorRef.value, {
    state,
    dispatchTransaction: (tr) => {
      const view = viewRef.value
      if (!view || isUpdating.value) return
      try {
        view.updateState(view.state.apply(tr))
      } catch {
        return
      }
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
async function handlePaste(e: ClipboardEvent): Promise<void> {
  if (!e.clipboardData) return
  for (const file of Array.from(e.clipboardData.files)) {
    if (file.type.startsWith('image/')) {
      e.preventDefault()
      await insertImageFromFile(file)
      return
    }
  }
}
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
  isUpdating.value = true
  const { selection } = view.state
  const anchorPos = selection.anchor
  const headPos = selection.head
  const newState = createEditorState(newContent || '')
  view.updateState(newState)
  syncShowMarkers()
  const newDocLength = newState.doc.content.size
  const safeAnchor = Math.min(anchorPos, newDocLength)
  const safeHead = Math.min(headPos, newDocLength)
  try {
    view.dispatch(
      view.state.tr.setSelection(
        safeAnchor <= safeHead
          ? TextSelection.create(view.state.doc, safeAnchor, safeHead)
          : TextSelection.create(view.state.doc, safeHead, safeAnchor)
      )
    )
  } catch { /* ignore */ }
  nextTick(() => { isUpdating.value = false; loadEditorImages() })
})

watch(() => themeStore.currentTheme, () => {
  nextTick(() => { viewRef.value?.updateState(viewRef.value.state) })
})

watch(() => fileStore.currentFile?.path, (newPath, oldPath) => {
  if (newPath !== oldPath) { imageCache.clear(); nextTick(() => loadEditorImages()) }
})

onMounted(() => {
  initEditor()
  const el = editorRef.value
  if (el) {
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)
    el.addEventListener('paste', handlePaste)
  }
  nextTick(() => { loadEditorImages(); viewRef.value?.focus() })
})

onUnmounted(() => {
  const el = editorRef.value
  if (el) {
    el.removeEventListener('dragover', handleDragOver)
    el.removeEventListener('dragleave', handleDragLeave)
    el.removeEventListener('drop', handleDrop)
    el.removeEventListener('paste', handlePaste)
  }
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
  <div class="ir-container" :class="{ dragging: isDragging, 'ir-show-markers': showMarkers }">
    <div ref="editorRef" class="ir-editor-wrapper" />
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
