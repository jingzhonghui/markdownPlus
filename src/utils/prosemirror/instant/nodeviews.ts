/**
 * 即时渲染模式 - 自定义 NodeView
 * 控制每个块级节点的渲染方式
 */
import { NodeView, EditorView as ProseMirrorView } from 'prosemirror-view'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { isBlockInSourceMode } from './state'
import { getMarkdownMarker } from './decorations'

/**
 * 基础即时渲染 NodeView
 * 根据块的源码/渲染状态切换显示方式
 */
export class InstantRenderNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement | undefined
  node: ProseMirrorNode
  view: EditorView
  getPos: () => number

  constructor(
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number
  ) {
    this.node = node
    this.view = view
    this.getPos = getPos

    const isSource = isBlockInSourceMode(view.state, getPos())
    this.dom = this.createDOM(node, isSource)
  }

  createDOM(node: ProseMirrorNode, isSource: boolean): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'ir-block'

    if (isSource) {
      dom.classList.add('ir-source')
      // 源码态：显示 Markdown 标记
      const marker = this.createMarker(node)
      if (marker) {
        dom.appendChild(marker)
      }
    } else {
      dom.classList.add('ir-rendered')
    }

    // 创建内容容器
    const contentDOM = this.createContentDOM(node)
    if (contentDOM) {
      dom.appendChild(contentDOM)
      this.contentDOM = contentDOM
    }

    return dom
  }

  createContentDOM(node: ProseMirrorNode): HTMLElement | undefined {
    // 子类应重写此方法
    return undefined
  }

  createMarker(_node: ProseMirrorNode): HTMLElement | null {
    const marker = document.createElement('span')
    marker.className = 'ir-marker'
    marker.contentEditable = 'false'
    return marker
  }

  update(node: ProseMirrorNode, decorations: readonly unknown[]): boolean {
    if (node.type !== this.node.type) return false

    const isSource = isBlockInSourceMode(this.view.state, this.getPos())
    const wasSource = this.dom.classList.contains('ir-source')

    if (isSource !== wasSource) {
      // 状态切换，需要重新创建 DOM
      return false
    }

    this.node = node
    return true
  }

  destroy() {
    // 清理
  }

  stopEvent(event: Event): boolean {
    // 阻止标记符上的事件
    const target = event.target as HTMLElement
    if (target && target.classList.contains('ir-marker')) {
      return true
    }
    return false
  }
}

/**
 * 标题节点 NodeView
 */
export class HeadingNodeView extends InstantRenderNodeView {
  createContentDOM(node: ProseMirrorNode): HTMLElement {
    const level = node.attrs.level as number
    const el = document.createElement(`h${level}`)
    return el
  }

  createMarker(node: ProseMirrorNode): HTMLElement | null {
    const marker = super.createMarker(node)
    if (!marker) return null

    const level = node.attrs.level as number
    marker.textContent = '#'.repeat(level) + ' '
    return marker
  }
}

/**
 * 引用块 NodeView
 */
export class BlockquoteNodeView extends InstantRenderNodeView {
  createContentDOM(): HTMLElement {
    return document.createElement('blockquote')
  }

  createMarker(): HTMLElement | null {
    const marker = super.createMarker(this.node)
    if (!marker) return null
    marker.textContent = '> '
    return marker
  }
}

/**
 * 代码块 NodeView
 * 渲染态下显示 Shiki 高亮，点击后进入源码态
 */
export class CodeBlockNodeView extends InstantRenderNodeView {
  private shikiContainer: HTMLElement | null = null

  createContentDOM(node: ProseMirrorNode): HTMLElement {
    const isSource = isBlockInSourceMode(this.view.state, this.getPos())

    if (isSource) {
      // 源码态：显示 textarea 风格的可编辑区域
      const wrapper = document.createElement('div')
      wrapper.className = 'ir-code-source'

      const langLabel = document.createElement('div')
      langLabel.className = 'ir-code-lang'
      langLabel.textContent = (node.attrs.language as string) || 'text'
      langLabel.contentEditable = 'false'
      wrapper.appendChild(langLabel)

      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.className = 'ir-code-content'
      pre.appendChild(code)
      wrapper.appendChild(pre)

      return wrapper
    } else {
      // 渲染态：Shiki 高亮容器
      const wrapper = document.createElement('div')
      wrapper.className = 'ir-code-rendered'

      const langLabel = document.createElement('div')
      langLabel.className = 'ir-code-lang'
      langLabel.textContent = (node.attrs.language as string) || 'text'
      langLabel.contentEditable = 'false'
      wrapper.appendChild(langLabel)

      this.shikiContainer = document.createElement('div')
      this.shikiContainer.className = 'ir-shiki-container'
      wrapper.appendChild(this.shikiContainer)

      // 异步应用 Shiki 高亮
      this.applyShikiHighlight()

      return wrapper
    }
  }

  createMarker(node: ProseMirrorNode): HTMLElement | null {
    const isSource = isBlockInSourceMode(this.view.state, this.getPos())
    if (!isSource) return null

    const marker = super.createMarker(node)
    if (!marker) return null
    const lang = (node.attrs.language as string) || ''
    marker.textContent = '```' + lang + '\n'
    return marker
  }

  async applyShikiHighlight(): Promise<void> {
    if (!this.shikiContainer) return

    const text = this.node.textContent
    const lang = (this.node.attrs.language as string) || 'text'

    try {
      const { createHighlighter } = await import('shiki')
      const highlighter = await createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: [lang]
      })

