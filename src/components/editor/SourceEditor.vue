<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import { useFileStore } from '../../stores/file'
import { useThemeStore } from '../../stores/theme'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap, type Completion } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'

// Props
interface Props {
  class?: string
}

defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:content', content: string): void
  (e: 'scroll', ratio: number): void
}>()

// Store
const fileStore = useFileStore()
const themeStore = useThemeStore()

// Refs
const editorRef = ref<HTMLDivElement>()
const editorView = shallowRef<EditorView | null>(null)

// 主题 compartment - 在 initEditor 中创建
let themeCompartment: Compartment | null = null

// 查找替换面板状态
const showSearchPanel = ref(false)

// 是否正在同步内容（防止循环更新）
let isSyncing = false

/**
 * 创建 CodeMirror 扩展配置
 */
function createExtensions(): Extension[] {
  // 创建主题 compartment
  themeCompartment = new Compartment()

  const extensions: Extension[] = [
    // 基础编辑功能
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    closeBrackets(),

    // Markdown 语言支持
    markdown({
      base: markdownLanguage,
      codeLanguages: languages
    }),

    // 自动补全
    autocompletion({
      override: [markdownCompletions],
      closeOnBlur: true
    }),

    // 按键映射
    keymap.of([
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...customKeymap
    ]),

    // 主题（使用 compartment）
    themeCompartment.of(getThemeExtension()),

    // 自定义样式
    editorStyles,

    // 内容变化监听
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !isSyncing) {
        const content = update.state.doc.toString()
        fileStore.updateContent(content)
        emit('update:content', content)
      }
      if (update.selectionSet) {
        updateCursorPosition(update.state)
      }
    })
  ]

  return extensions
}

/**
 * Markdown 自动补全
 */
