import type { ToolPolicy } from '../../shared/ai/types'

export function evaluateToolPolicy(policy: ToolPolicy): boolean {
  return policy.approval !== 'never'
}
