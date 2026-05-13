import MarkdownIt from 'markdown-it'
import type { MdxImageAsset } from '../types/mdx'

// Markdown-it 实例
let md: MarkdownIt | null = null

/**
 * 获取 Markdown-it 实例（单例）
 */
export function getMarkdownIt(): MarkdownIt {
  if (!md) {
    md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true,
      highlight: (str: string, lang: string) => {
        // 代码高亮由 Shiki 处理，这里只返回原始代码
        return `<pre class="shiki"><code class="language-${lang || 'text'}">${escapeHtml(str)}</code></pre>`
      }
    })

    // 添加 GFM 支持
    md.enable(['table', 'strikethrough'])

    // 自定义任务列表渲染
    md.use((markdownIt: MarkdownIt) => {
      const defaultRender = markdownIt.renderer.rules.list_item_open || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
      }

      markdownIt.renderer.rules.list_item_open = function(tokens, idx, options, env, self) {
        const token = tokens[idx]
        const contentToken = tokens[idx + 2]

        if (contentToken && contentToken.content) {
          const match = contentToken.content.match(/^\[(x| )\]\s+(.*)$/i)
          if (match) {
            const checked = match[1].toLowerCase() === 'x'
            const text = match[2]
            contentToken.content = text
            token.attrSet('class', 'task-list-item')
            token.attrSet('data-checked', checked ? 'true' : 'false')
          }
        }

        return defaultRender(tokens, idx, options, env, self)
      }
    })
  }

  return md
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 渲染 Markdown 为 HTML
 * @param content Markdown 内容
 * @param imageAssets 图片资源列表，用于替换路径
 * @returns HTML 字符串
 */
export function renderMarkdown(content: string, imageAssets: MdxImageAsset[] = []): string {
  const markdown = getMarkdownIt()

  // 处理图片路径替换
  let processedContent = content
  imageAssets.forEach(asset => {
    // 替换图片引用路径
    const escapedPath = asset.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedPath}\\)`, 'g')
    processedContent = processedContent.replace(regex, (match, alt) => {
      // 使用 data URL 或 blob URL（这里先用路径占位）
      return `![${alt}](${asset.path})`
    })
  })

  return markdown.render(processedContent)
}

/**
 * 提取 Markdown 中的标题结构（用于大纲视图）
 */
export interface HeadingItem {
  level: number
  text: string
  line: number
}

/**
 * 提取 Markdown 标题
 * @param content Markdown 内容
 * @returns 标题列表
 */
export function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,4})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1
      })
    }
  })

  return headings
}

/**
 * 提取第一张图片作为封面
 */
export function extractFirstImage(content: string): string | null {
  const match = content.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  return match ? match[2] : null
}

/**
 * 统计 Markdown 字数（不含标记符号）
 */
export function countWords(content: string): number {
  // 移除 Markdown 标记
  const plainText = content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/>\s+/g, '')
    .replace(/[-*]\s+/g, '')
    .replace(/\d+\.\s+/g, '')
    .replace(/---+/g, '')
    .replace(/\s+/g, '')

  return plainText.length
}

/**
 * 规范化图片路径
 * @param src 原始路径
 * @returns 规范化后的路径
 */
export function normalizeImagePath(src: string): string {
  // 移除开头的 ./ 或 ../
  return src.replace(/^(\.\.?\/)+/, '')
}

/**
 * 检查是否是外部链接
 */
export function isExternalLink(url: string): boolean {
  return /^https?:\/\//.test(url)
}

/**
 * Markdown 代码块语言映射
 */
export const CODE_LANGUAGES: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'go': 'go',
  'rs': 'rust',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'cs': 'csharp',
  'php': 'php',
  'swift': 'swift',
  'kt': 'kotlin',
  'scala': 'scala',
  'r': 'r',
  'sql': 'sql',
  'sh': 'bash',
  'bash': 'bash',
  'zsh': 'bash',
  'fish': 'bash',
  'ps1': 'powershell',
  'powershell': 'powershell',
  'cmd': 'batch',
  'bat': 'batch',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'ini': 'ini',
  'cfg': 'ini',
  'json': 'json',
  'xml': 'xml',
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',
  'styl': 'stylus',
  'vue': 'vue',
  'svelte': 'svelte',
  'astro': 'astro',
  'md': 'markdown',
  'mdx': 'markdown',
  'tex': 'latex',
  'latex': 'latex',
  'dockerfile': 'dockerfile',
  'docker': 'dockerfile',
  'nginx': 'nginx',
  'graphql': 'graphql',
  'gql': 'graphql',
  'regex': 'regex',
  'vim': 'vim',
  'lua': 'lua',
  'perl': 'perl',
  'pl': 'perl',
  'haskell': 'haskell',
  'hs': 'haskell',
  'clojure': 'clojure',
  'cljs': 'clojure',
  'erlang': 'erlang',
  'erl': 'erlang',
  'elixir': 'elixir',
  'ex': 'elixir',
  'exs': 'elixir',
  'dart': 'dart',
  'flutter': 'dart'
}

/**
 * 获取代码块的语言标识符
 */
export function getCodeLanguage(lang: string): string {
  return CODE_LANGUAGES[lang.toLowerCase()] || lang || 'text'
}
