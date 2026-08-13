import { ref, type ComputedRef, type Ref } from 'vue'
import type { MdxImageAsset } from '../../types/mdx'
import type { TabInfo } from './types'

export interface AssetsDeps {
  activeTab: ComputedRef<TabInfo | null>
  stateVersion: Ref<number>
  scheduleRecoverySnapshot: () => void
}

export interface ImageCompressSettings {
  enabled: boolean
  quality: number
  maxWidth: number
  maxHeight: number
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 图片 / 附件资源管理
 */
export function useAssets(deps: AssetsDeps) {
  const { activeTab, stateVersion } = deps

  const imageCompressSettings = ref<ImageCompressSettings>({
    enabled: true,
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1080
  })

  // 共享图片缓存（跨预览面板和 IR 编辑器）
  const sharedImageCache = new Map<string, string>()

  function setImageCompressSettings(settings: Partial<ImageCompressSettings>): void {
    imageCompressSettings.value = { ...imageCompressSettings.value, ...settings }
  }

  function getCachedImage(key: string): string | undefined {
    return sharedImageCache.get(key)
  }

  function setCachedImage(key: string, dataUrl: string): void {
    sharedImageCache.set(key, dataUrl)
  }

  function clearImageCache(): void {
    sharedImageCache.clear()
  }

  async function addImage(
    file: File,
    options?: { compress?: boolean; quality?: number; maxWidth?: number; maxHeight?: number }
  ): Promise<{ success: boolean; path?: string; asset?: MdxImageAsset; error?: string }> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) {
        return { success: false, error: '无法添加图片' }
      }

      const arrayBuffer = await file.arrayBuffer()

      const compressOptions = {
        compress: options?.compress ?? imageCompressSettings.value.enabled,
        quality: options?.quality ?? imageCompressSettings.value.quality,
        maxWidth: options?.maxWidth ?? imageCompressSettings.value.maxWidth,
        maxHeight: options?.maxHeight ?? imageCompressSettings.value.maxHeight
      }

      const result = await window.electronAPI.addImage(
        file.name,
        file.type,
        arrayBuffer,
        compressOptions,
        tab.fileInfo?.path || undefined
      )