function markdownCompletions(context: { matchBefore: (regexp: RegExp) => { from: number; to: number; text: string } | null; explicit: boolean }): { from: number; options: Completion[] } | null {
  const word = context.matchBefore(/^\s*[#\-* >[]?/)
  if (!word && !context.explicit) return null

  const completions: Completion[] = [
    // 标题
    { label: '# ', type: 'keyword', detail: 'H1 标题', info: '一级标题' },
    { label: '## ', type: 'keyword', detail: 'H2 标题', info: '二级标题' },
    { label: '### ', type: 'keyword', detail: 'H3 标题', info: '三级标题' },
    { label: '#### ', type: 'keyword', detail: 'H4 标题', info: '四级标题' },
    
    // 列表
    { label: '- ', type: 'keyword', detail: '无序列表', info: '创建无序列表项' },
    { label: '1. ', type: 'keyword', detail: '有序列表', info: '创建有序列表项' },
    { label: '- [ ] ', type: 'keyword', detail: '任务列表', info: '创建未完成任务' },
    { label: '- [x] ', type: 'keyword', detail: '任务列表', info: '创建已完成任务' },
    
    // 引用和代码
    { label: '> ', type: 'keyword', detail: '引用块', info: '创建引用块' },
    { label: '```', type: 'keyword', detail: '代码块', info: '创建 fenced 代码块' },
    { label: '```js', type: 'keyword', detail: 'JS代码块', info: '创建 JavaScript 代码块' },
    { label: '```ts', type: 'keyword', detail: 'TS代码块', info: '创建 TypeScript 代码块' },
    { label: '```python', type: 'keyword', detail: 'Python代码块', info: '创建 Python 代码块' },
    
    // 行内格式
    { label: '**粗体**', type: 'text', detail: '粗体', apply: '****', boost: -1 },
    { label: '*斜体*', type: 'text', detail: '斜体', apply: '**', boost: -1 },
    { label: '`代码`', type: 'text', detail: '行内代码', apply: '``', boost: -1 },
    { label: '[链接](url)', type: 'text', detail: '链接', apply: '[]()', boost: -1 },
    { label: '![图片](url)', type: 'text', detail: '图片', apply: '![]()', boost: -1 },
    
    // 水平线
    { label: '---', type: 'keyword', detail: '分割线' },
    
    // 表格
    { label: '| 表头 | 表头 |', type: 'text', detail: '表格', apply: '|  |  |\n|---|---|\n|  |  |' }
  ]

  return {
    from: word?.from ?? 0,
    options: completions
  }
}

/**
 * 自定义快捷键
 */
const customKeymap = [
  // Ctrl+B: 粗体
  {
    key: 'Mod-b',
    run: (view: EditorView) => {
      wrapSelection(view, '**', '**')
      return true
    },
    preventDefault: true
  },
  // Ctrl+I: 斜体
  {
    key: 'Mod-i',
    run: (view: EditorView) => {
      wrapSelection(view, '*', '*')
      return true
    },
    preventDefault: true
  },
  // Ctrl+K: 插入链接
  {
    key: 'Mod-k',
    run: (view: EditorView) => {
      insertLink(view)
      return true
    },
    preventDefault: true
  },
  // Ctrl+Shift+K: 插入图片
  {
    key: 'Mod-Shift-k',
    run: (view: EditorView) => {
      insertImage(view)
      return true
    },
    preventDefault: true
  },
  // Ctrl+H: 切换标题级别
  {
    key: 'Mod-h',
    run: (view: EditorView) => {
      cycleHeading(view)
      return true
    },
    preventDefault: true
  },
  // Ctrl+/: 切换注释
  {
    key: 'Mod-/',
    run: (view: EditorView) => {
      toggleComment(view)
      return true
    },
    preventDefault: true
  },
  // 列表项回车自动续行
  {
    key: 'Enter',
    run: (view: EditorView) => {
      return continueList(view) || false
    }
  },
  // Tab: 增加缩进（列表嵌套）
  {
    key: 'Tab',
    run: (view: EditorView) => {
      return indentList(view, true)
    }
  },
  // Shift+Tab: 减少缩进
  {
    key: 'Shift-Tab',
    run: (view: EditorView) => {
      return indentList(view, false)
    }
  },
    // Esc: 关闭查找面板
  {
    key: 'Escape',
    run: (view: EditorView) => {
      const result = closeSearchPanel(view)
      showSearchPanel.value = false
      return result
    }
  }
]

/**
 * 包裹选中文本
 */
function wrapSelection(view: EditorView, before: string, after: string): void {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.sliceString(from, to)
  
  view.dispatch({
    changes: { from, to, insert: before + text + after },
    selection: { anchor: from + before.length + text.length }
  })
  
  view.focus()
}

/**
 * 插入链接
 */
function insertLink(view: EditorView): void {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.sliceString(from, to)
  
  if (text) {
    // 有选中文本，包裹为链接
    view.dispatch({
      changes: { from, to, insert: `[${text}]()` },
      selection: { anchor: from + text.length + 3 }
    })
  } else {
    // 无选中文本，插入占位符
    view.dispatch({
      changes: { from, insert: '[链接文本]()' },
      selection: { anchor: from + 6 }
    })
  }
  
  view.focus()
}

/**
 * 插入图片
 */
function insertImage(view: EditorView): void {
  const { from } = view.state.selection.main
  
  view.dispatch({
    changes: { from, insert: '![图片描述]()' },
    selection: { anchor: from + 7 }
  })
  
  view.focus()
}

/**
 * 切换标题级别
 */
function cycleHeading(view: EditorView): void {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const lineText = line.text
  
  // 匹配现有标题
  const match = lineText.match(/^(#{0,4})\s/)
  if (match) {
    const currentLevel = match[1].length
    const newLevel = currentLevel >= 4 ? 0 : currentLevel + 1
    
    if (newLevel === 0) {
      // 移除标题标记
      const newText = lineText.replace(/^#{1,4}\s+/, '')
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText }
      })
    } else {
      // 修改标题级别
      const newText = lineText.replace(/^#{0,4}\s*/, '#'.repeat(newLevel) + ' ')
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText }
      })
    }
  } else {
    // 添加一级标题
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: '# ' }
    })
  }
  
  view.focus()
}

/**
 * 切换注释
 */
function toggleComment(view: EditorView): void {
  const { from, to } = view.state.selection.main
  const lines: { from: number; to: number; text: string }[] = []
  
  for (let pos = from; pos <= to; ) {
    const line = view.state.doc.lineAt(pos)
    lines.push({ from: line.from, to: line.to, text: line.text })
    pos = line.to + 1
  }
  
  // 检查是否已注释
  const allCommented = lines.every(line => line.text.trim().startsWith('<!--') && line.text.trim().endsWith('-->'))
  
  const changes = lines.map(line => {
    if (allCommented) {
      // 取消注释
      const newText = line.text.replace(/<!--\s*/, '').replace(/\s*-->/, '')
      return { from: line.from, to: line.to, insert: newText }
    } else {
      // 添加注释
      return { from: line.from, to: line.to, insert: `<!-- ${line.text} -->` }
    }
  })
  
  view.dispatch({ changes })
  view.focus()
}

