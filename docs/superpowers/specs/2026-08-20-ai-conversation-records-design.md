# AI 会话记录设计方案

> 状态：已由用户确认  
> 日期：2026-08-20

## 1. 背景与目标

Markdown+ 的 AI 助手当前把会话保存在渲染进程内存中（`aiStore.messages`），应用退出后全部丢失，也不支持多会话。本方案新增**多会话历史记录**：会话持久化到磁盘文件，支持新建、切换、重命名、删除多个会话，打开工作区时加载该工作区下的历史会话。

## 2. 范围

### 2.1 包含

- 多会话历史列表，存储于每会话一个 JSON 文件。
- 会话持久化：用户/助手文本消息 + 工具调用摘要。
- 会话随工作区隔离：打开工作区时加载该工作区下的会话。
- 会话边栏 UI（面板内左侧）：新建、切换、右键重命名、右键删除。
- 会话标题自动生成：截取首条用户消息前 20 字作为占位，第一条消息回答完成后用 LLM 总结覆盖。
- 移除 AI 面板头部"清空"按钮。

### 2.2 不包含

- 工具结果正文、文档快照、来源内容、审批记录的持久化。
- 无工作区 ↔ 有工作区会话文件的自动迁移。
- 会话数量硬性上限。
- 会话导出/导入、会话合并、会话置顶。
- 多 AI 会话标签页（本次仍是单一 AI 标签页，内部维护多个会话）。

## 3. 数据模型

### 3.1 文件位置

```
有工作区:   <工作区根>/.markdownPlus/conversations/conv_<id>.json
无工作区:   <userData>/conversations/conv_<id>.json
```

- 工作区根取 `fileStore.fileTree[0]?.path`（文件树根节点路径），不使用 `openedFolderPath`（其语义会被浏览子目录覆盖，见 `src/stores/file.ts:1607`）。
- 无工作区时使用 `app.getPath('userData')/conversations`。开发模式为 `%APPDATA%\markdown-plus`，打包后为 `%APPDATA%\Markdown+`（与现有 `ai-config.json` 同级）。

### 3.2 文件结构

在 `shared/ai/types.ts` 新增类型：

```ts
export interface ConversationToolSummary {
  toolCallId: string
  toolName: string
  status: string
}

export interface ConversationMeta {
  id: string              // conv_<ts36>_<rand36>
  title: string
  createdAt: number       // epoch ms
  updatedAt: number       // epoch ms
  messageCount: number
}

export interface ConversationRecord extends ConversationMeta {
  version: 1
  messages: AiConversationMessage[]   // 仅 user/assistant 文本消息，追加 createdAt
  toolSummaries: ConversationToolSummary[]
}
```

`AiConversationMessage` 保持现有结构。为记录消息时间，`ConversationRecord.messages` 使用扩展了 `createdAt?: number` 字段的消息；新建消息写入 `createdAt`，历史消息如缺失则保存为当前时间，加载时允许缺省。

**不保存**：工具结果正文、文档快照、来源内容、审批记录。恢复会话后继续对话时，模型只有历史文本消息，不自动获得之前工具读取的内容；如需文档内容，模型按需重新调用读取工具。

## 4. 存储层（主进程）

新增 `electron/ai/conversation-store.ts`，无状态文件 I/O 服务，遵循 `AiConfigService` 模式：

```ts
export class ConversationStore {
  // root 非空用 <root>/.markdownPlus/conversations，否则 <userData>/conversations
  resolveConversationsDir(root: string | null): string
  listConversations(root: string | null): ConversationMeta[]   // updatedAt 降序；损坏文件跳过
  loadConversation(root: string | null, id: string): ConversationRecord
  saveConversation(root: string | null, record: ConversationRecord): void
  deleteConversation(root: string | null, id: string): void
}
```

约束：

