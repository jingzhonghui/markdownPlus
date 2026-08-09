/**
 * Schema 模块单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  MDX_VERSION,
  createMetadata,
  createMdxDocument,
  createDefaultSettings,
  createDefaultAssets,
  validateMdxJson,
  toMdxJson
} from '../schema'

describe('Schema Module', () => {
  describe('createDefaultSettings', () => {
    it('should create default settings with correct values', () => {
      const settings = createDefaultSettings()

      expect(settings.editor_theme).toBe('default')
      expect(settings.preview_style).toBe('github')
      expect(settings.auto_save).toBe(true)
      expect(settings.auto_save_interval).toBe(30)
    })
  })

  describe('createDefaultAssets', () => {
    it('should create empty assets', () => {
      const assets = createDefaultAssets()

      expect(assets.images).toEqual([])
      expect(assets.attachments).toEqual([])
    })
  })

  describe('createMetadata', () => {
    it('should create metadata with given title', () => {
      const title = 'Test Document'
      const metadata = createMetadata(title)

      expect(metadata.version).toBe(MDX_VERSION)
      expect(metadata.title).toBe(title)
      expect(metadata.encoding).toBe('UTF-8')
      expect(metadata.content_file).toBe('content.md')
      expect(metadata.created_at).toBeDefined()
      expect(metadata.modified_at).toBeDefined()
    })

    it('should create metadata with default title', () => {
      const metadata = createMetadata()

      expect(metadata.title).toBe('未命名文档')
    })

    it('should have valid ISO timestamp', () => {
      const metadata = createMetadata()
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

      expect(metadata.created_at).toMatch(isoRegex)
      expect(metadata.modified_at).toMatch(isoRegex)
    })
  })

  describe('createMdxDocument', () => {
    it('should create document with default values', () => {
      const doc = createMdxDocument()

      expect(doc.metadata.title).toBe('未命名文档')
      expect(doc.content).toBe('')
      expect(doc.assets.images).toEqual([])
      expect(doc.settings.editor_theme).toBe('default')
    })

    it('should create document with custom values', () => {
      const title = 'Custom Title'
      const content = '# Hello World'
      const doc = createMdxDocument(title, content)

      expect(doc.metadata.title).toBe(title)
      expect(doc.content).toBe(content)
    })
  })

  describe('validateMdxJson', () => {
    it('should validate correct mdx.json structure', () => {
      const validJson = {
        version: '1.0',
        created_at: '2026-05-09T10:00:00.000Z',
        modified_at: '2026-05-09T12:00:00.000Z',
        title: 'Test',
        encoding: 'UTF-8',
        content_file: 'content.md',
        assets: {
          images: [],
          attachments: []
        },
        settings: {
          editor_theme: 'default',
          preview_style: 'github'
        }
      }

      const result = validateMdxJson(validJson)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject non-object data', () => {
      const result = validateMdxJson('invalid')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('必须是对象')
    })

    it('should reject missing required fields', () => {
      const result = validateMdxJson({})
      expect(result.valid).toBe(false)
      expect(result.error).toContain('缺少必需字段')
    })

    it('should reject invalid encoding', () => {
      const json = {
        version: '1.0',
        created_at: '2026-05-09T10:00:00.000Z',
        modified_at: '2026-05-09T12:00:00.000Z',
        title: 'Test',
        encoding: 'GBK',
        content_file: 'content.md',
        assets: { images: [] },
        settings: {
          editor_theme: 'default',
          preview_style: 'github'
        }
      }

      const result = validateMdxJson(json)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('encoding')
    })

    it('should reject invalid theme', () => {
      const json = {
        version: '1.0',
        created_at: '2026-05-09T10:00:00.000Z',
        modified_at: '2026-05-09T12:00:00.000Z',
        title: 'Test',
        encoding: 'UTF-8',
        content_file: 'content.md',
        assets: { images: [] },
        settings: {
          editor_theme: 'invalid_theme',
          preview_style: 'github'
        }
      }

      const result = validateMdxJson(json)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('editor_theme')
    })

    it('should validate image assets', () => {
      const json = {
        version: '1.0',
        created_at: '2026-05-09T10:00:00.000Z',
        modified_at: '2026-05-09T12:00:00.000Z',
        title: 'Test',
        encoding: 'UTF-8',
        content_file: 'content.md',
        assets: {
          images: [
            {
              id: 'img_001',
              filename: 'test.png',
              path: 'assets/images/test.png',
              mime_type: 'image/png',
              size: 1024,
              checksum: 'abc123'
            }
          ]
        },
        settings: {
          editor_theme: 'default',
          preview_style: 'github'
        }
      }

      const result = validateMdxJson(json)
      expect(result.valid).toBe(true)
    })

    it('should reject image asset with missing fields', () => {
      const json = {
        version: '1.0',
        created_at: '2026-05-09T10:00:00.000Z',
        modified_at: '2026-05-09T12:00:00.000Z',
        title: 'Test',
        encoding: 'UTF-8',
        content_file: 'content.md',
        assets: {
          images: [{ id: 'img_001' }] // missing fields
        },
        settings: {
          editor_theme: 'default',
          preview_style: 'github'
        }
      }

      const result = validateMdxJson(json)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('缺少字段')
    })
  })

  describe('toMdxJson', () => {
    it('should convert MdxDocument to mdx.json format', () => {
      const doc = createMdxDocument('Test', '# Content')
      doc.metadata.author = 'Test Author'

      const json = toMdxJson(doc)

      expect(json.version).toBe(doc.metadata.version)
      expect(json.title).toBe(doc.metadata.title)
      expect(json.author).toBe(doc.metadata.author)
      expect(json.encoding).toBe(doc.metadata.encoding)
      expect(json.content_file).toBe(doc.metadata.content_file)
      expect(json.assets).toBe(doc.assets)
      expect(json.settings).toBe(doc.settings)
      expect(json.modified_at).toBeDefined()
    })

    it('should update modified_at timestamp', () => {
      const doc = createMdxDocument('Test')
      const originalModifiedAt = doc.metadata.modified_at

      // 等待一小段时间确保时间戳不同
      const start = Date.now()
      while (Date.now() - start < 10) {
        // 延迟 10ms
      }

      const json = toMdxJson(doc)
      expect(json.modified_at).not.toBe(originalModifiedAt)
    })
  })
})