/**
 * 列表项回车自动续行
 */
function continueList(view: EditorView): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const lineText = line.text
  
  // 匹配列表项
  const match = lineText.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
  if (match) {
    const [, indent, marker, content] = match
    
    // 如果列表项为空，取消列表
    if (!content.trim()) {
      view.dispatch({
        changes: { from: line.from, to: from, insert: '' }
      })
      return true
    }
    
    // 任务列表
    const taskMatch = marker.match(/^-\s*\[(.)\]$/)
    if (taskMatch) {
      view.dispatch({
        changes: { from, insert: `\n${indent}- [ ] ` }
      })
      return true
    }
    
    // 有序列表，递增数字
    if (/^\d+\./.test(marker)) {
      const num = parseInt(marker) + 1
      view.dispatch({
        changes: { from, insert: `\n${indent}${num}. ` }
      })
      return true
    }
    
    // 无序列表
    view.dispatch({
      changes: { from, insert: `\n${indent}${marker} ` }
    })
    return true
  }
  
  return false
}

/**
 * 列表缩进/反缩进
 */
function indentList(view: EditorView, increase: boolean): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const lineText = line.text
  
  // 检查是否是列表项
  if (/^\s*([-*]|\d+\.)\s/.test(lineText)) {
    if (increase) {
      view.dispatch({
        changes: { from: line.from, insert: '  ' }
      })
    } else if (lineText.startsWith('  ')) {
      view.dispatch({
        changes: { from: line.from, to: line.from + 2, insert: '' }
      })
    }
    view.focus()
    return true
  }
  
  return false
}

/**
 * 获取主题扩展
 */
function getThemeExtension(): Extension {
  const isDark = themeStore.isDark
  
  if (isDark) {
    // 深色主题：继承 oneDark 并增强选区样式
    return [
      oneDark,
      EditorView.theme({
        '&': {
          backgroundColor: 'var(--color-bg-primary)'
        },
        '.cm-selectionBackground': {
          backgroundColor: 'rgba(96, 165, 250, 0.4) !important'
        },
        '.cm-selectionMatch': {
          backgroundColor: 'rgba(96, 165, 250, 0.3) !important'
        },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: 'rgba(96, 165, 250, 0.5) !important'
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(96, 165, 250, 0.08)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'rgba(96, 165, 250, 0.08)'
        }
      })
    ]
  }
  
  // 浅色主题使用默认样式
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text)'
    },
    '.cm-content': {
      caretColor: 'var(--color-primary)'
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--color-primary)'
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.3) !important'
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(59, 130, 246, 0.2) !important'
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.4) !important'
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(59, 130, 246, 0.05)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(59, 130, 246, 0.05)'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-bg-secondary)',
      borderRight: '1px solid var(--color-border)',
      color: 'var(--color-text-tertiary)'
    },
    '.cm-lineNumbers': {
      color: 'var(--color-text-tertiary)'
    }
  })
}

/**
 * 自定义编辑器样式
 */
const editorStyles = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: 'var(--font-mono)'
  },
  '.cm-content': {
    padding: '24px 32px',
    lineHeight: '1.6'
  },
  '.cm-line': {
    padding: '0 4px'
  },
  '.cm-gutters': {
    fontFamily: 'var(--font-mono)'
  },
  // Markdown 标记样式
  '.cm-heading': {
    fontWeight: 'bold',
    color: 'var(--color-primary)'
  },
  '.cm-link': {
    color: 'var(--color-primary)',
    textDecoration: 'underline'
  },
  '.cm-url': {
    color: 'var(--color-success)'
  },
  '.cm-emphasis': {
    fontStyle: 'italic'
  },
  '.cm-strong': {
    fontWeight: 'bold'
  },
  '.cm-strikethrough': {
    textDecoration: 'line-through'
  },
  '.cm-code': {
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--color-bg-secondary)',
    padding: '2px 4px',
    borderRadius: '3px'
  },
  '.cm-blockquote': {
    color: 'var(--color-text-secondary)',
    borderLeft: '3px solid var(--color-border)'
  },
  '.cm-list': {
    color: 'var(--color-text)'
  },
  '.cm-comment': {
    color: 'var(--color-text-tertiary)',
    fontStyle: 'italic'
  },
  '.cm-keyword': {
    color: 'var(--color-primary)',
    fontWeight: 'bold'
  },
  '.cm-string': {
    color: 'var(--color-success)'
  },
  '.cm-number': {
    color: 'var(--color-warning)'
  }
})

