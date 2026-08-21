# AI 会话记录实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Markdown+ 的 AI 助手新增多会话历史记录：会话持久化到工作区 `.markdownPlus/conversations/`（无工作区时用 userData），支持新建、切换、右键重命名/删除，并用 LLM 自动生成首条消息后的会话标题。

**Architecture:** 会话真相源在渲染进程 `aiStore`；主进程新增无状态 `ConversationStore`（文件 I/O）与标题生成 `conversation-title`；通过新增 IPC 通道完成列表/加载/保存/删除/标题生成。`AiPanel` 改为左侧会话边栏 + 右侧消息区。

**Tech Stack:** Electron + Vue 3 + Pinia + Vite + Vitest + Vercel AI SDK（已有）。新增代码集中在 `electron/ai/`、`src/stores/ai.ts`、`src/components/ai/`。

**Spec:** `docs/superpowers/specs/2026-08-20-ai-conversation-records-design.md`

## Global Constraints

- 会话文件位置：有工作区 `<工作区根>/.markdownPlus/conversations/conv_<id>.json`；无工作区 `<userData>/conversations/conv_<id>.json`（`app.getPath('userData')`）。
- 会话 id 格式 `conv_<ts36>_<rand36>`，白名单校验 `/^conv_[A-Za-z0-9_]+$/`。
- 会话文件结构 `{ version: 1, id, title, createdAt, updatedAt, messageCount, messages, toolSummaries }`，见 spec 3.2。
- 不持久化工具结果正文、文档快照、来源内容、审批记录。
- 标题生成仅当 `titleSource === 'truncated'` 时触发；手动重命名后 `titleSource = 'custom'` 不再覆盖。
- 移除 `aiStore.clearConversation` 与 `AiPanel.vue` 的"清空"按钮。
- 所有 IPC 返回 `{ success: boolean, data?, error? }`。
- 本仓库统一中文用户界面文案；代码注释保持仓库现状（英文说明为主）。

---

### Task 1: 会话数据类型

**Files:**
- Modify: `shared/ai/types.ts`

**Interfaces:**
- Consumes: 无（现有 `AiConversationMessage`）
- Produces: `ConversationToolSummary`, `ConversationMeta`, `ConversationRecord`；`AiConversationMessage` 增加 `createdAt?: number`

- [ ] **Step 1: 扩展 `AiConversationMessage` 并新增会话类型**

在 `shared/ai/types.ts` 中：

```ts
export interface AiConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCallId?: string
  toolName?: string
  createdAt?: number
}

export interface ConversationToolSummary {
  toolCallId: string
  toolName: string
  status: string
}

export interface ConversationMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ConversationRecord extends ConversationMeta {
  version: 1
  messages: AiConversationMessage[]
  toolSummaries: ConversationToolSummary[]
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck:node`
Expected: PASS（无新增类型错误）

- [ ] **Step 3: Commit**

```bash
git add shared/ai/types.ts
git commit -m "feat(ai): 会话记录类型定义"
```

---

### Task 2: ConversationStore 存储层

**Files:**
- Create: `electron/ai/conversation-store.ts`
- Test: `electron/ai/__tests__/conversation-store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ConversationMeta`, `ConversationRecord`
- Produces:
  - `class ConversationStore`
    - `resolveConversationsDir(root: string | null): string`
    - `listConversations(root: string | null): ConversationMeta[]`
    - `loadConversation(root: string | null, id: string): ConversationRecord`
    - `saveConversation(root: string | null, record: ConversationRecord): void`
    - `deleteConversation(root: string | null, id: string): void`

- [ ] **Step 1: 写失败测试**

Create `electron/ai/__tests__/conversation-store.test.ts`:

```ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-conv-'))
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-ws-'))

vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

import { ConversationStore } from '../conversation-store'
import type { ConversationRecord } from '../../../shared/ai/types'

function makeRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    version: 1,
    id: 'conv_test',
    title: '测试会话',
    createdAt: 1000,
    updatedAt: 2000,
    messageCount: 1,
    messages: [{ id: 'm1', role: 'user', content: '你好', createdAt: 1000 }],
    toolSummaries: [],
    ...overrides
  }
}

describe('ConversationStore', () => {
  const store = new ConversationStore()

  beforeEach(() => {
    fs.rmSync(path.join(userData, 'conversations'), { recursive: true, force: true })
    fs.rmSync(path.join(workspace, '.markdownPlus'), { recursive: true, force: true })
  })

  it('resolves the userData directory when root is null', () => {
    expect(store.resolveConversationsDir(null)).toBe(path.join(userData, 'conversations'))
  })

  it('resolves the workspace directory when root is given', () => {
    expect(store.resolveConversationsDir(workspace)).toBe(
      path.join(workspace, '.markdownPlus', 'conversations')
    )
  })

  it('lists conversations sorted by updatedAt descending', () => {
    store.saveConversation(null, makeRecord({ id: 'conv_a', updatedAt: 1000, title: 'A' }))
    store.saveConversation(null, makeRecord({ id: 'conv_b', updatedAt: 3000, title: 'B' }))

    const list = store.listConversations(null)
    expect(list.map((c) => c.id)).toEqual(['conv_b', 'conv_a'])
    expect(list[0]).toMatchObject({ id: 'conv_b', title: 'B', messageCount: 1 })
  })

  it('recomputes messageCount from messages on save', () => {
    store.saveConversation(null, makeRecord({ messageCount: 99 }))
    const loaded = store.loadConversation(null, 'conv_test')
    expect(loaded.messageCount).toBe(1)
  })

  it('loads a saved conversation', () => {
    store.saveConversation(null, makeRecord())
    const loaded = store.loadConversation(null, 'conv_test')
    expect(loaded).toMatchObject({ id: 'conv_test', title: '测试会话' })
    expect(loaded.messages[0].content).toBe('你好')
  })

  it('skips corrupt files in listConversations', () => {
    const dir = store.resolveConversationsDir(null)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'conv_bad.json'), 'not json', 'utf8')
    store.saveConversation(null, makeRecord({ id: 'conv_good' }))

    const list = store.listConversations(null)
    expect(list.map((c) => c.id)).toEqual(['conv_good'])
  })

  it('returns an empty list when the directory is missing', () => {
    expect(store.listConversations(null)).toEqual([])
  })

  it('loadConversation throws for a missing or invalid id', () => {
    expect(() => store.loadConversation(null, 'conv_missing')).toThrow()
    expect(() => store.loadConversation(null, '../../evil')).toThrow()
  })

  it('deleteConversation removes the file', () => {
    store.saveConversation(null, makeRecord())
    store.deleteConversation(null, 'conv_test')
    expect(store.listConversations(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run electron/ai/__tests__/conversation-store.test.ts`
Expected: FAIL（`ConversationStore` 未定义 / 找不到模块）。若报 `vi` 未定义，在文件顶部 import 补上 `vi`。

- [ ] **Step 3: 实现 ConversationStore**