- 会话 id 白名单校验：仅接受 `conv_` 前缀 + `[A-Za-z0-9_]`，防止路径穿越。
- 保存为原子写：先写 `<name>.json.tmp` 再 `rename`。
- 损坏文件：`listConversations` 跳过并记录日志；`loadConversation` 抛出明确错误，由 IPC 层返回 `{ success: false, error }`。
- 目录不存在时 `listConversations` 返回空数组（不自动创建），保存时自动创建目录。
- 不设会话数量硬性上限。

## 5. IPC

### 5.1 通道（`electron/ipc/channels.ts`）

新增 `AI.CONVERSATION`：

```ts
AI: {
  ...,
  CONVERSATION: {
    LIST: 'ai:conversation:list',
    LOAD: 'ai:conversation:load',
    SAVE: 'ai:conversation:save',
    DELETE: 'ai:conversation:delete',
    SUMMARIZE: 'ai:conversation:summarize'
  }
}
```

### 5.2 Handler（`electron/ai/ipc-handlers.ts`）

- `LIST(root)` → `ConversationMeta[]`
- `LOAD(root, id)` → `ConversationRecord`
- `SAVE(root, record)` → 写文件
- `DELETE(root, id)` → 删文件
- `SUMMARIZE(text)` → `{ title: string }`，复用当前 AI 配置 + `VercelAiSdkProvider` 生成标题（见第 7 节）

所有 handler 统一返回 `{ success: boolean, data?, error? }`，与现有 AI handler 一致。主进程只做文件 I/O 与标题生成，**会话真相源在渲染进程**。

### 5.3 Preload（`electron/preload.ts`）

新增对应方法：

```ts
listAiConversations(root: string | null): Promise<ApiResult<ConversationMeta[]>>
loadAiConversation(root: string | null, id: string): Promise<ApiResult<ConversationRecord>>
saveAiConversation(root: string | null, record: ConversationRecord): Promise<ApiResult>
deleteAiConversation(root: string | null, id: string): Promise<ApiResult>
summarizeAiConversation(text: string): Promise<ApiResult<{ title: string }>>
```

## 6. 渲染进程改造

### 6.1 aiStore（`src/stores/ai.ts`）

新增状态：

- `conversations: ref<ConversationMeta[]>`
- `activeConversationId: ref<string | null>`（`null` = 新会话）
- `storageRoot: ref<string | null>`（当前工作区根）
- `conversationLoaded: ref<boolean>`
- `titleSource: ref<'truncated' | 'llm' | 'custom'>`

现有 `conversationId` 改为取 `activeConversationId`；`sendMessage` 时若无当前会话则自动新建（生成 id，写入首条用户消息，占位标题 = 前 20 字）。

新增 actions：

- `loadConversations(root)`：设置 `storageRoot`，拉取列表；若 `session.ts` 持久化的上次会话 id 存在于该列表则自动打开，否则停留在"新会话"。
- `openConversation(id)`：加载完整记录 → `messages` + `toolSummaries`。
- `newConversation()`：`activeConversationId = null`，清空消息与工具摘要。
- `deleteConversation(id)`：调删除 IPC；若删除的是当前会话则进入"新会话"。
- `renameConversation(id, title)`：更新内存标题，标记 `titleSource = 'custom'`，触发保存。
- `persistConversation()`：防抖 300ms，调 `saveAiConversation(storageRoot, record)`。

保存时机：

- 用户消息入队后。
- run 的 terminal 事件（run-completed / run-failed / run-cancelled）后。
- 工具调用状态更新后。
- 重命名后。

每次保存更新 `updatedAt` 与 `messageCount`；保存失败设置 `error` 但不中断对话。

工作区切换：

- `src/stores/file.ts` 的 `openFolder()` 成功后与 `closeFolder()` 中调用 `aiStore` 通知重新 `loadConversations`。
- 当前会话不随工作区切换迁移；切换后若会话在旧位置则进入"新会话"。

移除 `clearConversation` action 及其在 `AiPanel.vue` 中的调用。

### 6.2 session.ts（`src/stores/session.ts`）

`SessionState` 增加 `aiActiveConversationId: string | null`，用于跨重启恢复上次会话。

## 7. 会话标题生成