      if (result.success && result.data) {
        const { asset, relativePath } = result.data as { asset: MdxImageAsset; relativePath: string }
        if (tab.fileInfo?.format !== 'markdown') tab.document.assets.images.push(asset)
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        deps.scheduleRecoverySnapshot()
        return { success: true, path: relativePath, asset }
      } else {
        return { success: false, error: result.error || '添加图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加图片失败' }
    }
  }

  async function getImage(
    imagePath: string,
    filePath?: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      if (!window.electronAPI) {
        return { success: false, error: 'Electron API 不可用' }
      }

      const imageFilePath = filePath ?? activeTab.value?.fileInfo?.path ?? undefined
      const result = await window.electronAPI.getImage(imagePath, imageFilePath)
      if (result.success && result.data) {
        let byteArray: Uint8Array
        const bufferData = result.data.buffer as unknown

        if (bufferData instanceof Uint8Array) {
          byteArray = bufferData
        } else if (Array.isArray(bufferData)) {
          byteArray = new Uint8Array(bufferData)
        } else if (bufferData && typeof bufferData === 'object') {
          const bufferObj = bufferData as { type?: string; data?: number[] }
          if (bufferObj.data && Array.isArray(bufferObj.data)) {
            byteArray = new Uint8Array(bufferObj.data)
          } else {
            return { success: false, error: '图片数据格式不正确' }
          }
        } else {
          return { success: false, error: '图片数据格式不正确' }
        }

        let binary = ''
        for (let i = 0; i < byteArray.byteLength; i++) {
          binary += String.fromCharCode(byteArray[i])
        }
        const base64 = btoa(binary)
        const mimeType = result.data.mimeType || 'image/png'
        const dataUrl = `data:${mimeType};base64,${base64}`
        return { success: true, data: dataUrl }
      } else {
        return { success: false, error: result.error || '获取图片失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '获取图片失败' }
    }
  }

  async function removeAsset(assetId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) {
        return { success: false, error: '无法删除资源' }
      }

      const result = await window.electronAPI.removeAsset(assetId, tab.fileInfo?.path)
      if (result.success) {
        const imageIndex = tab.document.assets.images.findIndex((img) => img.id === assetId)
        if (imageIndex > -1) {
          tab.document.assets.images.splice(imageIndex, 1)
        }
        if (tab.document.assets.attachments) {
          const attIndex = tab.document.assets.attachments.findIndex((att) => att.id === assetId)
          if (attIndex > -1) {
            tab.document.assets.attachments.splice(attIndex, 1)
          }
        }
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        deps.scheduleRecoverySnapshot()
        return { success: true }
      } else {
        return { success: false, error: result.error || '删除资源失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '删除资源失败' }
    }
  }

  async function refreshAssets(): Promise<boolean> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) return false

      const result = await window.electronAPI.listAssets(tab.fileInfo?.path)
      if (result.success && result.data) {
        tab.document.assets.images = result.data.images
        tab.document.assets.attachments = result.data.attachments
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function addAttachment(
    file: File
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const tab = activeTab.value
      if (!window.electronAPI || !tab?.document) {
        return { success: false, error: '无法添加附件' }
      }

      const arrayBuffer = await file.arrayBuffer()
      const result = await window.electronAPI.addAttachment(file.name, file.type, arrayBuffer, tab.fileInfo?.path)

      if (result.success && result.data) {
        if (tab.fileInfo) {
          tab.fileInfo.modified = true
        }
        deps.scheduleRecoverySnapshot()
        const { relativePath } = result.data as { relativePath: string }
        return { success: true, path: relativePath }
      } else {
        return { success: false, error: result.error || '添加附件失败' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '添加附件失败' }
    }
  }

  function detectOrphanAssets(): Array<{
    id: string
    filename: string
    type: 'image' | 'attachment'
  }> {
    const tab = activeTab.value
    if (!tab?.document) return []

    const content = tab.content
    const orphans: Array<{ id: string; filename: string; type: 'image' | 'attachment' }> = []

    for (const image of tab.document.assets.images) {
      const imagePattern = new RegExp(`!\\[.*?\\]\\(${escapeRegExp(image.path)}\\)`, 'i')
      if (!imagePattern.test(content)) {
        orphans.push({ id: image.id, filename: image.filename, type: 'image' })
      }
    }

    if (tab.document.assets.attachments) {
      for (const attachment of tab.document.assets.attachments) {
        const linkPattern = new RegExp(`\\[.*?\\]\\(${escapeRegExp(attachment.path)}\\)`, 'i')
        if (!linkPattern.test(content)) {
          orphans.push({ id: attachment.id, filename: attachment.filename, type: 'attachment' })
        }
      }
    }

    return orphans
  }

  async function cleanupOrphanAssets(): Promise<{
    success: boolean
    removed: number
    error?: string
  }> {
    const orphans = detectOrphanAssets()
    let removed = 0

    for (const orphan of orphans) {
      const result = await removeAsset(orphan.id)
      if (result.success) removed++
    }

    return { success: true, removed }
  }

  async function renameImage(
    assetId: string,
    newFilename: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const tab = activeTab.value
      if (!tab?.document) {
        return { success: false, error: '没有打开的文档' }
      }

      const image = tab.document.assets.images.find((img) => img.id === assetId)
      if (!image) {
        return { success: false, error: '图片不存在' }
      }

      const oldPath = image.path
      const newPath = `assets/images/${newFilename}`

      image.filename = newFilename
      image.path = newPath

      const oldPattern = new RegExp(`(!\\[.*?\\]\\()${escapeRegExp(oldPath)}(\\))`, 'g')
      tab.content = tab.content.replace(oldPattern, `$1${newPath}$2`)
      tab.document.content = tab.content

      if (tab.fileInfo) {
        tab.fileInfo.modified = true
      }
      stateVersion.value++
      deps.scheduleRecoverySnapshot()

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '重命名失败' }
    }
  }

  return {
    imageCompressSettings,
    setImageCompressSettings,
    getCachedImage,
    setCachedImage,
    clearImageCache,
    addImage,
    getImage,
    removeAsset,
    refreshAssets,
    addAttachment,
    detectOrphanAssets,
    cleanupOrphanAssets,
    renameImage
  }
}