Create `electron/ai/conversation-store.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { ConversationMeta, ConversationRecord } from '../../shared/ai/types'

const CONVERSATIONS_SUBDIR = path.join('.markdownPlus', 'conversations')
const CONVERSATION_ID_PATTERN = /^conv_[A-Za-z0-9_]+$/

export class ConversationStore {
  resolveConversationsDir(root: string | null): string {
    if (root && root.length > 0) {
      return path.join(root, CONVERSATIONS_SUBDIR)
    }
    return path.join(app.getPath('userData'), 'conversations')
  }

  listConversations(root: string | null): ConversationMeta[] {
    const dir = this.resolveConversationsDir(root)
    if (!fs.existsSync(dir)) return []
    const metas: ConversationMeta[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.replace(/\.json$/, '')
      if (!CONVERSATION_ID_PATTERN.test(id)) continue
      try {
        const record = this.readRecord(dir, entry.name)
        metas.push(this.toMeta(record))
      } catch {
        // 损坏文件跳过
      }
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt)
    return metas
  }

  loadConversation(root: string | null, id: string): ConversationRecord {
    this.assertValidId(id)
    const dir = this.resolveConversationsDir(root)
    return this.readRecord(dir, `${id}.json`)
  }

  saveConversation(root: string | null, record: ConversationRecord): void {
    this.assertValidId(record.id)
    const dir = this.resolveConversationsDir(root)
    fs.mkdirSync(dir, { recursive: true })
    const normalized: ConversationRecord = {
      ...record,
      version: 1,
      messageCount: record.messages.length,
      updatedAt: record.updatedAt || Date.now()
    }
    const target = path.join(dir, `${record.id}.json`)
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf8')
    fs.renameSync(tmp, target)
  }

  deleteConversation(root: string | null, id: string): void {
    this.assertValidId(id)
    const target = path.join(this.resolveConversationsDir(root), `${id}.json`)
    fs.rmSync(target, { force: true })
  }

  private assertValidId(id: string): void {
    if (!CONVERSATION_ID_PATTERN.test(id)) {
      throw new Error('无效的会话 ID')
    }
  }

  private readRecord(dir: string, filename: string): ConversationRecord {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8')) as ConversationRecord
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) {
      throw new Error('会话文件格式无效')
    }
    return parsed
  }

  private toMeta(record: ConversationRecord): ConversationMeta {
    return {
      id: record.id,
      title: record.title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      messageCount: record.messages.length
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run electron/ai/__tests__/conversation-store.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add electron/ai/conversation-store.ts electron/ai/__tests__/conversation-store.test.ts
git commit -m "feat(ai): ConversationStore 会话文件存储"
```

---

### Task 3: 标题生成（provider.summarize + conversation-title）

**Files:**
- Modify: `electron/ai/provider.ts`
- Create: `electron/ai/conversation-title.ts`
- Test: `electron/ai/__tests__/conversation-title.test.ts`
- Modify: `electron/ai/__tests__/provider.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `AiRuntimeConfig`
- Produces:
  - `LlmProvider.summarize(config: AiRuntimeConfig, text: string): Promise<string>`（接口新增方法）
  - `generateConversationTitle(provider: LlmProvider, config: AiRuntimeConfig, text: string): Promise<string | null>`

- [ ] **Step 1: 扩展 provider 接口与实现**

在 `electron/ai/provider.ts`：

1) 接口新增方法（约 48-51 行附近）：

```ts
export interface LlmProvider {
  run(input: LlmRunInput): AsyncIterable<AiProviderEvent>
  testConnection(config: AiRuntimeConfig): Promise<AiConnectionTestResult>
  summarize(config: AiRuntimeConfig, text: string): Promise<string>
}
```

2) 在 `VercelAiSdkProvider` 类内新增方法（`testConnection` 之后）：

```ts
async summarize(config: AiRuntimeConfig, text: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new ProviderTimeoutError('标题生成超时')),
    this.totalTimeoutMs
  )
  try {
    const model = this.createModel(config)
    const result = await generateText({
      model,
      system: '你是标题生成助手。请用不超过 20 个字概括用户消息的主题，只输出标题本身，不要引号或多余标点。',
      prompt: text,
      temperature: 0.3,
      maxOutputTokens: 64,
      abortSignal: controller.signal
    })
    return result.text.trim()
  } catch (error) {
    throw this.toProviderError(error)
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 2: 为 provider.summarize 写测试**

在 `electron/ai/__tests__/provider.test.ts` 的 `describe('VercelAiSdkProvider')` 内新增：

```ts
describe('summarize', () => {
  it('returns the trimmed text of a single chat completion', async () => {
    server = new MockOpenAiServer()
    const baseUrl = await server.start({
      body: JSON.stringify({
        id: 'chatcmpl-1',
        model: 'test-model',
        created: 1,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '  文档主题  ' },
          finish_reason: 'stop'
        }]
      })
    })
    const provider = new VercelAiSdkProvider()

    const title = await provider.summarize(config(baseUrl), '请总结这份文档')

    expect(title).toBe('文档主题')
    expect(server.requestCount).toBe(1)
  })

  it('maps provider errors through AiProviderError', async () => {
    server = new MockOpenAiServer()
    const baseUrl = await server.start({ status: 401 })
    const provider = new VercelAiSdkProvider()

    await expect(provider.summarize(config(baseUrl), 'x')).rejects.toMatchObject({
      code: 'AUTH_FAILED'
    })
  })
})
```

- [ ] **Step 3: 运行 provider 测试确认通过**

Run: `npx vitest run electron/ai/__tests__/provider.test.ts`
Expected: PASS（含既有用例与新增用例）

- [ ] **Step 4: 写 conversation-title 失败测试**

Create `electron/ai/__tests__/conversation-title.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { generateConversationTitle } from '../conversation-title'
import type { LlmProvider } from '../provider'
import type { AiRuntimeConfig } from '../../../shared/ai/types'

const config: AiRuntimeConfig = {
  baseUrl: 'https://api.example.com/v1',
  model: 'demo',
  apiKey: 'secret',
  temperature: 0.7
}

function makeProvider(summarize: (text: string) => Promise<string>): LlmProvider {
  return {
    run: vi.fn() as never,
    testConnection: vi.fn() as never,
    summarize: vi.fn(summarize)
  } as unknown as LlmProvider
}

describe('generateConversationTitle', () => {
  it('returns the provider title', async () => {
    const title = await generateConversationTitle(
      makeProvider(async () => '文档总结'),
      config,
      '请总结'
    )
    expect(title).toBe('文档总结')
  })

  it('returns null when the provider returns an empty string', async () => {
    const title = await generateConversationTitle(
      makeProvider(async () => ''),
      config,
      '请总结'
    )
    expect(title).toBeNull()
  })

  it('returns null when the provider throws', async () => {
    const title = await generateConversationTitle(
      makeProvider(async () => {
        throw new Error('provider down')
      }),
      config,
      '请总结'
    )
    expect(title).toBeNull()
  })
})
```

- [ ] **Step 5: 实现 conversation-title**

Create `electron/ai/conversation-title.ts`:

```ts
import type { LlmProvider } from './provider'
import type { AiRuntimeConfig } from '../../shared/ai/types'

/**
 * 用 LLM 为会话生成标题。任何失败都返回 null，由调用方保留占位标题。
 */
export async function generateConversationTitle(
  provider: LlmProvider,
  config: AiRuntimeConfig,
  text: string
): Promise<string | null> {
  try {
    const title = (await provider.summarize(config, text)).trim()
    return title.length > 0 ? title : null
  } catch {
    return null
  }
}
```

- [ ] **Step 6: 运行 conversation-title 测试**

Run: `npx vitest run electron/ai/__tests__/conversation-title.test.ts`
Expected: PASS

- [ ] **Step 7: 全量检查与 Commit**

Run: `npm run typecheck:node && npx vitest run electron/ai`
Expected: PASS

```bash
git add electron/ai/provider.ts electron/ai/conversation-title.ts electron/ai/__tests__/provider.test.ts electron/ai/__tests__/conversation-title.test.ts
git commit -m "feat(ai): LLM 会话标题生成"
```

---

### Task 4: IPC 通道、handlers 与 preload API

**Files:**
- Modify: `electron/ipc/channels.ts`
- Modify: `electron/ai/ipc-handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ai/__tests__/ipc-handlers.test.ts`

**Interfaces:**
- Consumes: Task 2 `ConversationStore`、Task 3 `generateConversationTitle`、Task 1 `ConversationRecord`
- Produces:
  - 通道 `IPC_CHANNELS.AI.CONVERSATION.{LIST, LOAD, SAVE, DELETE, SUMMARIZE}`
  - preload：`listAiConversations(root)`, `loadAiConversation(root, id)`, `saveAiConversation(root, record)`, `deleteAiConversation(root, id)`, `summarizeAiConversation(text)`

- [ ] **Step 1: 新增通道常量**

在 `electron/ipc/channels.ts` 的 `AI` 对象内（`APPROVAL` 之后、`EVENT` 之前或之后均可）新增：

```ts
AI: {
  CONFIG: { ... },
  RUN: { ... },
  APPROVAL: { ... },
  CONVERSATION: {
    LIST: 'ai:conversation:list',
    LOAD: 'ai:conversation:load',
    SAVE: 'ai:conversation:save',
    DELETE: 'ai:conversation:delete',
    SUMMARIZE: 'ai:conversation:summarize'
  },
  EVENT: 'ai:run:event'
}
```

- [ ] **Step 2: 新增 IPC handlers**

在 `electron/ai/ipc-handlers.ts`：

1) 顶部 import 增加：