      const isDark = document.documentElement.classList.contains('dark')
      const theme = isDark ? 'github-dark' : 'github-light'

      const highlighted = highlighter.codeToHtml(text, {
        lang,
        theme
      })

      this.shikiContainer.innerHTML = highlighted
    } catch {
      // Shiki 加载失败，显示普通代码
      this.shikiContainer.innerHTML = `<pre><code>${escapeHtml(text)}</code></pre>`
    }
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false

    const isSource = isBlockInSourceMode(this.view.state, this.getPos())
    const wasSource = this.dom.classList.contains('ir-source')

    if (isSource !== wasSource) {
      // 状态切换，需要重新创建 DOM
      return false
    }

    // 如果语言变化了，更新标签
    if (!isSource && node.attrs.language !== this.node.attrs.language) {
      const langLabel = this.dom.querySelector('.ir-code-lang') as HTMLElement
      if (langLabel) {
        langLabel.textContent = (node.attrs.language as string) || 'text'
      }
      this.applyShikiHighlight()
    }

    this.node = node
    return true
  }

  // 点击时进入源码态
  handleClick(event: MouseEvent): boolean {
    const isSource = isBlockInSourceMode(this.view.state, this.getPos())
    if (!isSource) {
      // 点击渲染态的代码块，切换到源码态
      const { setBlockSourceMode } = require('./state')
      const tr = setBlockSourceMode(this.view.state, this.getPos(), true)
      this.view.dispatch(tr)
      this.view.focus()
      return true
    }
    return false
  }

  stopEvent(event: Event): boolean {
    // 代码块渲染态下点击事件特殊处理
    if (event.type === 'click' && this.dom.classList.contains('ir-rendered')) {
      return this.handleClick(event as MouseEvent)
    }
    return super.stopEvent(event)
  }
}

/**
 * 表格 NodeView
 * 渲染态下支持基本的单元格编辑
 */
export class TableNodeView extends InstantRenderNodeView {
  createContentDOM(): HTMLElement {
    return document.createElement('table')
  }

  // 表格始终显示为渲染态，支持直接编辑
  createDOM(node: ProseMirrorNode, _isSource: boolean): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'ir-block ir-table-block'

    const table = document.createElement('table')
    table.className = 'ir-table-rendered'
    dom.appendChild(table)
    this.contentDOM = table

    return dom
  }
}

/**
 * 图片 NodeView
 * 渲染态显示图片，源码态显示 Markdown 语法
 */
export class ImageNodeView implements NodeView {
  dom: HTMLElement
  node: ProseMirrorNode
  view: EditorView
  getPos: () => number

  constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.dom = this.createDOM()
  }

  createDOM(): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'ir-image-wrapper'

    const src = this.node.attrs.src as string
    const alt = this.node.attrs.alt as string

    if (!src) {
      // 无图片显示占位
      wrapper.classList.add('ir-image-placeholder')
      wrapper.textContent = `[${alt || '图片'}]`
      return wrapper
    }

    const img = document.createElement('img')
    img.src = src
    img.alt = alt
    img.className = 'ir-image'

    // 加载本地图片
    if (!src.startsWith('http') && !src.startsWith('data:')) {
      this.loadLocalImage(img, src)
    }

    wrapper.appendChild(img)

    // 悬浮时显示 alt 文本
    if (alt) {
      img.title = alt
    }

    return wrapper
  }

  async loadLocalImage(img: HTMLImageElement, path: string): Promise<void> {
    try {
      const { useFileStore } = await import('../../../stores/file')
      const fileStore = useFileStore()
      const result = await fileStore.getImage(path)
      if (result.success && result.data) {
        img.src = result.data
      }
    } catch (err) {
      console.error('加载图片失败:', path, err)
    }
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type.name !== 'image') return false

    const oldSrc = this.node.attrs.src as string
    const newSrc = node.attrs.src as string
    const oldAlt = this.node.attrs.alt as string
    const newAlt = node.attrs.alt as string

    if (oldSrc !== newSrc || oldAlt !== newAlt) {
      // 属性变化，重建 DOM
      return false
    }

    this.node = node
    return true
  }

  destroy() {
    // 清理
  }

  selectNode() {
    this.dom.classList.add('ir-image-selected')
  }

  deselectNode() {
    this.dom.classList.remove('ir-image-selected')
  }
}

/**
 * 列表项 NodeView
 */
export class ListItemNodeView extends InstantRenderNodeView {
  createContentDOM(): HTMLElement {
    return document.createElement('li')
  }

  createMarker(): HTMLElement | null {
    const marker = super.createMarker(this.node)
    if (!marker) return null

    const parent = this.node
    let markerText = '- '

    if (parent.type.name === 'task_item') {
      const checked = parent.attrs.checked ? 'x' : ' '
      markerText = `- [${checked}] `
    }

    marker.textContent = markerText
    return marker
  }
}

/**
 * 通用块级 NodeView 工厂
 */
export function createInstantNodeViews(): Record<string, (node: ProseMirrorNode, view: EditorView, getPos: () => number) => NodeView> {
  return {
    heading: (node, view, getPos) => new HeadingNodeView(node, view, getPos),
    blockquote: (node, view, getPos) => new BlockquoteNodeView(node, view, getPos),
    code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos),
    table: (node, view, getPos) => new TableNodeView(node, view, getPos),
    image: (node, view, getPos) => new ImageNodeView(node, view, getPos),
    list_item: (node, view, getPos) => new ListItemNodeView(node, view, getPos),
    task_item: (node, view, getPos) => new ListItemNodeView(node, view, getPos)
  }
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