- **占位标题**：会话创建时取首条用户消息前 20 字符（去除首尾空白）。
- **LLM 总结**：第一条消息的 run 达到 terminal 状态后，若 `titleSource !== 'custom'`，异步调用 `SUMMARIZE` IPC 生成标题并覆盖，成功后 `titleSource = 'llm'`。
- **Prompt**：主进程用系统提示词形式，如"用不超过 20 个字概括这段对话的主题，只输出标题本身"；temperature 设为 0.3。
- **降级**：AI 配置缺失、调用失败或返回空串时，保持占位标题，不阻塞、不重试。
- **手动重命名**：右键重命名后 `titleSource = 'custom'`，此后不再被自动覆盖。

标题生成属于应用自身辅助调用，不走审批，也不进入消息历史。

## 8. UI

### 8.1 会话边栏（新增 `src/components/ai/AiConversationSidebar.vue`）

- `AiPanel.vue` 布局改为左右分栏：左侧会话边栏 + 右侧消息区。
- 边栏内容：
  - 顶部"新建会话"按钮。
  - 会话列表：标题 + 更新时间，当前项高亮。
  - 右键菜单：**重命名**、**删除**。
  - 底部显示存储位置（工作区名，无工作区时显示"未打开工作区"）。
- 右键菜单复用现有实现模式（参考 `src/components/common/EditorContextMenu.vue`）。
- 删除前用 `ConfirmDialog` 二次确认。

### 8.2 移除清空按钮

- `AiPanel.vue` 头部"清空"按钮及 `clearDisabled` 逻辑移除。
- 会话删除仅通过边栏右键菜单。

### 8.3 FileExplorer 隐藏 `.markdownPlus`

`electron/ipc/file-handlers.ts` 的 `readFolder`（约 225 行）过滤名称以 `.` 开头的目录，使 `.markdownPlus` 不出现在文件树。

## 9. 边界与默认行为

- 无工作区 ↔ 有工作区切换：不迁移会话文件，列表按位置隔离，边栏底部明示当前位置。
- 会话文件损坏：列表跳过；打开时报错提示，不崩溃。
- 关闭 AI 面板不清空会话，重开恢复原会话（沿用现状）。
- 应用退出、重启：启动时 `loadConversations` 加载列表并恢复上次会话。

## 10. 安全与隐私

- 会话文件含文档相关文本消息，存放于工作区 `.markdownPlus/`（随工作区移动/备份）或 userData，不写入渲染进程 localStorage。
- 工具结果正文、文档快照、来源内容、API Key 不持久化。
- 文件 id 白名单校验防路径穿越。
- 日志不记录消息正文。

## 11. 测试策略

### 11.1 单元测试

- `ConversationStore`：root/null 路径解析、原子写、损坏容错、列表按 updatedAt 降序、id 校验拒绝非法值、目录自动创建。
- `SUMMARIZE` handler：标题生成成功、配置缺失降级、返回空串降级。

### 11.2 aiStore 行为测试

- 新建会话（占位标题 = 首条 20 字）。
- 首条 run 完成后触发 LLM 标题覆盖；手动重命名后不再覆盖。
- 打开/删除/切换会话；删除当前会话后进入新会话。
- 防抖保存触发与失败容错。
- 工作区切换后列表刷新。

### 11.3 组件测试

- 会话边栏渲染、新建、高亮、右键重命名/删除、删除确认。
- AiPanel 不再出现"清空"按钮。

## 12. 改动清单

| 类型 | 文件 |
|---|---|
| 新增 | `electron/ai/conversation-store.ts`、`electron/ai/conversation-title.ts`、`src/components/ai/AiConversationSidebar.vue` |
| 修改 | `shared/ai/types.ts`、`electron/ipc/channels.ts`、`electron/ai/ipc-handlers.ts`、`electron/preload.ts`、`src/stores/ai.ts`、`src/stores/file.ts`、`src/stores/session.ts`、`src/components/ai/AiPanel.vue`、`electron/ipc/file-handlers.ts` |

## 13. 验证命令

```bash
npm test
npm run typecheck
npm run lint
```