```ts
import { ConversationStore } from './conversation-store'
import { generateConversationTitle } from './conversation-title'
import type { ConversationRecord } from '../../shared/ai/types'
```

2) 模块级增加单例（`sourceAccessService` 附近）：

```ts
const conversationStore = new ConversationStore()
```

3) `channels` 数组（约 123-131 行）增加：

```ts
const channels = [
  AI.CONFIG.GET,
  AI.CONFIG.SET,
  AI.CONFIG.TEST,
  AI.RUN.START,
  AI.RUN.CANCEL,
  AI.APPROVAL.CLAIM,
  AI.APPROVAL.RESOLVE,
  AI.CONVERSATION.LIST,
  AI.CONVERSATION.LOAD,
  AI.CONVERSATION.SAVE,
  AI.CONVERSATION.DELETE,
  AI.CONVERSATION.SUMMARIZE
]
```

4) 在 `AI.APPROVAL.RESOLVE` handler 之后新增 5 个 handler：

```ts
  ipcMain.handle(AI.CONVERSATION.LIST, (_event, root: string | null) => {
    try {
      return toResult(conversationStore.listConversations(root ?? null))
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(AI.CONVERSATION.LOAD, (_event, root: string | null, id: string) => {
    try {
      return toResult(conversationStore.loadConversation(root ?? null, id))
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(AI.CONVERSATION.SAVE, (_event, root: string | null, record: ConversationRecord) => {
    try {
      conversationStore.saveConversation(root ?? null, record)
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(AI.CONVERSATION.DELETE, (_event, root: string | null, id: string) => {
    try {
      conversationStore.deleteConversation(root ?? null, id)
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(AI.CONVERSATION.SUMMARIZE, async (_event, text: string) => {
    try {
      const config = getConfigService().getRuntimeConfig()
      const provider = new VercelAiSdkProvider()
      const title = await generateConversationTitle(provider, config, text)
      if (!title) return { success: false, error: '无法生成会话标题' }
      return toResult({ title })
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })
```

- [ ] **Step 3: 新增 preload 类型与方法**

在 `electron/preload.ts`：

1) `ElectronAPI` 接口的 "AI 助手" 部分（`onAiRunEvent` 之后）增加：

```ts
  listAiConversations: (root: string | null) => Promise<{ success: boolean; data?: ConversationMeta[]; error?: string }>
  loadAiConversation: (root: string | null, id: string) => Promise<{ success: boolean; data?: ConversationRecord; error?: string }>
  saveAiConversation: (root: string | null, record: ConversationRecord) => Promise<{ success: boolean; error?: string }>
  deleteAiConversation: (root: string | null, id: string) => Promise<{ success: boolean; error?: string }>
  summarizeAiConversation: (text: string) => Promise<{ success: boolean; data?: { title: string }; error?: string }>
```

顶部 import 类型（已有 `from '../shared/ai/types'`，需加入 `ConversationMeta` 与 `ConversationRecord`）。

2) `api` 对象（"AI 助手" 部分，`onAiRunEvent` 之前）增加：

```ts
  listAiConversations: (root) => ipcRenderer.invoke(IPC_CHANNELS.AI.CONVERSATION.LIST, root),
  loadAiConversation: (root, id) => ipcRenderer.invoke(IPC_CHANNELS.AI.CONVERSATION.LOAD, root, id),
  saveAiConversation: (root, record) => ipcRenderer.invoke(IPC_CHANNELS.AI.CONVERSATION.SAVE, root, record),
  deleteAiConversation: (root, id) => ipcRenderer.invoke(IPC_CHANNELS.AI.CONVERSATION.DELETE, root, id),
  summarizeAiConversation: (text) => ipcRenderer.invoke(IPC_CHANNELS.AI.CONVERSATION.SUMMARIZE, text),
```

- [ ] **Step 4: 扩展 ipc-handlers 测试**

在 `electron/ai/__tests__/ipc-handlers.test.ts`：

1) 文件顶部 mock 新增（在 `vi.mock('../provider', ...)` 之后、现有其他 mock 附近）：

```ts
vi.mock('../conversation-store', () => {
  const records = new Map<string, Record<string, unknown>>()
  return {
    ConversationStore: class {
      listConversations = vi.fn((_root: string | null) => [...records.values()])
      loadConversation = vi.fn((_root: string | null, id: string) => {
        const record = records.get(id)
        if (!record) throw new Error('会话不存在')
        return record
      })
      saveConversation = vi.fn((_root: string | null, record: { id: string }) => {
        records.set(record.id, record as Record<string, unknown>)
      })
      deleteConversation = vi.fn((_root: string | null, id: string) => {
        records.delete(id)
      })
    }
  }
})

vi.mock('../conversation-title', () => ({
  generateConversationTitle: vi.fn(async () => '生成标题')
}))
```

2) 在测试文件的 `describe` 中新增一个 describe 块（需要访问 `electronMocks.handlers`）：

```ts
describe('conversation handlers', () => {
  const invoke = (channel: string, ...args: unknown[]): unknown => {
    const handler = electronMocks.handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return handler({}, ...args)
  }

  it('lists, saves, loads and deletes conversations', () => {
    const record = {
      version: 1 as const,
      id: 'conv_1',
      title: 'T',
      createdAt: 1,
      updatedAt: 2,
      messageCount: 1,
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      toolSummaries: []
    }
    const saved = invoke(IPC_CHANNELS.AI.CONVERSATION.SAVE, null, record) as { success: boolean }
    expect(saved.success).toBe(true)

    const listed = invoke(IPC_CHANNELS.AI.CONVERSATION.LIST, null) as { success: boolean; data: unknown[] }
    expect(listed.success).toBe(true)
    expect(listed.data).toHaveLength(1)

    const loaded = invoke(IPC_CHANNELS.AI.CONVERSATION.LOAD, null, 'conv_1') as { success: boolean; data: unknown }
    expect(loaded.success).toBe(true)
    expect(loaded.data).toMatchObject({ id: 'conv_1' })

    const deleted = invoke(IPC_CHANNELS.AI.CONVERSATION.DELETE, null, 'conv_1') as { success: boolean }
    expect(deleted.success).toBe(true)
    expect(invoke(IPC_CHANNELS.AI.CONVERSATION.LIST, null) as { data: unknown[] }).toMatchObject({ data: [] })
  })

  it('summarizes a conversation title', async () => {
    // SUMMARIZE handler 依赖 getRuntimeConfig()，需先保存带 API Key 的配置
    const setResult = invoke(IPC_CHANNELS.AI.CONFIG.SET, {
      baseUrl: 'https://api.example.com/v1',
      model: 'demo',
      apiKey: 'secret',
      temperature: 0.7
    }) as { success: boolean }
    expect(setResult.success).toBe(true)

    const result = (await invoke(IPC_CHANNELS.AI.CONVERSATION.SUMMARIZE, '请总结')) as {
      success: boolean
      data?: { title: string }
    }
    expect(result.success).toBe(true)
    expect(result.data?.title).toBe('生成标题')
  })
})
```

