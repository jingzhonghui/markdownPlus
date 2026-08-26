import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { UpdateInfo, UpdateStatus } from '../types/update'

/**
 * 更新状态管理 Store
 *
 * 通过 preload 暴露的 electronAPI 与主进程 electron-updater 交互。
 * 仅检测更新、提示新版本；不自动下载，由用户点击按钮前往 GitHub 发布页手动下载。
 * 主进程事件（available/not-available/error）驱动状态机。
 */
export const useUpdateStore = defineStore('update', () => {
  // State
  const status = ref<UpdateStatus>('idle')
  const info = ref<UpdateInfo | null>(null)
  const errorMessage = ref('')
  const dialogOpen = ref(false)

  let initialized = false
  let disposers: Array<() => void> = []

  function toInfo(payload: UpdateInfo): UpdateInfo {
    return {
      version: payload.version,
      releaseNotes: payload.releaseNotes,
      releaseDate: payload.releaseDate
    }
  }

  /**
   * 注册主进程事件监听（应用启动时调用一次）
   */
  function init(): void {
    if (initialized) return
    const api = window.electronAPI
    if (!api) return
    initialized = true

    disposers = [
      api.onUpdateAvailable((payload) => {
        info.value = toInfo(payload)
        errorMessage.value = ''
        status.value = 'available'
        dialogOpen.value = true
      }),
      api.onUpdateNotAvailable(() => {
        status.value = 'not-available'
      }),
      api.onUpdateError((payload) => {
        errorMessage.value = payload.message
        status.value = 'error'
      })
    ]
  }

  /**
   * 检查更新。manual 为 true 时由调用方（如菜单）负责展示结果提示。
   * 返回检查完成后的状态，便于调用方判断是否需要提示。
   */
  async function check(): Promise<UpdateStatus> {
    const api = window.electronAPI
    if (!api) {
      errorMessage.value = '当前环境不支持自动更新'
      status.value = 'error'
      return 'error'
    }
    status.value = 'checking'
    errorMessage.value = ''
    const result = await api.checkForUpdates()
    if (!result.success) {
      errorMessage.value = result.error ?? '检查更新失败'
      status.value = 'error'
      return 'error'
    }
    return status.value
  }

  /**
   * 在系统浏览器中打开 GitHub 发布页（供用户手动下载安装包）
   */
  async function openReleases(): Promise<void> {
    const api = window.electronAPI
    if (!api) {
      errorMessage.value = '当前环境不支持自动更新'
      status.value = 'error'
      return
    }
    const result = await api.openReleasesPage()
    if (!result.success) {
      errorMessage.value = result.error ?? '打开发布页失败'
      status.value = 'error'
      dialogOpen.value = true
      return
    }
    dialogOpen.value = false
    status.value = 'idle'
  }

  /**
   * 关闭更新弹窗（稍后提醒）
   */
  function dismiss(): void {
    dialogOpen.value = false
    if (status.value === 'available' || status.value === 'error') {
      status.value = 'idle'
      errorMessage.value = ''
    }
  }

  /**
   * 反注册事件监听（应用卸载时调用）
   */
  function dispose(): void {
    disposers.forEach((d) => d())
    disposers = []
    initialized = false
  }

  return {
    status,
    info,
    errorMessage,
    dialogOpen,
    init,
    check,
    openReleases,
    dismiss,
    dispose
  }
})