/**
 * 更新光标位置
 */
function updateCursorPosition(state: EditorState): void {
  const pos = state.selection.main.head
  const line = state.doc.lineAt(pos)
  const lineNumber = line.number
  const column = pos - line.from + 1
  fileStore.setCursorPosition(lineNumber, column)
}

/**
 * 初始化编辑器
 */
function initEditor(): void {
  if (!editorRef.value) return

  const startState = EditorState.create({
    doc: fileStore.fileContent,
    extensions: createExtensions()
  })

  const view = new EditorView({
    state: startState,
    parent: editorRef.value
  })

  // 监听滚动事件
  const scroller = view.scrollDOM
  scroller.addEventListener('scroll', handleScroll)

  editorView.value = view
}

/**
 * 处理滚动事件
 */
function handleScroll(): void {
  if (isSyncing) return
  const view = editorView.value
  if (!view) return

  const scroller = view.scrollDOM
  const maxScroll = scroller.scrollHeight - scroller.clientHeight
  if (maxScroll > 0) {
    const ratio = scroller.scrollTop / maxScroll
    emit('scroll', ratio)
  }
}

/**
 * 切换查找面板
 */
function toggleSearchPanel(): void {
  const view = editorView.value
  if (!view) return
  
  if (showSearchPanel.value) {
    closeSearchPanel(view)
    showSearchPanel.value = false
  } else {
    openSearchPanel(view)
    showSearchPanel.value = true
  }
}

/**
 * 销毁编辑器
 */
function destroyEditor(): void {
  const view = editorView.value
  if (view) {
    view.scrollDOM.removeEventListener('scroll', handleScroll)
    view.destroy()
  }
  editorView.value = null
}

/**
 * 处理拖放事件 - 图片拖放
 */
function handleDragOver(e: DragEvent): void {
  e.preventDefault()
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault()

  if (!e.dataTransfer) return

  const files = Array.from(e.dataTransfer.files)
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await insertImageFromFile(file)
    }
  }
}

/**
 * 处理粘贴事件 - 图片粘贴
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
  const view = editorView.value
  if (!view) return

  const result = await fileStore.addImage(file)
  if (result.success && result.path) {
    const { from } = view.state.selection.main
    view.dispatch({
      changes: { from, insert: `![${file.name}](${result.path})` }
    })
    view.focus()
  }
}

/**
 * 更新编辑器主题
 */
function updateTheme(): void {
  const view = editorView.value
  if (!view || !themeCompartment) return
  
  view.dispatch({
    effects: themeCompartment.reconfigure(getThemeExtension())
  })
}

// ========== 工具栏事件处理 ==========

function handleFormatEvent(e: Event): void {
  const view = editorView.value
  if (!view) return

  const format = (e as CustomEvent).detail as string
  switch (format) {
    case 'bold':
      wrapSelection(view, '**', '**')
      break
    case 'italic':
      wrapSelection(view, '*', '*')
      break
    case 'strikethrough':
      wrapSelection(view, '~~', '~~')
      break
    case 'unorderedList':
      prependLinePrefix(view, '- ')
      break
    case 'orderedList':
      prependLinePrefix(view, '1. ')
      break
    case 'blockquote':
      prependLinePrefix(view, '> ')
      break
    case 'table':
      insertTable(view)
      break
  }
  view.focus()
}

function handleHeadingEvent(e: Event): void {
  const view = editorView.value
  if (!view) return

  const level = (e as CustomEvent).detail as number
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)

  // 移除已有标题标记
  const existingMatch = line.text.match(/^(#{0,4})\s/)
  const currentLevel = existingMatch ? existingMatch[1].length : 0

  let newText: string
  if (level === 0) {
    newText = line.text.replace(/^#{1,4}\s+/, '')
  } else if (currentLevel > 0) {
    newText = line.text.replace(/^#{1,4}\s*/, '#'.repeat(level) + ' ')
  } else {
    newText = '#'.repeat(level) + ' ' + line.text
  }

  view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } })
  view.focus()
}

