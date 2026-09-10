import { describe, expect, it } from 'vitest'
import { compareEntryNames, compareFolderEntries } from '../folder-sort'

describe('folder-sort', () => {
  describe('compareEntryNames', () => {
    it('sorts numbers by numeric value', () => {
      expect(compareEntryNames('file2', 'file10')).toBeLessThan(0)
      expect(compareEntryNames('file10', 'file2')).toBeGreaterThan(0)
    })

    it('ignores letter case', () => {
      expect(compareEntryNames('Apple', 'apple')).toBe(0)
      expect(compareEntryNames('apple', 'Banana')).toBeLessThan(0)
    })

    it('sorts Chinese numerals by semantic value', () => {
      expect(compareEntryNames('一季度', '二季度')).toBeLessThan(0)
      expect(compareEntryNames('二季度', '三季度')).toBeLessThan(0)
      expect(compareEntryNames('一季度', '三季度')).toBeLessThan(0)
    })
  })

  describe('compareFolderEntries', () => {
    it('puts folders before files regardless of name', () => {
      const folder = { name: 'z-folder', isDirectory: true }
      const file = { name: 'a-file', isDirectory: false }
      expect(compareFolderEntries(folder, file)).toBeLessThan(0)
      expect(compareFolderEntries(file, folder)).toBeGreaterThan(0)
    })

    it('sorts same type by natural name order', () => {
      const a = { name: 'file2', isDirectory: false }
      const b = { name: 'file10', isDirectory: false }
      expect(compareFolderEntries(a, b)).toBeLessThan(0)
    })

    it('sorts Chinese folders in semantic order: 一 < 二 < 三', () => {
      const one = { name: '一季度', isDirectory: true }
      const two = { name: '二季度', isDirectory: true }
      const three = { name: '三季度', isDirectory: true }
      expect(compareFolderEntries(one, two)).toBeLessThan(0)
      expect(compareFolderEntries(two, three)).toBeLessThan(0)
      expect(compareFolderEntries(one, three)).toBeLessThan(0)
    })
  })
})