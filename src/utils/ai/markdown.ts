import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
})

markdown.enable(['table', 'strikethrough'])
markdown.validateLink = (url: string): boolean => /^https?:\/\//i.test(url)

// No controlled external-open API exists, so AI-authored URLs remain inert text.
markdown.renderer.rules.link_open = () => ''
markdown.renderer.rules.link_close = () => ''

export function renderAiMarkdown(content: string): string {
  return markdown.render(content)
}