注意：`ipc-handlers.test.ts` 顶部已 mock `electron` 的 `app.getPath` 返回临时 userData，且文件内应有 `IPC_CHANNELS` import（若没有，补充 `import { IPC_CHANNELS } from '../../ipc/channels'`）。现有测试 `registerAiHandlers` 被调用后 handler 注册在 `electronMocks.handlers` 中——请确认现有 `beforeEach` 已调用 `registerAiHandlers`（若无，新增 `const cleanup = registerAiHandlers(() => null)` 并在 `afterEach` 调用 `cleanup()`）。

- [ ] **Step 5: 运行测试与类型检查**

Run: `npx vitest run electron/ai/__tests__/ipc-handlers.test.ts && npm run typecheck:node`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/channels.ts electron/ai/ipc-handlers.ts electron/preload.ts electron/ai/__tests__/ipc-handlers.test.ts
git commit -m "feat(ai): 会话记录 IPC 通道与 preload API"
```

---

### Task 5: FileExplorer 隐藏 `.markdownPlus`

**Files:**
- Modify: `electron/ipc/file-handlers.ts`
- Test: `electron/ipc/__tests__/file-handlers.test.ts`（新建目录与文件）

**Interfaces:**
- Consumes: `registerFileHandlers`（已有导出）
- Produces: `folder:read` handler 不再返回 `.` 开头的目录

- [ ] **Step 1: 写失败测试**

Create `electron/ipc/__tests__/file-handlers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-plus-folder-'))

type Handler = (...args: unknown[]) => unknown

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    })
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
  BrowserWindow: class {},
  app: { getPath: () => tmpDir },
  shell: { showItemInFolder: vi.fn(), openPath: vi.fn() }
}))

import { registerFileHandlers } from '../file-handlers'
import { IPC_CHANNELS } from '../channels'

