import { describe, expect, it } from 'vitest'
import { findHeadingForAnchor } from '../anchors'

describe('ProseMirror article anchors', () => {
  it('matches a fragment with the heading slug', () => {
    const headings = [
      { id: '', textContent: '第一章 介绍' },
      { id: '', textContent: '第二章 安装指南' }
    ] as unknown as HTMLElement[]

    expect(findHeadingForAnchor(headings, '#第二章-安装指南')).toBe(headings[1])
  })

  it('prefers an explicit heading id', () => {
    const heading = { id: 'custom-target', textContent: '其他标题' } as unknown as HTMLElement
    expect(findHeadingForAnchor([heading], '#custom-target')).toBe(heading)
  })
})
