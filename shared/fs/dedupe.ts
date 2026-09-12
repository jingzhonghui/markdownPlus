function normalizePath(value: string): string {
  return value.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
}

/**
 * 移除被其他选中项包含的后代路径，只保留最顶层项。
 * 避免多选（如全选时同时选中文件夹与其展开的子项）导致重复复制或部分剪切失败。
 */
export function dedupeTopLevelPaths(paths: string[]): string[] {
  const normalized = paths.map((raw) => ({ raw, norm: normalizePath(raw) }))
  return normalized
    .filter((item) => !normalized.some((other) => other !== item && item.norm.startsWith(`${other.norm}/`)))
    .map((item) => item.raw)
}