describe('folder:read', () => {
  beforeEach(() => {
    electronMocks.handlers.clear()
    registerFileHandlers()
  })

  it('filters dot-prefixed directories like .markdownPlus', () => {
    const dir = path.join(tmpDir, 'ws')
    fs.mkdirSync(path.join(dir, '.markdownPlus'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'readme.md'), '# hi', 'utf8')

    const handler = electronMocks.handlers.get(IPC_CHANNELS.FOLDER.READ)!
    const result = handler({}, dir) as { success: boolean; data: Array<{ name: string; isDirectory: boolean }> }

    expect(result.success).toBe(true)
    const names = result.data.map((item) => item.name)
    expect(names).toContain('docs')
    expect(names).toContain('readme.md')
    expect(names).not.toContain('.markdownPlus')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run electron/ipc/__tests__/file-handlers.test.ts`
Expected: FAIL（`.markdownPlus` 仍出现在结果中）

- [ ] **Step 3: 修改 readFolder**

在 `electron/ipc/file-handlers.ts` 的 `FOLDER.READ` handler（约 225-240 行）中，对目录条目增加过滤：

```ts
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.')) continue
          items.push({ name: entry.name, path: fullPath, isDirectory: true })
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (ext === '.mdx' || ext === '.md') {
            items.push({ name: entry.name, path: fullPath, isDirectory: false })
          }
        }
      }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run electron/ipc/__tests__/file-handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/file-handlers.ts electron/ipc/__tests__/file-handlers.test.ts
git commit -m "feat(ai): 文件树隐藏 .markdownPlus 目录"
```

---

### Task 6: aiStore 多会话改造

**Files:**
- Modify: `src/stores/ai.ts`
- Test: `src/stores/__tests__/ai-conversation.test.ts`（新建）
- Modify: `src/stores/__tests__/ai.test.ts`（更新 `conversationId` 相关断言）

**Interfaces:**
- Consumes: Task 1 类型、Task 4 preload API、`loadSessionState`（已有）、`useFileStore`（已有）
- Produces:
  - 状态：`conversations`, `activeConversationId`, `storageRoot`, `conversationTitle`, `conversationCreatedAt`, `titleSource`
  - actions：`loadConversations(root)`, `openConversation(id)`, `newConversation()`, `deleteConversation(id)`, `renameConversation(id, title)`, `persistConversation()`
  - 移除 `conversationId` ref 与 `clearConversation`
  - `sendMessage` / `handleRunEvent` 集成保存与标题生成

- [ ] **Step 1: 全局替换 `conversationId` 引用**

Run: `rg -n "conversationId" src/stores src/components src/utils`
说明：`conversationId` 将不再作为 ref 导出。所有"当前会话 id"改用新状态 `activeConversationId`。在实施下方改造后统一处理引用。

- [ ] **Step 2: 新增会话状态与基础函数**

在 `src/stores/ai.ts`：

1) 顶部 import 增加：

```ts
import type {
  AiConversationMessage,
  AiRunEvent,
  AiRunInput,
  ApprovalDecision,
  ConversationMeta,
  ConversationRecord,
  ToolApprovalRequest,
  ToolExecutionResult
} from '../../shared/ai/types'
import { loadSessionState } from './session'
```

（将原 import 中 `AiConversationMessage` 等合并，删除重复 import。）

2) 在"会话状态"区域（`messages` 等附近）增加：

```ts
  const conversations = ref<ConversationMeta[]>([])
  const activeConversationId = ref<string | null>(null)
  const storageRoot = ref<string | null>(null)
  const conversationTitle = ref('新会话')
  const conversationCreatedAt = ref(0)
  const titleSource = ref<'truncated' | 'llm' | 'custom'>('truncated')
```

3) 删除原有 `const conversationId = ref(generateConversationId())`。

4) 在内部状态区域增加（`idCounter` 附近）：

```ts
  let pendingTitleGeneration = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
```

- [ ] **Step 3: 新增会话管理函数**

在 `clearConversation` 之前或 `requestClosePanel` 之后新增：

```ts
  function truncateTitle(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (!cleaned) return '新会话'
    return cleaned.length > 20 ? `${cleaned.slice(0, 20)}…` : cleaned
  }

  function buildRecord(id: string): ConversationRecord {
    return {
      version: 1,
      id,
      title: conversationTitle.value,
      createdAt: conversationCreatedAt.value || Date.now(),
      updatedAt: Date.now(),
      messageCount: messages.value.length,
      messages: JSON.parse(JSON.stringify(messages.value)),
      toolSummaries: toolCalls.value.map((c) => ({
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        status: c.status
      }))
    }
  }

  async function refreshConversationsList(): Promise<void> {
    try {
      const result = await window.electronAPI.listAiConversations(storageRoot.value)
      if (result.success && result.data) conversations.value = result.data
    } catch {
      // 忽略
    }
  }

  function persistConversation(): void {
    const id = activeConversationId.value
    if (!id) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void (async () => {
        try {
          const result = await window.electronAPI.saveAiConversation(storageRoot.value, buildRecord(id))
          if (!result.success) {
            error.value = result.error || '保存会话失败'
            return
          }
          await refreshConversationsList()
        } catch (err) {
          error.value = err instanceof Error ? err.message : '保存会话失败'
        }
      })()
    }, 300)
  }

  function newConversation(): void {
    activeConversationId.value = null
    conversationTitle.value = '新会话'
    conversationCreatedAt.value = 0
    titleSource.value = 'truncated'
    messages.value = []
    toolCalls.value = []
    discardAllApprovals()
  }

  async function openConversation(id: string): Promise<void> {
    if (running.value || pendingStartPromise) return
    try {
      const result = await window.electronAPI.loadAiConversation(storageRoot.value, id)
      if (!result.success || !result.data) {
        error.value = result.error || '加载会话失败'
        return
      }
      const record = result.data
      activeConversationId.value = record.id
      conversationTitle.value = record.title
      conversationCreatedAt.value = record.createdAt
      titleSource.value = 'custom'
      messages.value = record.messages.map((m) => ({ ...m }))
      toolCalls.value = record.toolSummaries.map((s) => ({
        toolCallId: s.toolCallId,
        toolName: s.toolName,
        status: s.status === 'failed' ? 'failed' : 'completed'
      }))
      discardAllApprovals()
      useFileStore().persistSession()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载会话失败'
    }
  }

  async function loadConversations(root: string | null): Promise<void> {
    storageRoot.value = root
    try {
      const result = await window.electronAPI.listAiConversations(root)
      if (!result.success || !result.data) return
      conversations.value = result.data
      const lastId = loadSessionState()?.aiActiveConversationId ?? null
      if (lastId && conversations.value.some((c) => c.id === lastId)) {
        await openConversation(lastId)
      } else {
        newConversation()
      }
    } catch {
      // 忽略
    }
  }

  async function deleteConversation(id: string): Promise<void> {
    try {
      const result = await window.electronAPI.deleteAiConversation(storageRoot.value, id)
      if (!result.success) {
        error.value = result.error || '删除会话失败'
        return
      }
      conversations.value = conversations.value.filter((c) => c.id !== id)
      if (activeConversationId.value === id) {
        newConversation()
        useFileStore().persistSession()
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除会话失败'
    }
  }

  async function renameConversation(id: string, title: string): Promise<void> {
    const cleaned = title.trim()
    if (!cleaned) return
    if (activeConversationId.value === id) {
      conversationTitle.value = cleaned
      titleSource.value = 'custom'
      persistConversation()
      return
    }
    try {
      const loaded = await window.electronAPI.loadAiConversation(storageRoot.value, id)
      if (!loaded.success || !loaded.data) return
      loaded.data.title = cleaned
      const result = await window.electronAPI.saveAiConversation(storageRoot.value, loaded.data)
      if (result.success) await refreshConversationsList()
      else error.value = result.error || '重命名会话失败'
    } catch (err) {
      error.value = err instanceof Error ? err.message : '重命名会话失败'
    }
  }

  async function maybeGenerateTitle(): Promise<void> {
    if (!pendingTitleGeneration || titleSource.value !== 'truncated') return
    pendingTitleGeneration = false
    const firstUser = messages.value.find((m) => m.role === 'user')
    if (!firstUser) return
    try {
      const result = await window.electronAPI.summarizeAiConversation(firstUser.content)
      if (result.success && result.data?.title && titleSource.value === 'truncated') {
        conversationTitle.value = result.data.title
        titleSource.value = 'llm'
        persistConversation()
      }
    } catch {
      // 保留占位标题
    }
  }
```

- [ ] **Step 4: 集成 sendMessage**

在 `src/stores/ai.ts` 的 `sendMessage` 中：

1) 在 `if (!trimmed || running.value || pendingStartPromise) return` 之后新增自动建会话逻辑：

```ts
    if (!activeConversationId.value) {
      activeConversationId.value = generateConversationId()
      conversationTitle.value = truncateTitle(trimmed)
      conversationCreatedAt.value = Date.now()
      titleSource.value = 'truncated'
    }
```

2) 用户消息 push 增加 `createdAt`，并在 push 后设置首轮标题标记：

```ts
    messages.value.push({
      id: nextId('msg'),
      role: 'user',
      content: text,
      createdAt: Date.now()
    })

    const isFirstTurn = messages.value.filter((m) => m.role === 'user').length === 1
    if (isFirstTurn) pendingTitleGeneration = true
```

3) `AiRunInput` 构造中的 `conversationId: conversationId.value` 改为 `conversationId: activeConversationId.value`（两处：`input.conversationId` 与 `snapshot.conversationId`）。

4) 在 `running.value = true` 之前调用 `persistConversation()`。

- [ ] **Step 5: 集成 run terminal 事件**

在 `handleRunEvent` 的 `run-completed`、`run-failed`、`run-cancelled` 三个分支的末尾（`discardApprovalsForRun(...)` 之后）各增加：

```ts
        persistConversation()
        void maybeGenerateTitle()
```

- [ ] **Step 6: 更新 store 返回值**

在 `src/stores/ai.ts` 返回对象中：

1) 删除 `conversationId` 导出，增加：

```ts
    conversations,
    activeConversationId,
    storageRoot,
    conversationTitle,
    conversationCreatedAt,
    titleSource,
```

2) 删除 `clearConversation`，增加：

```ts
    loadConversations,
    openConversation,
    newConversation,
    deleteConversation,
    renameConversation,
    persistConversation,
```

- [ ] **Step 7: 更新现有 ai.test.ts 及 mock**

在 `src/stores/__tests__/ai.test.ts`：

1) `electronApi` mock 对象（约 47-61 行）补充会话 API（否则调用 `sendMessage` 的既有用例会因 `saveAiConversation` 未定义而失败）：

```ts
    electronApi = {
      ...,
      listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
      loadAiConversation: vi.fn(),
      saveAiConversation: vi.fn(async () => ({ success: true })),
      deleteAiConversation: vi.fn(async () => ({ success: true })),
      summarizeAiConversation: vi.fn(async () => ({ success: true, data: { title: '标题' } })),
      ...
    }
```

2) `defaults to hidden, inactive, empty conversation state`（约 82 行）中：

```ts
      expect(typeof store.conversationId).toBe('string')
      expect(store.conversationId.length).toBeGreaterThan(0)
```

改为：

```ts
      expect(store.activeConversationId).toBeNull()
      expect(store.conversations).toEqual([])
```

3) 删除或改写所有引用 `store.conversationId` 与 `store.clearConversation` 的断言。运行 `rg -n "conversationId|clearConversation" src/stores src/components src/utils` 检查其他测试/组件（如 `ai-workflow.test.ts`、`ai-tab.test.ts`、`app-ai-lifecycle.test.ts`）是否引用这些符号并逐处更新：`conversationId` → `activeConversationId`（注意语义：store 不再导出 ref），`clearConversation` → 删除相关调用与断言。任何 mock `electronAPI` 的测试文件同样补充上述 5 个会话 API mock。

Run: `npx vitest run src/stores/__tests__/ai.test.ts src/stores/__tests__/ai-workflow.test.ts`
Expected: PASS

- [ ] **Step 8: 为 aiStore 会话功能写测试**

Create `src/stores/__tests__/ai-conversation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiStore } from '../ai'
import { useFileStore } from '../file'
import type { AiRunEvent } from '../../../shared/ai/types'

