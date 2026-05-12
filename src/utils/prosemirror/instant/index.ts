/**
 * 即时渲染模式 - 插件入口
 * 组合所有即时渲染相关的插件
 */
import { Plugin } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import { createInstantRenderPlugin } from './state'
import { createInstantDecorationsPlugin } from './decorations'

/**
 * 创建即时渲染模式的所有插件
 */
export function createInstantPlugins(_schema: Schema): Plugin[] {
  return [
    createInstantRenderPlugin(),
    createInstantDecorationsPlugin()
  ]
}

// 重新导出所有子模块
export * from './state'
export * from './decorations'
export * from './nodeviews'
