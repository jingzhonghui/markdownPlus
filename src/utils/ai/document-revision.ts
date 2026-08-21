/**
 * 文档内容确定性哈希。
 *
 * 用于生成 AI 运行所需的文档内容指纹，从而在执行已批准操作前
 * 检测文档是否已被用户改动（revision + contentHash 双重校验）。
 *
 * 说明：这里选择纯 JS 实现的 FNV-1a 32 位哈希，而非 Node 的 `crypto`，
 * 以避免渲染进程打包时引入 Node 内置模块的兼容问题。FNV-1a 无随机盐，
 * 同一输入跨进程/跨重启始终得到相同结果。
 */

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function hashDocumentContent(content: string): string {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  // 归一化为无符号 32 位，输出 8 位小写十六进制。
  return (hash >>> 0).toString(16).padStart(8, '0')
}