function makeStore() {
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  })
  let eventHandler: ((event: AiRunEvent) => void) | null = null
  const electronApi = {
    listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
    loadAiConversation: vi.fn(),
    saveAiConversation: vi.fn(async () => ({ success: true })),
    deleteAiConversation: vi.fn(async () => ({ success: true })),
    summarizeAiConversation: vi.fn(async () => ({ success: true, data: { title: 'LLM标题' } })),
    startAiRun: vi.fn(async () => ({ success: true, data: { runId: 'r1' } })),
    cancelAiRun: vi.fn(async () => ({ success: true })),
    claimAiApproval: vi.fn(async () => ({ success: true })),
    resolveAiApproval: vi.fn(async () => ({ success: true })),
    getAiConfig: vi.fn(),
    onAiRunEvent: vi.fn((cb: (event: AiRunEvent) => void) => {
      eventHandler = cb
      return () => {
        eventHandler = null
      }
    })
  }
  vi.stubGlobal('window', { electronAPI: electronApi })
  return {
    electronApi,
    emit: (event: AiRunEvent): void => eventHandler!(event)
  }
}

describe('ai store conversation records', () => {
  it('creates a conversation on first send with a truncated placeholder title', async () => {
    vi.useFakeTimers()
    const { electronApi } = makeStore()
    const store = useAiStore()

    await store.sendMessage('这是一段非常长的第一条用户消息，用来测试截取标题')
    await vi.runOnlyPendingTimersAsync()

    expect(store.activeConversationId).toMatch(/^conv_/)
    expect(store.conversationTitle).toBe('这是一段非常长的第一条用户消息，用来测试截取')
    expect(store.messages).toHaveLength(1)
    expect(electronApi.saveAiConversation).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('appends analysis markers and persists after a terminal run event', async () => {
    vi.useFakeTimers()
    const { electronApi, emit } = makeStore()
    const store = useAiStore()

    await store.sendMessage('你好')
    emit({ type: 'run-completed', runId: 'r1' })
    await vi.runOnlyPendingTimersAsync()

    expect(electronApi.saveAiConversation).toHaveBeenCalled()
    expect(electronApi.summarizeAiConversation).toHaveBeenCalledWith('你好')
    expect(store.conversationTitle).toBe('LLM标题')
    vi.useRealTimers()
  })

  it('loadConversations restores the last active conversation', async () => {
    const { electronApi } = makeStore()
    electronApi.listAiConversations.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'conv_x', title: '历史', createdAt: 1, updatedAt: 2, messageCount: 2 }]
    })
    electronApi.loadAiConversation.mockResolvedValueOnce({
      success: true,
      data: {
        version: 1,
        id: 'conv_x',
        title: '历史',
        createdAt: 1,
        updatedAt: 2,
        messageCount: 2,
        messages: [
          { id: 'm1', role: 'user', content: '旧问题', createdAt: 1 },
          { id: 'm2', role: 'assistant', content: '旧答案', createdAt: 2 }
        ],
        toolSummaries: [{ toolCallId: 'tc1', toolName: 'read_current_document', status: 'completed' }]
      }
    })
    const store = useAiStore()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ aiActiveConversationId: 'conv_x' })),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })

    await store.loadConversations(null)

    expect(store.activeConversationId).toBe('conv_x')
    expect(store.messages).toHaveLength(2)
    expect(store.toolCalls).toEqual([
      { toolCallId: 'tc1', toolName: 'read_current_document', status: 'completed' }
    ])
  })

  it('newConversation clears the active state', async () => {
    makeStore()
    const store = useAiStore()
    store.activeConversationId = 'conv_1'
    store.messages.push({ id: 'm1', role: 'user', content: 'hi' })

    store.newConversation()

    expect(store.activeConversationId).toBeNull()
    expect(store.messages).toEqual([])
  })

  it('deleteConversation removes the record and starts a new conversation when active', async () => {
    const { electronApi } = makeStore()
    const store = useAiStore()
    store.activeConversationId = 'conv_1'
    store.conversations.push({ id: 'conv_1', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })

    await store.deleteConversation('conv_1')

    expect(electronApi.deleteAiConversation).toHaveBeenCalledWith(null, 'conv_1')
    expect(store.activeConversationId).toBeNull()
  })

  it('renameConversation marks the title as custom for the active conversation', async () => {
    vi.useFakeTimers()
    const { electronApi } = makeStore()
    const store = useAiStore()
    store.activeConversationId = 'conv_1'

    await store.renameConversation('conv_1', '  自定义标题  ')
    await vi.runOnlyPendingTimersAsync()

    expect(store.conversationTitle).toBe('自定义标题')
    expect(store.titleSource).toBe('custom')
    expect(electronApi.saveAiConversation).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

注意：`persistConversation` 走 300ms 防抖，涉及保存断言的用例统一使用 `vi.useFakeTimers()` + `vi.runOnlyPendingTimersAsync()`（如上述两个用例所示），结束前 `vi.useRealTimers()`。`sendMessage` 内部 `await` 依赖微任务而非定时器，故 fake timers 下可正常推进。

- [ ] **Step 9: 运行 aiStore 全部测试**

Run: `npx vitest run src/stores/__tests__/ai.test.ts src/stores/__tests__/ai-conversation.test.ts src/stores/__tests__/ai-workflow.test.ts`
Expected: PASS

- [ ] **Step 10: 全量检查与 Commit**

Run: `npm run typecheck:web && npm run lint`
Expected: PASS（修复 lint 报错，如未使用 import）

```bash
git add src/stores/ai.ts src/stores/__tests__/ai.test.ts src/stores/__tests__/ai-conversation.test.ts src/stores/__tests__/ai-workflow.test.ts
git commit -m "feat(ai): aiStore 多会话管理"
```

---

### Task 7: 工作区与恢复集成

**Files:**
- Modify: `src/stores/session.ts`
- Modify: `src/stores/file.ts`
- Test: `src/components/editor/__tests__/ai-tab.test.ts`（或新增 `src/stores/__tests__/ai-conversation-session.test.ts`）

**Interfaces:**
- Consumes: Task 6 `loadConversations`
- Produces: `SessionState.aiActiveConversationId`；`openFolder`/`closeFolder`/`restoreSession` 触发会话列表刷新

- [ ] **Step 1: 扩展 SessionState**

在 `src/stores/session.ts` 的 `SessionState` 增加字段：

```ts
export interface SessionState {
  openedFolderPath: string | null
  openFilePaths: string[]
  activeFilePath: string | null
  sidebarCollapsed: boolean
  sidebarWidth?: number
  editorMode: EditorMode
  aiPanelOpen: boolean
  aiActiveConversationId: string | null
}
```

- [ ] **Step 2: persistSession 保存 lastId**

在 `src/stores/file.ts` 的 `persistSession()`（约 567-577 行）增加一行：

```ts
      aiPanelOpen: useAiStore().panelOpen,
      aiActiveConversationId: useAiStore().activeConversationId
```

- [ ] **Step 3: openFolder / closeFolder / restoreSession 触发刷新**

在 `src/stores/file.ts`：

1) `openFolder()`（约 1566-1570 行）`readFolder(dirPath)` 成功后，在 `if (success)` 块内增加：

```ts
        await useAiStore().loadConversations(dirPath)
```

2) `closeFolder()`（约 1677-1683 行）末尾增加：

