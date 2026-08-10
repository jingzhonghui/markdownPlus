<script setup lang="ts">
import {
  ref,
  shallowRef,
  reactive,
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
import { TextSelection, Plugin as ProseMirrorPlugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { wrapIn, setBlockType } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import katex from 'katex'
import { createHighlighter, type BundledLanguage, type Highlighter } from 'shiki'
import type { NodeView } from 'prosemirror-view'
import {
  addColumnBefore,
  addColumnAfter,
  deleteColumn,
  addRowBefore,
  addRowAfter,
  deleteRow,
  deleteTable,
  isInTable,
} from 'prosemirror-tables'

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
const { fileContent, activeTabId } = storeToRefs(fileStore)
const editorRef = ref<HTMLDivElement>()
const viewRef = shallowRef<EditorView | null>(null)
let editorTabId: string | null = null
const isDragging = ref(false)
const showMarkers = ref(false)
const imageCache = new Map<string, string>()

const syntaxHighlightKey = new PluginKey<DecorationSet>('ir-syntax-highlight')
let syntaxHighlighter: Highlighter | null = null
let highlightRequest = 0

function createSyntaxHighlightPlugin(): ProseMirrorPlugin<DecorationSet> {
  return new ProseMirrorPlugin<DecorationSet>({
    key: syntaxHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, decorations) {
        const replacement = tr.getMeta(syntaxHighlightKey) as DecorationSet | undefined
        if (replacement) return replacement
        return decorations.map(tr.mapping, tr.doc)
      }
    },
    props: {
      decorations(state) {
        return syntaxHighlightKey.getState(state) || DecorationSet.empty
      }
    },
    view: () => ({
      update: (view, prevState) => {
        if (!prevState.doc.eq(view.state.doc)) scheduleSyntaxHighlight(view)
      }
    })
  })
}

function scheduleSyntaxHighlight(view: EditorView): void {
  if (!syntaxHighlighter) return
  const request = ++highlightRequest
  setTimeout(() => {
    if (request !== highlightRequest || view.isDestroyed) return
    const decorations: Decoration[] = []

    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return
      const language = normalizeCodeLanguage(node.attrs.language as string)
      try {
        const result = syntaxHighlighter!.codeToTokens(node.textContent, {
          lang: language,
          theme: themeStore.isDark ? 'github-dark' : 'github-light'
        })
        for (const line of result.tokens) {
          for (const token of line) {
            const from = pos + 1 + token.offset
            const to = from + token.content.length
            if (token.color && to > from) {
              decorations.push(Decoration.inline(from, to, { style: `color: ${token.color}` }))
            }
          }
        }
      } catch {
        // Unsupported languages keep the default code-block color.
      }
    })

    view.dispatch(view.state.tr.setMeta(syntaxHighlightKey, DecorationSet.create(view.state.doc, decorations)))
  }, 0)
}

function normalizeCodeLanguage(language: string): BundledLanguage | 'text' {
  const aliases: Record<string, BundledLanguage> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
    py: 'python'
  }
  const normalized = language.toLowerCase()
  return aliases[normalized] || (normalized as BundledLanguage) || 'text'
}

async function initSyntaxHighlighter(): Promise<void> {
  try {
    syntaxHighlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript', 'typescript', 'python', 'go', 'rust', 'java',
        'c', 'cpp', 'csharp', 'php', 'ruby', 'swift', 'kotlin',
        'html', 'css', 'scss', 'json', 'yaml', 'xml', 'sql',
        'bash', 'powershell', 'dockerfile', 'markdown', 'vue',
        'svelte', 'astro', 'lua', 'perl', 'haskell', 'r', 'dart'
      ]
    })
    if (viewRef.value) scheduleSyntaxHighlight(viewRef.value)
  } catch (error) {
    console.error('[IrEditor] Shiki 初始化失败:', error)
  }
}

const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'markdown-plus:close-context-menus'

function focusEditor(): void {
  const view = viewRef.value
  if (!view || view.isDestroyed) return

  // 先让浏览器产生真实的 focus 事件，再让 ProseMirror 同步 selection。
  view.dom.focus({ preventScroll: true })
  view.focus()
}

// 右键菜单状态
interface SubMenuItem {
  label: string
  action: () => void
}

interface ContextMenuItem {
  label: string
  action?: () => void
  children?: SubMenuItem[]
  divider?: boolean
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  type: 'table' | 'general' | null
  activeSubmenu: string | null
}

const contextMenu = reactive<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  type: null,
  activeSubmenu: null
})

