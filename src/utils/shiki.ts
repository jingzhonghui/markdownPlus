/**
 * 即时渲染模式 - Shiki 高亮服务
 * 单例模式，避免重复创建 highlighter
 */
import { createHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | null = null
let isInitializing = false
let initPromise: Promise<Highlighter> | null = null

/**
 * 获取 Shiki 高亮器（单例）
 */
export async function getShikiHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter
  if (initPromise) return initPromise

  isInitializing = true
  initPromise = createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: [
      'javascript', 'typescript', 'python', 'go', 'rust', 'java',
      'c', 'cpp', 'csharp', 'php', 'ruby', 'swift', 'kotlin',
      'html', 'css', 'scss', 'json', 'yaml', 'xml', 'sql',
      'bash', 'powershell', 'dockerfile', 'markdown', 'vue',
      'svelte', 'astro', 'lua', 'perl', 'haskell', 'r', 'dart',
      'text', 'plain'
    ]
  }).then((hl) => {
    highlighter = hl
    isInitializing = false
    return hl
  }).catch((err) => {
    isInitializing = false
    initPromise = null
    throw err
  })

  return initPromise
}

/**
 * 检查是否正在初始化
 */
export function isShikiInitializing(): boolean {
  return isInitializing
}

/**
 * 高亮代码
 */
export async function highlightCode(
  code: string,
  lang: string,
  isDark: boolean
): Promise<string> {
  try {
    const hl = await getShikiHighlighter()
    const theme = isDark ? 'github-dark' : 'github-light'

    return hl.codeToHtml(code, {
      lang: lang || 'text',
      theme
    })
  } catch {
    // 高亮失败，返回原始代码
    return `<pre><code>${escapeHtml(code)}</code></pre>`
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