```ts
    void useAiStore().loadConversations(null)
```

3) `restoreSession()`（约 595-617 行）中，`state.openedFolderPath` 的 `if (success)` 块内、设置 `fileTree` 之后增加：

```ts
        await useAiStore().loadConversations(state.openedFolderPath)
```

（若 `state.openedFolderPath` 为空，`restoreSession` 结束时也调用一次 `await useAiStore().loadConversations(null)`，以便无工作区时加载 userData 会话——放在方法末尾 `if (state.activeFilePath) { ... }` 块之后。）

- [ ] **Step 4: 写集成测试**

Create `src/stores/__tests__/ai-conversation-session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiStore } from '../ai'
import { useFileStore } from '../file'
import type { AiRunEvent } from '../../../shared/ai/types'

function mockApp() {
  setActivePinia(createPinia())
  let eventHandler: ((event: AiRunEvent) => void) | null = null
  const electronApi = {
    listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
    loadAiConversation: vi.fn(),
    saveAiConversation: vi.fn(async () => ({ success: true })),
    deleteAiConversation: vi.fn(async () => ({ success: true })),
    summarizeAiConversation: vi.fn(),
    startAiRun: vi.fn(),
    cancelAiRun: vi.fn(),
    claimAiApproval: vi.fn(),
    resolveAiApproval: vi.fn(),
    getAiConfig: vi.fn(),
    onAiRunEvent: vi.fn((cb: (event: AiRunEvent) => void) => {
      eventHandler = cb
      return () => {
        eventHandler = null
      }
    }),
    readFolder: vi.fn(async () => ({ success: true, data: [] })),
    openFile: vi.fn(async () => ({ success: true })),
    getRecentFiles: vi.fn(async () => ({ success: true, data: [] }))
  }
  vi.stubGlobal('window', { electronAPI: electronApi })
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  })
  return { electronApi }
}

describe('ai conversation workspace integration', () => {
  it('loads conversations with the workspace root after restoreSession with a folder', async () => {
    const { electronApi } = mockApp()
    electronApi.listAiConversations.mockResolvedValue({
      success: true,
      data: [{ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 }]
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ openedFolderPath: 'C:\\ws' })),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
    const fileStore = useFileStore()

    await fileStore.restoreSession()

    expect(electronApi.listAiConversations).toHaveBeenCalledWith('C:\\ws')
    expect(useAiStore().storageRoot).toBe('C:\\ws')
  })

  it('loads conversations with null root when no folder is open', async () => {
    const { electronApi } = mockApp()
    const fileStore = useFileStore()

    await fileStore.restoreSession()

    expect(electronApi.listAiConversations).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 5: 运行测试**

Run: `npx vitest run src/stores/__tests__/ai-conversation-session.test.ts src/stores/__tests__/ai-conversation.test.ts src/stores/__tests__/ai.test.ts`
Expected: PASS

- [ ] **Step 6: 全量检查与 Commit**

Run: `npm run typecheck:web && npm run lint`
Expected: PASS

```bash
git add src/stores/session.ts src/stores/file.ts src/stores/__tests__/ai-conversation-session.test.ts
git commit -m "feat(ai): 会话记录随工作区加载与恢复"
```

---

### Task 8: 会话边栏 UI 与 AiPanel 改造

**Files:**
- Create: `src/components/ai/AiConversationSidebar.vue`
- Modify: `src/components/ai/AiPanel.vue`
- Test: `src/components/ai/__tests__/ai-conversation-sidebar.test.ts`（新建）
- Modify: `src/components/ai/__tests__/ai-panel.test.ts`（移除清空按钮测试）

**Interfaces:**
- Consumes: Task 6 store 状态与 actions
- Produces: 组件渲染；`AiPanel` 左右分栏，不再有"清空"按钮

- [ ] **Step 1: 写组件失败测试**

Create `src/components/ai/__tests__/ai-conversation-sidebar.test.ts`:

```ts
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AiConversationSidebar from '../AiConversationSidebar.vue'
import { useAiStore } from '../../../stores/ai'
import { requestDialog } from '../../../utils/dialog'

vi.mock('../../../utils/dialog', () => ({
  requestDialog: vi.fn(async () => 0)
}))

const electronAPI = {
  listAiConversations: vi.fn(async () => ({ success: true, data: [] })),
  onAiRunEvent: vi.fn(() => () => undefined)
}

function mountSidebar() {
  return mount(AiConversationSidebar, { attachTo: document.body })
}