// 标记是否正在从 store 同步内容到编辑器（避免 createDocumentChangePlugin 回写 store 造成循环）
let isUpdatingFromStore = false

// 关闭右键菜单
function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.type = null
  contextMenu.activeSubmenu = null
}

// 计算菜单位置，确保在屏幕边界内
function calculateMenuPosition(x: number, y: number, menuHeight: number = 80): { x: number; y: number } {
  // 菜单预估尺寸
  const menuWidth = 140

  // 视口尺寸
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 调整 X 坐标
  let adjustedX = x
  if (x + menuWidth > viewportWidth) {
    adjustedX = x - menuWidth
  }

  // 调整 Y 坐标
  let adjustedY = y
  if (y + menuHeight > viewportHeight) {
    adjustedY = Math.max(10, y - menuHeight)
  }

  return { x: adjustedX, y: adjustedY }
}

// 构建表格右键菜单项
function buildTableMenuItems(view: EditorView): ContextMenuItem[] {
  const { state } = view
  if (!isInTable(state)) return []

  return [
    { label: '在左侧插入列', action: () => { addColumnBefore(state, view.dispatch); view.focus() } },
    { label: '在右侧插入列', action: () => { addColumnAfter(state, view.dispatch); view.focus() } },
    { label: '', action: () => {}, divider: true },
    { label: '在上方插入行', action: () => { addRowBefore(state, view.dispatch); view.focus() } },
    { label: '在下方插入行', action: () => { addRowAfter(state, view.dispatch); view.focus() } },
    { label: '', action: () => {}, divider: true },
    { label: '删除当前列', action: () => { deleteColumn(state, view.dispatch); view.focus() } },
    { label: '删除当前行', action: () => { deleteRow(state, view.dispatch); view.focus() } },
    { label: '', action: () => {}, divider: true },
    { label: '删除表格', action: () => { deleteTable(state, view.dispatch); view.focus() } },
  ]
}

// 构建通用右键菜单项
function buildGeneralMenuItems(view: EditorView): ContextMenuItem[] {
  const { state } = view
  const { schema } = state

  return [
    {
      label: '插入',
      children: [
        { label: '表格', action: () => { insertTableNode(); view.focus() } },
        { label: '代码块', action: () => {
          setBlockType(schema.nodes.code_block, { language: '' })(state, view.dispatch)
          view.focus()
        }},
        { label: '图片', action: () => {
          closeContextMenu()
          window.dispatchEvent(new CustomEvent('editor:showImageDialog'))
        }},
        { label: '链接', action: () => {
          closeContextMenu()
          window.dispatchEvent(new CustomEvent('editor:showLinkDialog'))
        }},
        { label: '分割线', action: () => {
          const hr = schema.nodes.horizontal_rule.create()
          view.dispatch(state.tr.replaceSelectionWith(hr))
          view.focus()
        }},
      ]
    },
    {
      label: '格式化',
      children: [
        { label: '标题 1', action: () => { toggleHeading(1)(state, view.dispatch); view.focus() } },
        { label: '标题 2', action: () => { toggleHeading(2)(state, view.dispatch); view.focus() } },
        { label: '标题 3', action: () => { toggleHeading(3)(state, view.dispatch); view.focus() } },
        { label: '引用块', action: () => { wrapIn(schema.nodes.blockquote)(state, view.dispatch); view.focus() } },
        { label: '无序列表', action: () => { wrapInList(schema.nodes.bullet_list)(state, view.dispatch); view.focus() } },
        { label: '有序列表', action: () => { wrapInList(schema.nodes.ordered_list)(state, view.dispatch); view.focus() } },
      ]
    },
  ]
}