function handleLinkEvent(e: Event): void {
  const view = editorView.value
  if (!view) return

  const { href, title } = (e as CustomEvent).detail as { href: string; title: string }
  const { from, to } = view.state.selection.main
  const selectedText = view.state.doc.sliceString(from, to)
  const linkText = title || selectedText || '链接文本'
  const insert = `[${linkText}](${href})`

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 1, head: from + 1 + linkText.length }
  })
  view.focus()
}

function handleImageEvent(e: Event): void {
  const view = editorView.value
  if (!view) return

  const { src, alt } = (e as CustomEvent).detail as { src: string; alt: string }
  const { from } = view.state.selection.main
  const altText = alt || '图片'
  const insert = `![${altText}](${src})`

  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + 2, head: from + 2 + altText.length }
  })
  view.focus()
}

function handleCodeBlockEvent(e: Event): void {
  const view = editorView.value
  if (!view) return

  const { language } = (e as CustomEvent).detail as { language?: string }
  const { from } = view.state.selection.main
  const lang = language || ''
  const insert = `\n\`\`\`${lang}\n\n\`\`\`\n`

  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + 4 + lang.length + 1 }
  })
  view.focus()
}

/** 在当前行首插入前缀 */
function prependLinePrefix(view: EditorView, prefix: string): void {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)

  // 如果已有相同前缀则移除
  if (line.text.startsWith(prefix)) {
    const newText = line.text.slice(prefix.length)
    view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } })
  } else {
    // 移除其他列表前缀
    const cleaned = line.text.replace(/^[-*]\s|\d+\.\s|>\s/, '')
    view.dispatch({ changes: { from: line.from, to: line.to, insert: prefix + cleaned } })
  }
}

/** 插入表格 */
function insertTable(view: EditorView): void {
  const { from } = view.state.selection.main
  const table = [
    '| 列1 | 列2 | 列3 |',
    '| --- | --- | --- |',
    '| 内容 | 内容 | 内容 |'
  ].join('\n')

  view.dispatch({
    changes: { from, insert: '\n' + table + '\n' },
    selection: { anchor: from + 3 }
  })
}

// Lifecycle
onMounted(() => {
  initEditor()

  // 添加拖放和粘贴事件监听
  const editorEl = editorRef.value
  if (editorEl) {
    editorEl.addEventListener('dragover', handleDragOver)
    editorEl.addEventListener('drop', handleDrop)
    editorEl.addEventListener('paste', handlePaste)
  }

  // 工具栏事件监听
  window.addEventListener('editor:format', handleFormatEvent)
  window.addEventListener('editor:heading', handleHeadingEvent)
  window.addEventListener('editor:link', handleLinkEvent)
  window.addEventListener('editor:image', handleImageEvent)
  window.addEventListener('editor:codeBlock', handleCodeBlockEvent)
})

onUnmounted(() => {
  // 移除事件监听
  const editorEl = editorRef.value
  if (editorEl) {
    editorEl.removeEventListener('dragover', handleDragOver)
    editorEl.removeEventListener('drop', handleDrop)
    editorEl.removeEventListener('paste', handlePaste)
  }

  window.removeEventListener('editor:format', handleFormatEvent)
  window.removeEventListener('editor:heading', handleHeadingEvent)
  window.removeEventListener('editor:link', handleLinkEvent)
  window.removeEventListener('editor:image', handleImageEvent)
  window.removeEventListener('editor:codeBlock', handleCodeBlockEvent)

  destroyEditor()
})

// Watch for content changes from store
watch(() => fileStore.fileContent, (newContent) => {
  const view = editorView.value
  if (!view) return
  
  const currentContent = view.state.doc.toString()
  if (currentContent !== newContent) {
    isSyncing = true
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: newContent }
    })
    isSyncing = false
  }
})

// Watch for theme changes
watch(() => themeStore.currentTheme, updateTheme)
watch(() => themeStore.systemPreference, updateTheme)

// Expose methods for parent component
defineExpose({
  toggleSearchPanel,
  focus: () => editorView.value?.focus(),
  getView: () => editorView.value,
  scrollTo: (ratio: number) => {
    const view = editorView.value
    if (!view) return
    const scroller = view.scrollDOM
    const maxScroll = scroller.scrollHeight - scroller.clientHeight
    if (maxScroll > 0) {
      scroller.scrollTop = ratio * maxScroll
    }
  }
})
</script>

<template>
  <div class="source-container">
    <div
      ref="editorRef"
      class="codemirror-wrapper"
    />
  </div>
