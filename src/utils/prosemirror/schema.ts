/**
 * ProseMirror Schema 定义
 * 支持标准 Markdown 语法 + GFM 扩展（表格、任务列表）
 */
import { Schema, NodeSpec, MarkSpec, DOMOutputSpec } from 'prosemirror-model'

/**
 * 块级节点定义
 */
const nodes: Record<string, NodeSpec> = {
  /**
   * 文档根节点
   */
  doc: {
    content: 'block+'
  },

  /**
   * 段落
   */
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM(): DOMOutputSpec {
      return ['p', 0]
    }
  },

  /**
   * 标题 H1-H4
   */
  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', attrs: { level: 1 } },
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
      { tag: 'h4', attrs: { level: 4 } }
    ],
    toDOM(node): DOMOutputSpec {
      return ['h' + node.attrs.level, 0]
    }
  },

  /**
   * 引用块
   */
  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM(): DOMOutputSpec {
      return ['blockquote', 0]
    }
  },

  /**
   * 代码块
   */
  code_block: {
    attrs: { language: { default: '' } },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs(dom: HTMLElement) {
          const code = dom.querySelector('code')
          const lang = code?.getAttribute('class')?.replace(/^language-/, '') || ''
          return { language: lang }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      const { language } = node.attrs
      return language
        ? ['pre', ['code', { class: 'language-' + language }, 0]]
        : ['pre', ['code', 0]]
    }
  },

  /**
   * 有序列表
   */
  ordered_list: {
    attrs: { order: { default: 1 } },
    content: 'list_item+',
    group: 'block list',
    parseDOM: [
      {
        tag: 'ol',
        getAttrs(dom: HTMLElement) {
          const start = dom.getAttribute('start')
          return { order: start ? parseInt(start, 10) : 1 }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      return node.attrs.order === 1
        ? ['ol', 0]
        : ['ol', { start: node.attrs.order }, 0]
    }
  },

  /**
   * 无序列表
   */
  bullet_list: {
    content: 'list_item+',
    group: 'block list',
    parseDOM: [{ tag: 'ul' }],
    toDOM(): DOMOutputSpec {
      return ['ul', 0]
    }
  },

  /**
   * 任务列表（GFM）
   */
  task_list: {
    content: 'task_item+',
    group: 'block list',
    parseDOM: [{ tag: 'ul[data-type="task_list"]' }],
    toDOM(): DOMOutputSpec {
      return ['ul', { 'data-type': 'task_list' }, 0]
    }
  },

  /**
   * 列表项（用于有序/无序列表）
   */
  list_item: {
    content: 'block+',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM(): DOMOutputSpec {
      return ['li', 0]
    }
  },

  /**
   * 任务列表项（GFM）
   */
  task_item: {
    attrs: { checked: { default: false } },
    content: 'block+',
    defining: true,
    parseDOM: [
      {
        tag: 'li[data-type="task_item"]',
        getAttrs(dom: HTMLElement) {
          const checkbox = dom.querySelector('input[type="checkbox"]') as HTMLInputElement
          return { checked: checkbox?.checked || false }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      return ['li', { 'data-type': 'task_item' }, 0]
    }
  },

  /**
   * 表格（GFM）
   */
  table: {
    content: 'table_row+',
    group: 'block',
    isolating: true,
    parseDOM: [{ tag: 'table' }],
    toDOM(): DOMOutputSpec {
      return ['table', ['tbody', 0]]
    }
  },

  /**
   * 表格行
   */
  table_row: {
    content: 'table_cell*',
    parseDOM: [{ tag: 'tr' }],
    toDOM(): DOMOutputSpec {
      return ['tr', 0]
    }
  },

  /**
   * 表格单元格
   */
  table_cell: {
    content: 'inline*',
    attrs: { align: { default: null } },
    parseDOM: [
      {
        tag: 'td',
        getAttrs(dom: HTMLElement) {
          return { align: dom.getAttribute('align') }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      const attrs: Record<string, string> = {}
      if (node.attrs.align) attrs.align = node.attrs.align as string
      return ['td', attrs, 0]
    }
  },

  /**
   * 表格表头单元格
   */
  table_header: {
    content: 'inline*',
    attrs: { align: { default: null } },
    parseDOM: [
      {
        tag: 'th',
        getAttrs(dom: HTMLElement) {
          return { align: dom.getAttribute('align') }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      const attrs: Record<string, string> = {}
      if (node.attrs.align) attrs.align = node.attrs.align as string
      return ['th', attrs, 0]
    }
  },

  /**
   * 图片
   */
  image: {
    attrs: {
      src: {},
      alt: { default: '' },
      title: { default: '' },
      width: { default: null },
      align: { default: 'center' }
    },
    inline: true,
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img',
        getAttrs(dom: HTMLElement) {
          return {
            src: dom.getAttribute('src') || '',
            alt: dom.getAttribute('alt') || '',
            title: dom.getAttribute('title') || ''
          }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      const attrs: Record<string, string> = {
        src: node.attrs.src as string,
        'data-align': node.attrs.align as string
      }
      if (node.attrs.alt) attrs.alt = node.attrs.alt as string
      if (node.attrs.title) attrs.title = node.attrs.title as string
      if (node.attrs.width) attrs.width = String(node.attrs.width)
      return ['img', attrs]
    }
  },

  /**
   * 水平分割线
   */
  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM(): DOMOutputSpec {
      return ['hr']
    }
  },

  /**
   * 硬换行
   */
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM(): DOMOutputSpec {
      return ['br']
    }
  },

  /**
   * 文本节点
   */
  text: {
    group: 'inline'
  }
}

/**
 * 行内标记定义
 */
const marks: Record<string, MarkSpec> = {
  /**
   * 粗体
   */
  bold: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node: HTMLElement) => node.style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (m) => m.type.name === 'bold' },
      { style: 'font-weight', getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
    ],
    toDOM(): DOMOutputSpec {
      return ['strong', 0]
    }
  },

  /**
   * 斜体
   */
  italic: {
    parseDOM: [
      { tag: 'em' },
      { tag: 'i', getAttrs: (node: HTMLElement) => node.style.fontStyle !== 'normal' && null },
      { style: 'font-style=italic' },
      { style: 'font-style=normal', clearMark: (m) => m.type.name === 'italic' }
    ],
    toDOM(): DOMOutputSpec {
      return ['em', 0]
    }
  },

  /**
   * 删除线
   */
  strikethrough: {
    parseDOM: [
      { tag: 's' },
      { tag: 'del' },
      { tag: 'strike' },
      { style: 'text-decoration=line-through' }
    ],
    toDOM(): DOMOutputSpec {
      return ['s', 0]
    }
  },

  /**
   * 行内代码
   */
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM(): DOMOutputSpec {
      return ['code', 0]
    }
  },

  /**
   * 链接
   */
  link: {
    attrs: {
      href: {},
      title: { default: '' }
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a',
        getAttrs(dom: HTMLElement) {
          return {
            href: dom.getAttribute('href') || '',
            title: dom.getAttribute('title') || ''
          }
        }
      }
    ],
    toDOM(node): DOMOutputSpec {
      const attrs: Record<string, string> = { href: node.attrs.href as string }
      if (node.attrs.title) attrs.title = node.attrs.title as string
      return ['a', attrs, 0]
    }
  }
}

/**
 * Markdown Schema 实例
 */
export const markdownSchema = new Schema({ nodes, marks })

/**
 * 获取标题级别
 */
export function getHeadingLevel(nodeType: string): number | null {
  if (nodeType === 'heading') return 1
  return null
}