// 右键菜单插件
function createContextMenuPlugin(): ProseMirrorPlugin {
  return new ProseMirrorPlugin({
    props: {
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const target = event.target as HTMLElement

          // 检查是否在表格单元格内
          if (target.closest('td, th')) {
            event.preventDefault()
            window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))

            // 确保光标在点击的单元格中
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (coords) {
              const pos = view.state.doc.resolve(coords.pos)
              const tr = view.state.tr.setSelection(new TextSelection(pos))
              view.dispatch(tr)
            }

            contextMenu.items = buildTableMenuItems(view)
            contextMenu.type = 'table'
            const pos = calculateMenuPosition(event.clientX, event.clientY, 240) // 表格菜单约10项
            contextMenu.x = pos.x
            contextMenu.y = pos.y
            contextMenu.visible = true
            return true
          }

          // 检查是否在编辑器内容区域
          if (target.closest('.ProseMirror')) {
            event.preventDefault()
            window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))

            contextMenu.items = buildGeneralMenuItems(view)
            contextMenu.type = 'general'
            const pos = calculateMenuPosition(event.clientX, event.clientY, 60) // 一级菜单只有2项
            contextMenu.x = pos.x
            contextMenu.y = pos.y
            contextMenu.visible = true
            return true
          }

          return false
        }
      }
    }
  })
}

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
      if (isUpdatingFromStore) return
      const markdown = serializeMarkdown(state.doc)
      const currentContent = (fileStore.fileContent || '').replace(/\n+$/, '')
      const newMarkdown = markdown.replace(/\n+$/, '')
      if (currentContent !== newMarkdown) {
        fileStore.updateContent(markdown)
      }
    }),
    createSyntaxHighlightPlugin(),
    createIRPlugin(),
    createContextMenuPlugin(),
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
  if (!editorRef.value) {
    console.warn('[IrEditor] init skipped: editorRef is null')
    return
  }
  editorTabId = activeTabId.value
  const content = fileStore.fileContent
  const state = createEditorState(content)
  viewRef.value = new EditorView(editorRef.value, {
    state,
    dispatchTransaction(tr) {
      const view = viewRef.value
      if (!view) return
      view.updateState(view.state.apply(tr))
      syncShowMarkers()
    },
    attributes: { class: 'ir-editor', spellcheck: 'false' },
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
async function handlePaste(_e: ClipboardEvent): Promise<void> {
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

  const filePath = fileStore.currentFile?.path || undefined
  for (const img of editorRef.value.querySelectorAll('img')) {
    // 标签页切换后，放弃旧文档的剩余图片请求
    if ((fileStore.currentFile?.path || undefined) !== filePath) return

    const src = img.getAttribute('src')
    if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) continue

    const cacheKey = `${filePath ?? ''}:${src}`
    if (imageCache.has(cacheKey)) {
      img.src = imageCache.get(cacheKey)!
      continue
    }
    try {
      const result = await fileStore.getImage(src, filePath)
      if (result.success && result.data) {
        // 请求返回期间可能已经切换到其他标签页
        if ((fileStore.currentFile?.path || undefined) !== filePath) return
        imageCache.set(cacheKey, result.data)
        img.src = result.data
      }
    } catch { /* ignore */ }
  }
}

watch([activeTabId, fileContent], ([newTabId, newContent], [oldTabId]) => {
  const view = viewRef.value
  if (!view) return

  const currentMarkdown = serializeMarkdown(view.state.doc).replace(/\n+$/, '')
  const normalizedNewContent = (newContent || '').replace(/\n+$/, '')
  const tabChanged = newTabId !== oldTabId
  if (!tabChanged && currentMarkdown === normalizedNewContent) return

  // 从 store 同步内容到编辑器：直接用 updateState 替换整个 state
  // 避免 dispatch transaction 时和当前 state 不匹配，同时阻止
  // createDocumentChangePlugin 回写 store 造成双向循环
  isUpdatingFromStore = true
  const newState = EditorState.create({
    doc: parseMarkdown(newContent || ''),
    plugins: view.state.plugins
  })
  view.updateState(newState)
  isUpdatingFromStore = false
  syncShowMarkers()
  nextTick(() => loadEditorImages())
})

watch(() => themeStore.currentTheme, () => {
  nextTick(() => {
    const view = viewRef.value
    if (!view) return
    view.updateState(view.state)
    scheduleSyntaxHighlight(view)
  })
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
  const createCell = (isHeader: boolean, text: string) => {
    const type = isHeader ? schema.nodes.table_header : schema.nodes.table_cell
    return type.create({}, schema.text(text))
  }
  const headerRow = schema.nodes.table_row.create(null, [
    createCell(true, '列1'), createCell(true, '列2'), createCell(true, '列3'),
  ])
  const dataRow = schema.nodes.table_row.create(null, [
    createCell(false, '内容'), createCell(false, '内容'), createCell(false, '内容'),
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
  void initSyntaxHighlighter()
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
  document.addEventListener('click', closeContextMenu)
  document.addEventListener('contextmenu', closeContextMenu, true)
  window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
  const view = viewRef.value
  if (view) {
    // 删除文件后组件虽然重新挂载，窗口焦点仍可能停留在删除按钮上；
    // 点击编辑器正文时强制恢复真正的输入焦点。
    view.dom.addEventListener('mousedown', focusEditor)
  }
  window.addEventListener('focus', focusEditor)
  nextTick(() => {
    loadEditorImages()
    focusEditor()
  })
})

onUnmounted(() => {
  // 组件卸载前强制同步内容到 store，防止切换模式时内容丢失
  const view = viewRef.value
  if (view && editorTabId === activeTabId.value) {
    const markdown = serializeMarkdown(view.state.doc)
    fileStore.setContent(markdown)
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
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('contextmenu', closeContextMenu, true)
  window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('focus', focusEditor)
  view?.dom.removeEventListener('mousedown', focusEditor)
  view?.destroy()
  viewRef.value = null
  syntaxHighlighter?.dispose()
  syntaxHighlighter = null
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

  <!-- 编辑器右键菜单 -->
  <teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="context-menu editor-context-menu"
      :class="{ 'table-menu': contextMenu.type === 'table' }"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
      @contextmenu.prevent.stop
      @mouseleave="contextMenu.activeSubmenu = null"
    >
      <template
        v-for="(item, index) in contextMenu.items"
        :key="index"
      >
        <!-- 带二级菜单的项 -->
        <div
          v-if="item.children"
          class="context-menu-item submenu-trigger"
          :class="{ active: contextMenu.activeSubmenu === item.label }"
          @mouseenter="contextMenu.activeSubmenu = item.label"
        >
          <span>{{ item.label }}</span>
          <svg
            class="submenu-arrow"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>

          <!-- 二级菜单 -->
          <div
            v-show="contextMenu.activeSubmenu === item.label"
            class="submenu"
            @mouseenter="contextMenu.activeSubmenu = item.label"
          >
            <div
              v-for="(child, childIndex) in item.children"
              :key="childIndex"
              class="submenu-item"
              @click.stop="child.action(); closeContextMenu()"
            >
              {{ child.label }}
            </div>
          </div>
        </div>

        <!-- 分隔线 -->
        <div
          v-else-if="item.divider"
          class="context-menu-divider"
        />

        <!-- 普通菜单项 -->
        <div
          v-else
          class="context-menu-item"
          @click="item.action?.(); closeContextMenu()"
        >
          {{ item.label }}
        </div>
      </template>
    </div>
  </teleport>
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
  white-space: pre-wrap;
  caret-color: var(--color-primary);
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
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
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

/* prosemirror-tables 样式 */
.ir-editor-wrapper :deep(.ProseMirror .tableWrapper) { overflow-x: auto; margin: 0.5em 0; }
.ir-editor-wrapper :deep(.ProseMirror table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  overflow: hidden;
}
.ir-editor-wrapper :deep(.ProseMirror td),
.ir-editor-wrapper :deep(.ProseMirror th) {
  vertical-align: top;
  box-sizing: border-box;
  position: relative;
  min-width: 1em;
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  height: auto;
  line-height: 1.5;
}
.ir-editor-wrapper :deep(.ProseMirror th) {
  background: var(--color-bg-secondary);
  font-weight: 600;
}
/* 移除了 columnResizing 插件，不再显示 resize handle */
.ir-editor-wrapper :deep(.ProseMirror .selectedCell):after {
  z-index: 2;
  position: absolute;
  content: '';
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: var(--color-primary-light);
  pointer-events: none;
  opacity: 0.3;
}
.ir-editor-wrapper :deep(.ProseMirror-protectednode) { white-space: pre-wrap; }
.ir-editor-wrapper :deep(.ProseMirror-focused .ProseMirror-gapcursor) { display: block; }
.ir-editor-wrapper :deep(.ProseMirror-gapcursor:after) {
  content: ''; display: block; position: absolute; top: -2px; width: 20px;
  border-top: 1px solid var(--color-text);
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}
@keyframes ProseMirror-cursor-blink { to { visibility: hidden; } }

/* 编辑器右键菜单样式 */
.editor-context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 140px;
  padding: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.editor-context-menu .context-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}

.editor-context-menu .context-menu-item:hover,
.editor-context-menu .context-menu-item.active {
  background: var(--color-bg-secondary);
}

.editor-context-menu .submenu-arrow {
  margin-left: 8px;
  opacity: 0.6;
}

/* 二级菜单 */
.editor-context-menu .submenu-trigger {
  position: relative;
}

.editor-context-menu .submenu {
  position: absolute;
  top: -4px;
  left: 100%;
  margin-left: 2px;
  min-width: 130px;
  padding: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  z-index: 10001;
}

.editor-context-menu .submenu-item {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}

.editor-context-menu .submenu-item:hover {
  background: var(--color-bg-secondary);
}

.editor-context-menu .context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}
</style>