</template>

<style scoped>
.source-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.codemirror-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.codemirror-wrapper :deep(.cm-editor) {
  height: 100%;
}

.codemirror-wrapper :deep(.cm-scroller) {
  font-family: var(--font-mono);
  overflow: auto;
}

/* 自动补全面板样式 */
.codemirror-wrapper :deep(.cm-tooltip) {
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.codemirror-wrapper :deep(.cm-tooltip-section) {
  padding: 4px 0;
}

.codemirror-wrapper :deep(.cm-completionLabel) {
  color: var(--color-text);
  font-family: var(--font-mono);
}

.codemirror-wrapper :deep(.cm-completionDetail) {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 8px;
}

.codemirror-wrapper :deep(.cm-completionInfo) {
  color: var(--color-text-tertiary);
  font-size: 12px;
  padding: 4px 8px;
}

.codemirror-wrapper :deep(.cm-completionMatchedText) {
  color: var(--color-primary);
  font-weight: bold;
  text-decoration: none;
}

.codemirror-wrapper :deep(.cm-tooltip-autocomplete) ul li[aria-selected] {
  background-color: var(--color-bg-secondary);
}

.codemirror-wrapper :deep(.cm-completionIcon) {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.codemirror-wrapper :deep(.cm-completionIcon-keyword) {
  color: var(--color-primary);
}

.codemirror-wrapper :deep(.cm-completionIcon-text) {
  color: var(--color-text-secondary);
}

/* 查找替换面板样式 */
.codemirror-wrapper :deep(.cm-panel) {
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  padding: 8px 16px;
}

.codemirror-wrapper :deep(.cm-panel label) {
  color: var(--color-text);
  font-size: 12px;
  margin-right: 8px;
}

.codemirror-wrapper :deep(.cm-panel input) {
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  color: var(--color-text);
  font-size: 13px;
  margin-right: 8px;
}

.codemirror-wrapper :deep(.cm-panel input:focus) {
  outline: none;
  border-color: var(--color-primary);
}

.codemirror-wrapper :deep(.cm-panel button) {
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 4px 12px;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  margin-right: 4px;
}

.codemirror-wrapper :deep(.cm-panel button:hover) {
  background-color: var(--color-border);
}

.codemirror-wrapper :deep(.cm-panel button[name="close"]) {
  position: absolute;
  right: 8px;
  top: 8px;
  background: transparent;
  border: none;
  font-size: 16px;
  padding: 4px 8px;
}

.codemirror-wrapper :deep(.cm-searchMatch) {
  background-color: var(--color-warning);
  color: var(--color-text);
}

.codemirror-wrapper :deep(.cm-searchMatch-selected) {
  background-color: var(--color-primary);
  color: white;
}

/* 选区样式 - 确保选中效果更明显 */
.codemirror-wrapper :deep(.cm-selectionBackground) {
  background-color: rgba(59, 130, 246, 0.3) !important;
}

.codemirror-wrapper :deep(.cm-selectionMatch) {
  background-color: rgba(59, 130, 246, 0.2) !important;
}

.codemirror-wrapper :deep(.cm-focused) .cm-selectionBackground {
  background-color: rgba(59, 130, 246, 0.4) !important;
}

/* 深色主题选区样式 */
[data-theme='dark'] .codemirror-wrapper :deep(.cm-selectionBackground) {
  background-color: rgba(96, 165, 250, 0.4) !important;
}

[data-theme='dark'] .codemirror-wrapper :deep(.cm-selectionMatch) {
  background-color: rgba(96, 165, 250, 0.3) !important;
}

[data-theme='dark'] .codemirror-wrapper :deep(.cm-focused) .cm-selectionBackground {
  background-color: rgba(96, 165, 250, 0.5) !important;
}

/* 当前行背景 - 降低透明度让选区更明显 */
.codemirror-wrapper :deep(.cm-activeLine) {
  background-color: rgba(59, 130, 246, 0.05) !important;
}

.codemirror-wrapper :deep(.cm-activeLineGutter) {
  background-color: rgba(59, 130, 246, 0.05) !important;
}

[data-theme='dark'] .codemirror-wrapper :deep(.cm-activeLine) {
  background-color: rgba(96, 165, 250, 0.08) !important;
}

[data-theme='dark'] .codemirror-wrapper :deep(.cm-activeLineGutter) {
  background-color: rgba(96, 165, 250, 0.08) !important;
}
</style>