describe('AI conversation sidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('electronAPI', electronAPI)
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: electronAPI })
  })

  it('renders the conversation list with titles', async () => {
    const store = useAiStore()
    store.conversations.push(
      { id: 'conv_a', title: '第一个会话', createdAt: 1, updatedAt: 100, messageCount: 2 },
      { id: 'conv_b', title: '第二个会话', createdAt: 2, updatedAt: 200, messageCount: 4 }
    )
    const wrapper = mountSidebar()
    await nextTick()

    expect(wrapper.findAll('[data-testid="ai-conversation-item"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('第一个会话')
    expect(wrapper.text()).toContain('第二个会话')
  })

  it('creates a new conversation via the header button', async () => {
    const store = useAiStore()
    const wrapper = mountSidebar()
    await wrapper.get('[data-testid="ai-new-conversation"]').trigger('click')

    expect(store.activeConversationId).toBeNull()
  })

  it('opens a conversation on click', async () => {
    const store = useAiStore()
    const open = vi.spyOn(store, 'openConversation').mockResolvedValue()
    store.conversations.push({ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })
    const wrapper = mountSidebar()
    await nextTick()

    await wrapper.get('[data-testid="ai-conversation-item"]').trigger('click')

    expect(open).toHaveBeenCalledWith('conv_a')
  })

  it('shows a rename/delete context menu on right-click', async () => {
    const store = useAiStore()
    store.conversations.push({ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })
    const wrapper = mountSidebar()
    await nextTick()

    await wrapper.get('[data-testid="ai-conversation-item"]').trigger('contextmenu')

    expect(wrapper.text()).toContain('重命名')
    expect(wrapper.text()).toContain('删除')
  })

  it('deletes a conversation after confirmation', async () => {
    const store = useAiStore()
    const del = vi.spyOn(store, 'deleteConversation').mockResolvedValue()
    store.conversations.push({ id: 'conv_a', title: 'A', createdAt: 1, updatedAt: 2, messageCount: 1 })
    const wrapper = mountSidebar()
    await nextTick()

    await wrapper.get('[data-testid="ai-conversation-item"]').trigger('contextmenu')
    await wrapper.findAll('.context-menu-item')[1].trigger('click')
    await nextTick()

    expect(requestDialog).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('conv_a')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/ai/__tests__/ai-conversation-sidebar.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 AiConversationSidebar.vue**

Create `src/components/ai/AiConversationSidebar.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAiStore } from '../../stores/ai'
import { requestDialog } from '../../utils/dialog'

const store = useAiStore()

interface MenuItem {
  label: string
  action: () => void
}

const contextMenu = ref({ visible: false, x: 0, y: 0, items: [] as MenuItem[] })
const renamingId = ref<string | null>(null)
const renameValue = ref('')

const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'markdown-plus:close-context-menus'

function showContextMenu(event: MouseEvent, items: MenuItem[]): void {
  window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, items }
}

function onContextMenu(event: MouseEvent, id: string): void {
  showContextMenu(event, [
    { label: '重命名', action: () => startRename(id) },
    { label: '删除', action: () => void confirmDelete(id) }
  ])
}

function startRename(id: string): void {
  renamingId.value = id
  const conv = store.conversations.find((c) => c.id === id)
  renameValue.value = conv?.title ?? ''
}

function commitRename(): void {
  if (renamingId.value) void store.renameConversation(renamingId.value, renameValue.value)
  renamingId.value = null
}

async function confirmDelete(id: string): Promise<void> {
  const choice = await requestDialog({
    title: '删除会话',
    message: '确定要删除该会话吗？',
    detail: '删除后不可恢复。',
    buttons: [
      { label: '取消', value: 1 },
      { label: '删除', value: 0, primary: true }
    ]
  })
  if (choice === 0) await store.deleteConversation(id)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <aside class="conversation-sidebar" aria-label="会话列表">
    <div class="sidebar-header">
      <span>会话</span>
      <button
        type="button"
        data-testid="ai-new-conversation"
        @click="store.newConversation"
      >
        新建
      </button>
    </div>
    <ul class="conversation-list">
      <li
        v-for="conv in store.conversations"
        :key="conv.id"
        class="conversation-item"
        :class="{ active: conv.id === store.activeConversationId }"
        data-testid="ai-conversation-item"
        @click="conv.id !== store.activeConversationId && store.openConversation(conv.id)"
        @contextmenu.prevent.stop="onContextMenu($event, conv.id)"
      >
        <template v-if="renamingId === conv.id">
          <input
            v-model="renameValue"
            class="rename-input"
            data-testid="ai-conversation-rename-input"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="renamingId = null"
          >
        </template>
        <template v-else>
          <div class="conv-title">{{ conv.title }}</div>
          <div class="conv-time">{{ formatTime(conv.updatedAt) }}</div>
        </template>
      </li>
    </ul>
    <div class="sidebar-footer">{{ store.storageRoot ? store.storageRoot : '未打开工作区' }}</div>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
    >
      <button
        v-for="item in contextMenu.items"
        :key="item.label"
        type="button"
        class="context-menu-item"
        @click="item.action(); contextMenu.visible = false"
      >
        {{ item.label }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.conversation-sidebar { display: flex; width: 210px; min-width: 210px; flex-direction: column; border-right: 1px solid var(--color-border); background: var(--color-bg-secondary, var(--color-bg-primary)); }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 12px; border-bottom: 1px solid var(--color-border); }
.sidebar-header span { font-size: 12px; color: var(--color-text-secondary); }
.sidebar-header button { padding: 3px 8px; border: 0; border-radius: 4px; background: var(--color-primary); color: white; cursor: pointer; font-size: 12px; }
.conversation-list { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 4px; }
.conversation-item { padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.conversation-item:hover { background: var(--color-bg-hover, var(--color-bg-secondary)); }
.conversation-item.active { background: var(--color-bg-active, var(--color-bg-secondary)); }
.conv-title { font-size: 12px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-time { font-size: 10px; color: var(--color-text-tertiary); }
.rename-input { width: 100%; font-size: 12px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text); }
.sidebar-footer { padding: 8px 12px; border-top: 1px solid var(--color-border); font-size: 10px; color: var(--color-text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.context-menu { position: fixed; z-index: 1000; min-width: 120px; padding: 4px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg-primary); box-shadow: 0 8px 24px rgb(0 0 0 / 12%); }
.context-menu-item { display: block; width: 100%; padding: 6px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--color-text); text-align: left; cursor: pointer; font-size: 12px; }
.context-menu-item:hover { background: var(--color-bg-secondary); }
</style>
```

- [ ] **Step 4: 运行组件测试**

Run: `npx vitest run src/components/ai/__tests__/ai-conversation-sidebar.test.ts`
Expected: PASS

- [ ] **Step 5: 改造 AiPanel.vue**

修改 `src/components/ai/AiPanel.vue`：

1) script：删除 `clearDisabled` computed 与 `clear()` 函数，import 增加 `AiConversationSidebar`。

```ts
import AiComposer from './AiComposer.vue'
import AiMessageList from './AiMessageList.vue'
import AiConversationSidebar from './AiConversationSidebar.vue'

const store = useAiStore()
const props = defineProps<{ ready: boolean }>()
const emit = defineEmits<{ openSettings: [] }>()
```

2) template：`.ai-panel` 内先渲染 `<AiConversationSidebar />`，头部移除"清空"按钮：

```vue
  <section
    class="ai-panel"
    aria-label="AI 助手"
  >
    <AiConversationSidebar />
    <div class="workbench">
      <header class="panel-header">
        <div><strong>AI 助手</strong><span :class="{ ready: props.ready }">{{ props.ready ? '配置可用' : '需要配置' }}</span></div>
        <div>
          <button
            type="button"
            data-testid="ai-settings"
            @click="emit('openSettings')"
          >
            设置
          </button>
        </div>
      </header>
      <AiMessageList
        :messages="store.messages"
        :tool-calls="store.toolCalls"
        :running="store.running"
      />
      <p
        v-if="store.error"
        class="error"
        role="alert"
      >
        {{ store.error }}
      </p>
      <div class="composer-wrap">
        <AiComposer
          :running="store.running"
          :ready="props.ready"
          @send="store.sendMessage"
          @stop="store.cancelRun"
        />
      </div>
    </div>
  </section>
```

3) style：`.ai-panel` 保持 `display: flex;`；`.workbench` 保持原有 `flex: 1`（已是）。无需额外改动。

- [ ] **Step 6: 更新 ai-panel.test.ts**

在 `src/components/ai/__tests__/ai-panel.test.ts`：

1) 删除两个测试：`confirms before clearing a nonempty conversation`（约 166-179 行）与 `disables clear while running or waiting for approval`（约 181-196 行）。
2) 新增断言"不再显示清空按钮"：

```ts
  it('renders without a clear button', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="ai-clear"]').exists()).toBe(false)
  })
```

3) 注意：`AiConversationSidebar` 使用 `requestDialog`，本文件未 mock。删除测试不触发 `requestDialog`，无需额外 mock；若运行时报错再补充 `vi.mock('../../../utils/dialog', ...)`。

- [ ] **Step 7: 运行全部相关测试**

Run: `npx vitest run src/components/ai src/components/editor/__tests__/ai-tab.test.ts src/stores/__tests__/ai.test.ts src/stores/__tests__/ai-conversation.test.ts src/stores/__tests__/ai-conversation-session.test.ts`
Expected: PASS

- [ ] **Step 8: 全量回归与 Commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS（若有失败，修复后再提交）

```bash
git add src/components/ai/AiConversationSidebar.vue src/components/ai/AiPanel.vue src/components/ai/__tests__/ai-conversation-sidebar.test.ts src/components/ai/__tests__/ai-panel.test.ts
git commit -m "feat(ai): 会话边栏 UI 与 AiPanel 改造"
```

---

## 收尾验证

全部任务完成后运行：

```bash
npm test
npm run typecheck
npm run lint
```

并手动验证（`npm run dev`）：
1. 打开 AI 面板 → 左侧会话边栏出现"新建"按钮与空列表。
2. 发送消息 → 自动新建会话，标题为前 20 字；第一条回复完成后标题被 LLM 覆盖。
3. 发送第二条消息 → 列表项 updatedAt/messageCount 更新。
4. 打开文件夹 → 会话列表变为该工作区 `.markdownPlus/conversations/` 下的会话；未打开文件夹时使用 userData。
5. 右键会话 → 重命名、删除；删除当前会话后进入"新会话"。
6. 文件树中不显示 `.markdownPlus` 目录。
