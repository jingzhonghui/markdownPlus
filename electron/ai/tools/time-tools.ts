import { z } from 'zod'
import { defineTool, type ToolDefinition } from '../tool-registry'

export interface TimeToolRegistry {
  getCurrentDatetime: ToolDefinition<Record<string, never>, unknown>
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function createTimeTools(): TimeToolRegistry {
  const getCurrentDatetime = defineTool<Record<string, never>, unknown>({
    name: 'get_current_datetime',
    description:
      '获取当前的日期和时间（含年、月、日、星期、时分秒和时区）。当用户提到"今天""昨天""明天""前天""现在几点"等相对时间词汇，需要推断具体日期时，必须先调用本工具获取基准时间。',
    inputSchema: z.object({}),
    policy: {
      effect: 'read',
      approval: 'never',
      riskLevel: 'low',
      supportsRememberDecision: false
    },
    execution: 'main',
    execute: async () => {
      const now = new Date()
      return {
        iso: now.toISOString(),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        weekday: WEEKDAYS[now.getDay()],
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    }
  })

  return { getCurrentDatetime }
}
