import { describe, expect, it } from 'vitest'
import { getFileIconName, getFileIconType } from '../file-icons'

describe('getFileIconType', () => {
  it.each([
    ['notes.mdx', false, 'markdown'],
    ['README.MD', false, 'markdown'],
    ['draft.markdown', false, 'markdown'],
    ['document.pdf', false, 'pdf'],
    ['photo.webp', false, 'image'],
    ['archive.7z', false, 'archive'],
    ['config.yaml', false, 'data'],
    ['component.vue', false, 'code'],
    ['notes.txt', false, 'text'],
    ['unknown.bin', false, 'file'],
    ['assets', true, 'folder']
  ])('classifies %s as %s', (name, isDirectory, expected) => {
    expect(getFileIconType(name, isDirectory)).toBe(expected)
  })
})

describe('getFileIconName', () => {
  it('uses a dedicated Tabler PDF icon', () => {
    expect(getFileIconName('document.pdf', false)).toBe('IconFileTypePdf')
  })

  it('uses a Tabler folder icon for directories', () => {
    expect(getFileIconName('assets', true)).toBe('IconFolder')
  })
})
