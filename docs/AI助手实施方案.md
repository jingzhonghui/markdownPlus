# Markdown+ AI 对话来源工具改造实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有“预注册材料 + 来源侧栏 + 材料 ID”流程迁移为“模型根据自然语言选择来源工具 + Main 从用户消息构建授权候选 + 每次运行时审批后读取”的安全流程，同时保留现有 AI 对话、文档读写、审批队列和运行取消能力。

**Architecture:** Renderer 只把用户原始消息、历史消息和文档快照发送到 Main，不识别、注册或读取来源。Main 从当前消息及历史中的 `role: 'user'` 消息构建不可变 `SourceAuthorizationContext`；模型只能调用 `read_web_url` 或 `read_local_file`，工具先做候选完全匹配，再创建不读取正文的类型化审批，批准后由 Main 的无状态 `SourceAccessService` 执行受限读取并把结果返回 Provider。现有 approval claim 继续只保护 Renderer 执行的文档写入；Main 执行的来源读取使用普通审批解析，不经过 Renderer claim 或 Renderer 执行结果。

**Tech Stack:** Electron 34、Node.js 20+、Vue 3.5、Pinia 2、TypeScript 5.7、Vitest 2、Vercel AI SDK Core、OpenAI-Compatible Provider、Zod 4、node-html-parser、pdf-parse、adm-zip、Vue Test Utils、jsdom、Prettier 3、ESLint 9。

**Spec:** `D:\jzh\code\markdown-plus\docs\AI助手设计方案.md`

## Global Constraints

- 本方案是现有未提交 AI 功能的聚焦迁移，不重做 Provider、AI 标签页、文档快照、文档写入和通用审批基础设施。
- Renderer 不解析 URL 或路径、不决定工具路由、不提供来源侧栏、来源清单、添加 URL、文件选择、拖放或路径转换 API；用户消息必须原样发送给模型。
- 仅扫描 `AiRunInput.message` 与 `AiRunInput.history` 中 `role: 'user'` 的内容；assistant、system、tool 消息不能授予来源权限。
- 当前调用可以精确引用当前用户消息或本会话更早的用户消息中的目标；模型发明、补全、改写、缩短、扩展或近似匹配的目标一律拒绝。
- URL 只接受边界明确、可完整解析、无用户名和密码的绝对公开 `https://` URL；网络读取继续执行 DNS 固定、逐跳重定向校验、SSRF 防护、5 MB 响应上限和超时。
- Windows 路径只接受绝对盘符路径，以及实现明确支持的绝对 UNC 路径；含空格路径优先要求成对反引号、单引号或双引号，任何边界歧义都失败关闭。
- 本地文件只允许 `.pdf`、`.md`、`.mdx`、`.txt`；不允许相对路径、目录、通配符、文件系统枚举或链接跳转。
- `read_web_url` 与 `read_local_file` 均为 `execution: 'main'`、`approval: 'always'`、`supportsRememberDecision: false`；审批拒绝、取消、过期或失败时不得发起 DNS、网络请求或文件正文读取。
- 本地文件审批预览可以在目标通过精确授权后执行 `lstat`/`stat`/`realpath` 等不读取正文的元数据检查；不得 `open`、`readFile`、解析 PDF/MDX 或读取正文。
- 来源读取批准后仍须重新做目标授权和来源安全校验；批准原始 URL 后的安全重定向目标不要求出现在消息中，但每一跳必须通过 HTTPS、DNS 固定和地址策略。
- 第一版总工具数保持 7：2 个文档读取工具、2 个来源读取工具、3 个文档写入工具。
- `ai:approval:claim` 与 `claimAiApproval()` 继续只用于 `execution.location === 'renderer'` 的文档写入；Main 来源读取由 `resolveAiApproval()` 提交普通决定，Renderer 不执行读取，也不提交执行结果。
- API Key、Authorization Header、完整请求体、Prompt、文档正文和来源正文不得写入日志。
- 默认限制保持：单运行、12 个 Tool Step、60 秒工具执行超时、5 分钟审批超时、30 秒模型首包超时、5 分钟完整请求超时、5 MB URL 响应上限、50 MB 本地文件上限、1,000,000 字符提取上限。
- 不增加持久化来源、来源 ID、向量库、OCR、搜索、任意 URL/文件访问、目录浏览、Shell 或破坏性文件工具。
- 只在实现出现用户明确批准的设计偏差时修改设计文档；正常实施以设计文档为准。
- **绝不执行 `git add`、`git commit` 或 amend。用户自行审查并提交，即使通用实施计划通常包含提交步骤，本方案也不得包含或执行提交步骤。**

---

## File Map

### Shared contracts

- Modify `shared/ai/types.ts`: remove persisted-material DTOs and snapshot IDs; add source result, inspection and approval-preview DTOs.
- Modify `shared/ai/contracts.ts`: update strict `AiRunInput` and approval-resolution Zod schemas.
- Modify `shared/ai/__tests__/contracts.test.ts`: prove removed fields fail strict validation and Main/Renderer approval payload rules remain distinct.

### Main process

- Create `electron/ai/source-authorization.ts`: conservative candidate extraction, normalization and immutable run-scoped authorization.
- Create `electron/ai/source-access-service.ts`: stateless web/file inspection and extraction migrated from `material-service.ts`.
- Create `electron/ai/tools/source-access-tools.ts`: exactly `read_web_url` and `read_local_file`.
- Modify `electron/ai/runtime.ts`: construct authorization context, register seven tools and execute Main reads only after approval.
- Modify `electron/ai/tool-registry.ts`: expose immutable source authorization through `ToolExecutionContext`.
- Modify `electron/ai/system-prompt.ts`: replace material-ID instructions with exact source-tool rules.
- Modify `electron/ai/url-policy.ts`: rename material-oriented exports where needed without weakening public-HTTPS policy.
- Modify `electron/ai/ipc-handlers.ts`, `electron/ipc/channels.ts`, `electron/preload.ts`: remove all material registration capabilities and retain run/approval ownership.
- Delete `electron/ai/tools/material-tools.ts`.
- Delete `electron/ai/material-service.ts` after its reusable extraction/security logic has moved.

### Renderer

- Modify `src/stores/ai.ts`: remove material state/actions and preserve message/run/approval race handling.
- Modify `src/utils/ai/workspace-context.ts`: remove `materialIds` from snapshot construction.
- Modify `src/components/ai/AiPanel.vue`: remove source sidebar and use full-width conversation layout.
- Modify `src/components/ai/AiApprovalDialog.vue`: add exhaustive local-file preview dispatch.
- Create `src/components/ai/approval/LocalFileReadPreview.vue`: render requested/normalized path, type, optional size and reason.
- Modify `src/components/ai/approval/NetworkRequestPreview.vue`: render the model-provided reason.
- Delete `src/components/ai/AiMaterialList.vue`.

### Tests and product docs

- Create `electron/ai/__tests__/source-authorization.test.ts`.
- Create `electron/ai/__tests__/source-access-service.test.ts` by migrating relevant security/extraction cases from `material-service.test.ts`.
- Create `electron/ai/__tests__/source-access-tools.test.ts`.
- Delete `electron/ai/__tests__/material-service.test.ts` after equivalent source-access coverage is green.
- Modify `electron/ai/__tests__/runtime.test.ts`, `ipc-handlers.test.ts`, `integration.test.ts`, `shared/ai/__tests__/contracts.test.ts`.
- Modify `src/stores/__tests__/ai.test.ts`, `ai-workflow.test.ts`, `src/utils/ai/__tests__/workspace-context.test.ts`.
- Modify `src/components/ai/__tests__/ai-panel.test.ts`, `ai-approval.test.ts`, and lifecycle mocks that implement `ElectronAPI`.
- Modify during Task 9: `docs/task.md`, `docs/开发计划.md`, `docs/需求文档.md`, `docs/代码结构文档.md`.
- Modify only after an approved implementation deviation: `docs/AI助手设计方案.md`.

## Cross-Task Interface Matrix

| Contract                                   | Defined in                         | First producer                                             | Consumers                           | Exact invariant                                                                                |
| ------------------------------------------ | ---------------------------------- | ---------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AiExecutionSnapshot`                      | Task 1, `shared/ai/types.ts`       | Task 6, `createExecutionSnapshot(fileStore)`               | Runtime and document tools          | Contains document/selection/cursor only; no source IDs or registration state                   |
| `AiRunInput`                               | Task 1                             | Task 6, `aiStore.sendMessage()`                            | Task 2 authorization and Task 5 IPC | `message` stays byte-for-byte equal to composer text; strict Zod schema rejects removed fields |
| `SourceAuthorizationContext`               | Task 2, Main-only                  | `createSourceAuthorizationContext(input)` in Runtime start | Task 4 source tools                 | Frozen context; candidate lookup is exact after shared conservative normalization              |
| `ToolExecutionContext.sourceAuthorization` | Task 2/4                           | `AiRuntime.start()`                                        | `read_web_url`, `read_local_file`   | Same run-scoped object is used for preview and post-approval execution                         |
| `WebSourceReadResult`                      | Task 1                             | `SourceAccessService.readWebUrl()`                         | `read_web_url` Provider result      | Includes approved original URL, final URL, extracted content metadata and bounded chunks       |
| `LocalFileInspection`                      | Task 1                             | `SourceAccessService.inspectLocalFile()`                   | local-file approval preview         | Metadata only; no open/read/parse before approval                                              |
| `LocalFileReadResult`                      | Task 1                             | `SourceAccessService.readLocalFile()`                      | `read_local_file` Provider result   | Includes normalized path, type, content, bounded chunks and truncation state                   |
| `ApprovalPreview.local-file-read`          | Task 1                             | Task 4 source tool                                         | Task 7 approval UI                  | Required reason; optional size; requested and normalized path both visible                     |
| Main approval resolution                   | Existing API, clarified Task 4/5/7 | Renderer `resolveAiApproval(id, approved)`                 | Runtime Main execution              | No claim and no Renderer execution result                                                      |
| Renderer approval claim                    | Existing API, retained Task 5/7    | `aiStore.resolveApproval()` for document writes            | Runtime document operation bridge   | Claim occurs exactly once before Renderer applies write and returns result                     |

---

### Task 1: Replace Material Contracts with Source Result Contracts

**Files:**

- Modify: `shared/ai/types.ts`
- Modify: `shared/ai/contracts.ts`
- Modify: `shared/ai/__tests__/contracts.test.ts`

**Interfaces:**

- Consumes: existing `AiRunInput`, `AiExecutionSnapshot`, `ApprovalPreview`, `ToolExecutionResult` and approval-resolution IPC shape.
- Produces:

```ts
export interface SourceChunk {
  index: number
  content: string
  startOffset: number
  endOffset: number
}

export interface WebSourceReadResult {
  url: string
  finalUrl: string
  title: string
  content: string
  contentType: string
  chunks: SourceChunk[]
  truncated: boolean
}

export type LocalFileType = 'pdf' | 'markdown' | 'mdx' | 'text'

export interface LocalFileInspection {
  requestedPath: string
  normalizedPath: string
  fileType: LocalFileType
  size?: number
}

export interface LocalFileReadResult extends LocalFileInspection {
  content: string
  chunks: SourceChunk[]
  truncated: boolean
}

export type ApprovalPreview =
  | { type: 'markdown-diff'; title: string; before: string; after: string }
  | { type: 'document'; title: string; content: string }
  | { type: 'network-request'; method: string; url: string; reason?: string; bodySummary?: string }
  | {
      type: 'local-file-read'
      requestedPath: string
      normalizedPath: string
      fileType: LocalFileType
      size?: number
      reason: string
    }
```

- Removes: `AiMaterial`, `AiMaterialChunk`, `AiExecutionSnapshot.materialIds`, and material-specific error codes when no remaining caller uses them.
- Replaces error codes with exact design codes: `SOURCE_NOT_AUTHORIZED`, `SOURCE_AMBIGUOUS`, `SOURCE_INVALID`, `SOURCE_TOO_LARGE`, `SOURCE_POLICY_BLOCKED`.

- [ ] **Step 1: Write strict contract tests before changing types**

Add cases equivalent to:

```ts
it('accepts a run without registered source IDs', () => {
  expect(
    aiRunInputSchema.parse({
      conversationId: 'conv-1',
      message: '总结 https://example.com/report',
      history: [],
      snapshot: {
        conversationId: 'conv-1',
        activeDocument: null,
        selection: null,
        cursor: null
      }
    }).message
  ).toBe('总结 https://example.com/report')
})

it('rejects legacy materialIds because the snapshot is strict', () => {
  expect(() =>
    aiRunInputSchema.parse({
      conversationId: 'conv-1',
      message: 'hello',
      history: [],
      snapshot: {
        conversationId: 'conv-1',
        activeDocument: null,
        selection: null,
        cursor: null,
        materialIds: ['legacy-id']
      }
    })
  ).toThrow()
})
```

Also assert that `approvalResolutionSchema` accepts an approved Main decision without `result`, accepts an approved Renderer decision payload with a valid `applied|conflict|failed` result at the runtime layer, and rejects a result attached to rejected/cancelled/expired decisions.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npx vitest run shared/ai/__tests__/contracts.test.ts
```

Expected RED: the no-`materialIds` snapshot fails because the current schema requires it, while the legacy-field rejection fails because the current schema accepts it.

- [ ] **Step 3: Replace the shared DTOs and strict schemas**

Remove material DTOs and `materialIds`; add the source DTOs and preview union exactly as defined above. Keep `network-request.reason` distinct from `bodySummary`. Update `aiRunInputSchema` so its strict snapshot contains only `runId?`, `conversationId`, `activeDocument`, `selection`, and `cursor`.

Do not add source candidates to shared IPC: authorization is derived in Main and must not be trusted from Renderer.

- [ ] **Step 4: Run focused tests and typecheck to expose downstream migration work**

Run:

```powershell
npx vitest run shared/ai/__tests__/contracts.test.ts
npm run typecheck:node
npm run typecheck:web
```

Expected GREEN/RED boundary: contract tests pass. Both typechecks are expected to remain RED only at existing material callers (`material-service`, material tools, preload, store, workspace tests), creating the explicit migration list for Tasks 2-7; there must be no unrelated type error.

---

### Task 2: Build Run-Scoped User-Source Authorization

**Files:**

- Create: `electron/ai/source-authorization.ts`
- Create: `electron/ai/__tests__/source-authorization.test.ts`
- Modify: `electron/ai/tool-registry.ts`

**Interfaces:**

- Consumes: `Pick<AiRunInput, 'message' | 'history'>`.
- Produces:

```ts
export interface SourceAuthorizationContext {
  readonly webUrls: readonly string[]
  readonly localFiles: readonly string[]
  authorizeWebUrl(input: string): string | null
  authorizeLocalFile(input: string): string | null
}

export function normalizeAuthorizedWebUrl(input: string): string | null
export function normalizeAuthorizedLocalPath(input: string): string | null
export function createSourceAuthorizationContext(
  input: Pick<AiRunInput, 'message' | 'history'>
): SourceAuthorizationContext
```

`authorize*()` returns the canonical candidate only on exact normalized match; `null` means unauthorized or invalid. The implementation freezes copied candidate arrays and the returned object; callers cannot mutate run authorization.

`ToolExecutionContext` becomes:

```ts
export interface ToolExecutionContext {
  snapshot: AiExecutionSnapshot
  sourceAuthorization: SourceAuthorizationContext
  abortSignal?: AbortSignal
}
```

- [ ] **Step 1: Write URL extraction and normalization tests**

Cover exact cases:

```ts
expect(context.webUrls).toEqual(['https://example.com/report?a=1'])
expect(context.authorizeWebUrl('https://example.com/report?a=1')).toBe(
  'https://example.com/report?a=1'
)
expect(context.authorizeWebUrl('https://example.com/report?a=2')).toBeNull()
```

Input fixtures must prove:

- protocol/host case, IDN ASCII serialization, default `:443` removal and dot-segment resolution normalize deterministically;
- query values are not reordered or decoded into broader equivalence;
- `http:`, relative URLs, credentials, missing protocol, trailing-boundary ambiguity and malformed percent encoding are rejected;
- a URL present only in assistant/system/tool history does not enter `webUrls`;
- a URL from an earlier user message remains authorized in the same input history;
- a model-modified subpath, parent path, same-origin URL or changed query is rejected.

- [ ] **Step 2: Write Windows path extraction and normalization tests**

Use stable string literals rather than the host filesystem:

```ts
const input = {
  message: '读取 `C:\\Docs\\Quarterly Report.pdf`',
  history: [{ id: 'u1', role: 'user' as const, content: '也可参考 "D:\\Notes\\plan.md"' }]
}
const context = createSourceAuthorizationContext(input)
expect(context.authorizeLocalFile('c:/Docs/Quarterly Report.pdf')).toBe(
  'C:\\Docs\\Quarterly Report.pdf'
)
expect(context.authorizeLocalFile('C:\\Docs\\Other Report.pdf')).toBeNull()
```

Cover paired backticks/single quotes/double quotes, absolute drive paths, `.`/`..`, slash normalization, drive-letter casing, supported `\\server\share\file.txt` UNC paths, and rejection of relative paths, environment variables, wildcards, directories implied by a trailing separator, unmatched quotes and unquoted ambiguous paths containing spaces. Test that a prior user path is accepted, while assistant-only and model-modified paths are rejected.

- [ ] **Step 3: Run authorization tests and verify RED**

Run:

```powershell
npx vitest run electron/ai/__tests__/source-authorization.test.ts
```

Expected RED: module import fails because `source-authorization.ts` does not exist.

- [ ] **Step 4: Implement conservative candidate parsing**

Parse only current `message` plus `history.filter(role === 'user')`. Use `URL` for canonical HTTPS serialization and `path.win32` for path normalization. Candidate extraction validates but never routes tools, never invokes `SourceAccessService`, never creates approvals and never sends candidate arrays to the model.

For boundaries, accept a complete URL token only when surrounding message characters make one unique parse possible. Accept whitespace-containing paths only inside paired delimiters unless a deterministic terminal delimiter makes the endpoint unique; otherwise omit the candidate. Deduplicate canonical values while retaining first-seen order.

- [ ] **Step 5: Freeze authorization and expose it in tool context**

Return frozen arrays and `Object.freeze(context)`. Add the required `sourceAuthorization` field to `ToolExecutionContext`; update test fixtures temporarily with `createSourceAuthorizationContext({ message: '', history: [] })` rather than unsafe casts.

- [ ] **Step 6: Run focused tests and node typecheck**

Run:

```powershell
npx vitest run electron/ai/__tests__/source-authorization.test.ts electron/ai/__tests__/tool-registry.test.ts
npm run typecheck:node
```

Expected GREEN/RED boundary: authorization tests pass. Node typecheck may remain RED only where Runtime has not yet supplied `sourceAuthorization` and legacy material code still references removed DTOs; authorization and registry files must be clean.

---

### Task 3: Refactor Material Storage into Stateless Source Access

**Files:**

- Create: `electron/ai/source-access-service.ts`
- Modify: `electron/ai/url-policy.ts`
- Create: `electron/ai/__tests__/source-access-service.test.ts`
- Delete after migration: `electron/ai/material-service.ts`
- Delete after migration: `electron/ai/__tests__/material-service.test.ts`
- Reuse fixtures: `electron/ai/__tests__/fixtures/sample.pdf`, `sample.mdx`

**Interfaces:**

- Consumes: `WebSourceReadResult`, `LocalFileInspection`, `LocalFileReadResult`, `LocalFileType`, `SourceChunk`.
- Produces:

```ts
export interface SourceAccessDeps {
  dnsResolve?: (host: string) => Promise<readonly { address: string }[]>
  requestImpl?: (url: string, address: string, signal: AbortSignal) => Promise<Response>
  fileSystem?: SourceFileSystem
}

export class SourceAccessError extends Error {
  constructor(readonly code: AiErrorCode, message: string)
}

export class SourceAccessService {
  constructor(deps?: SourceAccessDeps, options?: SourceAccessOptions)
  readWebUrl(url: string, signal: AbortSignal): Promise<WebSourceReadResult>
  inspectLocalFile(filePath: string): Promise<LocalFileInspection>
  readLocalFile(filePath: string, signal: AbortSignal): Promise<LocalFileReadResult>
}
```

There is no UUID, `Map`, `list`, `has`, `remove`, `clear`, `dispose`, registered-source state or material ID.

- [ ] **Step 1: Migrate tests to the stateless API and add metadata-only assertions**

Replace `addUrl()` assertions with `readWebUrl(url, signal)` and `addFile()` assertions with `readLocalFile(path, signal)`. Keep tests for pinned DNS, public IP filtering, redirects, response-size streaming limit, timeout/abort, script/style/noscript removal, PDF header/OCR behavior, UTF-8 Markdown/text, MDX extraction, ZIP traversal/entry/ratio/size limits, extracted-text limit and bounded chunks.

Add an injected filesystem spy:

```ts
await service.inspectLocalFile('C:\\Docs\\report.pdf')
expect(fs.lstat).toHaveBeenCalled()
expect(fs.stat).toHaveBeenCalled()
expect(fs.realpath).toHaveBeenCalled()
expect(fs.open).not.toHaveBeenCalled()
expect(fs.readFile).not.toHaveBeenCalled()
```

Add failures for directory, unsupported extension, symlink/junction/reparse simulation, requested/final path mismatch, pre-open/post-open identity mismatch, oversized file and binary data masquerading as `.txt`/`.md`.

- [ ] **Step 2: Run the new service test and verify RED**

Run:

```powershell
npx vitest run electron/ai/__tests__/source-access-service.test.ts
```

Expected RED: import fails because `source-access-service.ts` does not exist.

- [ ] **Step 3: Move reusable web extraction without storage**

Preserve the existing `https.request` pinned lookup, TLS hostname behavior, manual redirect loop and per-hop URL/IP validation. Rename `validateMaterialUrl` to `validatePublicHttpsUrl` if no external caller requires the old name. `readWebUrl()` returns content directly and records both the approved original `url` and safe `finalUrl`; it never registers or caches the response.

- [ ] **Step 4: Split local metadata inspection from body reading**

`inspectLocalFile()` performs only normalization, extension/type inference, `lstat`, non-directory check, size check and `realpath` equality. It must not call `open`, `readFile`, `PDFParse`, `AdmZip#getData` or any content parser.

Production protection must use capabilities Node exposes reliably: reject `lstat.isSymbolicLink()`, reject a canonical `realpath` that differs from the approved normalized path, open only after approval, compare pre-open metadata with handle `stat()` metadata, and re-check canonical path/identity before parsing. For Windows junction/reparse behavior, add injected metadata tests that fail closed when the implementation reports a link/reparse or cannot preserve approved-path identity; do not claim Node can identify every arbitrary Windows reparse tag when its APIs cannot. The security invariant is no path redirection to a different target, not an unsupported promise about enumerating all reparse tags.

- [ ] **Step 5: Implement bounded post-approval reads**

Use the opened handle and abort signal for raw bytes. Validate PDF `%PDF-`, MDX ZIP structure and entry paths before extraction, reject NUL-heavy/binary text, and enforce 50 MB raw, bounded ZIP entries/ratio/total, and 1,000,000 extracted characters. Produce immutable copied `SourceChunk[]` around 10,000 characters and explicit `truncated` state; never silently drop content.

- [ ] **Step 6: Run service tests and node typecheck**

Run:

```powershell
npx vitest run electron/ai/__tests__/source-access-service.test.ts
npm run typecheck:node
```

Expected GREEN/RED boundary: service tests pass. Node typecheck may remain RED only in Runtime/IPC imports of deleted `MaterialService` and material tools, which Task 4/5 removes.

- [ ] **Step 7: Delete legacy service and old tests only after parity is green**

Delete `electron/ai/material-service.ts` and `electron/ai/__tests__/material-service.test.ts`. Scan `electron/ai` for `MaterialService`, `AiMaterialError`, `addUrl`, `addFile`, `readChunks` and registered-source maps; expected remaining matches are only files explicitly scheduled for deletion or migration in Tasks 4-5.

---

### Task 4: Add Approved Main-Executed Source Tools and Wire Runtime

**Files:**

- Create: `electron/ai/tools/source-access-tools.ts`
- Create: `electron/ai/__tests__/source-access-tools.test.ts`
- Modify: `electron/ai/runtime.ts`
- Modify: `electron/ai/tool-registry.ts`
- Modify: `electron/ai/system-prompt.ts`
- Modify: `electron/ai/__tests__/runtime.test.ts`
- Delete: `electron/ai/tools/material-tools.ts`

**Interfaces:**

- Consumes: `SourceAuthorizationContext`, `SourceAccessService`, source result DTOs and existing `ToolDefinition` policy flow.
- Produces:

```ts
export interface SourceAccessToolRegistry {
  readWebUrl: ToolDefinition<{ url: string; reason: string }, WebSourceReadResult>
  readLocalFile: ToolDefinition<{ path: string; reason: string }, LocalFileReadResult>
}

export function createSourceAccessTools(service: SourceAccessService): SourceAccessToolRegistry
```

`AiRuntimeDeps.materialService` is replaced by `sourceAccessService: SourceAccessService`.

- [ ] **Step 1: Write source-tool authorization and preview tests**

For `read_web_url`, assert schema `{ url: z.string().min(1), reason: z.string().trim().min(1) }`, `execution: 'main'`, network/always/medium/no-memory policy, and exact preview:

```ts
{
  type: 'network-request',
  method: 'GET',
  url: 'https://example.com/report',
  reason: '总结报告'
}
```

For `read_local_file`, assert read/always/medium/no-memory policy and exact `local-file-read` preview from `inspectLocalFile()`. Verify unauthorized targets reject before `inspectLocalFile()`, DNS or any body access.

- [ ] **Step 2: Write Runtime ordering tests before implementation**

Use spies for `inspectLocalFile`, `readLocalFile`, `readWebUrl`, and DNS request dependencies. Assert:

- `createApprovalPreview` is invoked before Main `execute` by current `executeWithPolicy()` flow;
- authorization validation occurs at the first line of source preview creation, before local metadata inspection;
- web preview performs no DNS/request work;
- local preview performs only `inspectLocalFile`, never `readLocalFile`;
- rejected, cancelled and expired approvals produce zero `readWebUrl`/`readLocalFile` calls;
- approved Main reads call the service once and their completed result reaches Provider;
- a Main approval is resolved without `claimApproval()` and without a Renderer result;
- execution repeats exact target authorization immediately before service access.

- [ ] **Step 3: Run source-tool and Runtime tests and verify RED**

Run:

```powershell
npx vitest run electron/ai/__tests__/source-access-tools.test.ts electron/ai/__tests__/runtime.test.ts
```

Expected RED: source tools are absent, Runtime still registers material tools, and the tool set is not the required seven names.

- [ ] **Step 4: Implement exactly two source tools**

At the start of both `createApprovalPreview` and `execute`, call the matching `context.sourceAuthorization.authorize*()` and throw `SourceAccessError('SOURCE_NOT_AUTHORIZED', ...)` on `null`. Use the returned canonical target, never the raw model argument, for every security decision, metadata query and read. A local preview may preserve `input.path` only as inert display text in `requestedPath`; `normalizedPath`, inspection and execution all use the canonical authorized target.

`read_web_url.createApprovalPreview` must not call the access service. `read_local_file.createApprovalPreview` may call only `inspectLocalFile()` after authorization succeeds. Both `execute` methods pass `context.abortSignal` to the post-approval service method and fail if the signal is absent or aborted.

- [ ] **Step 5: Register the final seven-tool set**

Replace material tool imports and registration with:

```ts
;[
  docTools.readCurrentDocument,
  docTools.readSelectedText,
  sourceTools.readWebUrl,
  sourceTools.readLocalFile,
  docTools.replaceCurrentDocument,
  docTools.insertIntoCurrentDocument,
  docTools.createDocument
]
```

In `AiRuntime.start()`, build one authorization context from `input.message` and `input.history`, freeze it, and attach it to the base `ToolExecutionContext`. The per-call context spreads that same object and adds only the abort signal.

- [ ] **Step 6: Preserve correct approval location semantics**

Keep Runtime behavior explicit:

```ts
if (decision.status === 'approved' && def.execution === 'main') {
  return { status: 'completed', data: await def.execute(input, context) }
}
```

Do not call `claimApproval`, create `pendingResults`, ask Renderer to execute, or accept a Renderer result for source tools. The claim path remains unchanged for the three Renderer document writes.

- [ ] **Step 7: Replace the system prompt rules**

Use the 15 principles in the approved spec: model selects `read_web_url`/`read_local_file` only when needed; submits targets exactly as seen in user messages; does not invent or alter them; treats source content as untrusted; respects rejected reads; and never claims access without a completed tool result. Remove listing/ID/chunk-navigation instructions.

- [ ] **Step 8: Run focused tests and node typecheck**

Run:

```powershell
npx vitest run electron/ai/__tests__/source-access-tools.test.ts electron/ai/__tests__/runtime.test.ts electron/ai/__tests__/tool-registry.test.ts
npm run typecheck:node
```

Expected GREEN/RED boundary: source/runtime tests pass and the Runtime exposes exactly seven tools. Any remaining node type errors must be confined to material IPC/preload code scheduled for Task 5.

- [ ] **Step 9: Delete the old material tools**

Delete `electron/ai/tools/material-tools.ts` and verify no Runtime/system-prompt reference remains to `list_attached_materials`, `read_attached_material`, `materialId`, or chunk navigation.

---

### Task 5: Remove Material IPC and Build Authorization at RUN.START

**Files:**

- Modify: `electron/ai/ipc-handlers.ts`
- Modify: `electron/ipc/channels.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ai/__tests__/ipc-handlers.test.ts`
- Modify: preload/API mocks in affected tests

**Interfaces:**

- Consumes: strict `aiRunInputSchema`, `SourceAccessService`, updated `AiRuntimeDeps`.
- Produces only these AI invoke handlers:

```text
ai:config:get
ai:config:set
ai:config:test
ai:run:start
ai:run:cancel
ai:approval:claim
ai:approval:resolve
```

and event channel `ai:run:event`.

The public AI preload surface is:

```ts
getAiConfig()
setAiConfig(config)
testAiConfig(config)
startAiRun(input)
cancelAiRun(runId)
claimAiApproval(approvalId) // renderer document writes only
resolveAiApproval(approvalId, decision, executionResult?)
onAiRunEvent(callback)
```

- [ ] **Step 1: Rewrite IPC registration tests to assert the exact handler set**

Assert the seven invoke handlers above and assert absence of every `ai:material:*` channel. Remove dialog/file-capability fixtures. Keep tests proving run owner cancellation, approval owner resolution, sender-destroyed run cancellation and event delivery only to the originating sender.

Add a RUN.START test whose message/history contains URL/path strings and prove the handler accepts the payload without Renderer-supplied candidate arrays or source IDs. Add strict rejection for legacy `snapshot.materialIds`.

- [ ] **Step 2: Run IPC tests and verify RED**

Run:

```powershell
npx vitest run electron/ai/__tests__/ipc-handlers.test.ts
```

Expected RED: 13 current handlers are registered and the removed material APIs/channels still exist.

- [ ] **Step 3: Remove material channels, preload APIs and ownership state**

Delete `AI.MATERIAL`, all add/choose/drop/remove/clear handlers, `materialFileCapabilities`, `materialOwners`, material cleanup, `dialog`, `webUtils`, path conversion and material DTO imports. Renderer must receive no generic or AI-specific local path API for source access.

- [ ] **Step 4: Simplify Runtime creation and RUN.START**

Create one stateless `SourceAccessService` dependency for Runtime construction. `AI.RUN.START` parses `AiRunInput` with Zod and calls Runtime; Runtime derives authorization only from parsed user messages. Do not derive candidates in Renderer and do not accept them through IPC.

Retain `runOwners`, `approvalOwners`, `approvalRuns`, sender observation and cleanup. Keep `AI.APPROVAL.CLAIM` because Renderer document writes still require it; Runtime itself rejects claims for `execution.location === 'main'`.

- [ ] **Step 5: Tighten approval resolution tests**

Prove owner-only behavior for both locations:

- Main source approval: owner calls resolve with `{ status: 'approved', scope: 'once' }`, no prior claim and no execution result.
- Renderer document approval: owner must claim first and provide the actual `applied|conflict|failed` result.
- A result supplied for Main execution fails.
- A non-owner cannot claim or resolve either approval.

- [ ] **Step 6: Run IPC tests and full typecheck**

Run:

```powershell
npx vitest run electron/ai/__tests__/ipc-handlers.test.ts shared/ai/__tests__/contracts.test.ts
npm run typecheck
```

Expected GREEN/RED boundary: IPC/contract tests and node typecheck pass. Web typecheck may remain RED only at Renderer material state/components scheduled for Task 6.

---

### Task 6: Remove Renderer Material State and Sidebar

**Files:**

- Modify: `src/stores/ai.ts`
- Modify: `src/utils/ai/workspace-context.ts`
- Modify: `src/components/ai/AiPanel.vue`
- Modify: `src/components/ai/AiComposer.vue` only if copy/placeholder needs source guidance
- Delete: `src/components/ai/AiMaterialList.vue`
- Modify: `src/stores/__tests__/ai.test.ts`
- Modify: `src/stores/__tests__/ai-workflow.test.ts`
- Modify: `src/utils/ai/__tests__/workspace-context.test.ts`
- Modify: `src/components/ai/__tests__/ai-panel.test.ts`
- Modify: AI lifecycle/preload mocks implementing `ElectronAPI`

**Interfaces:**

- Consumes: reduced preload API and `AiExecutionSnapshot` without `materialIds`.
- Produces:

```ts
export function createExecutionSnapshot(fileStore: FileStore): AiExecutionSnapshot
```

`aiStore.sendMessage(text)` passes `message: text` unchanged and excludes the newly appended user message from `history`, as today.

- [ ] **Step 1: Rewrite Store tests around source-free Renderer state**

Remove material factories and API mocks. Assert `clearConversation()` clears messages, tool calls and approvals but invokes no source IPC. Preserve tests for start-request races, terminal event arriving before `startAiRun()` resolves, cancellation, stale run-event rejection, close confirmation and approval resolution deduplication.

Add:

```ts
await store.sendMessage('结合 `C:\\Docs\\Quarterly Report.pdf` 与 https://example.com/a?x=1 总结')
expect(electronApi.startAiRun).toHaveBeenCalledWith(
  expect.objectContaining({
    message: '结合 `C:\\Docs\\Quarterly Report.pdf` 与 https://example.com/a?x=1 总结'
  })
)
```

Assert no URL/path replacement, tokenization, attachment object or snapshot source ID is introduced.

- [ ] **Step 2: Rewrite workspace and panel tests**

Assert `createExecutionSnapshot(fileStore)` returns only conversation/document/selection/cursor fields. In `ai-panel.test.ts`, assert absence of source sidebar, source list, add URL button, file picker, drop zone and legacy component; assert the conversation workbench occupies the panel width and existing send/stop/settings/clear behavior remains.

- [ ] **Step 3: Run Renderer tests and verify RED**

Run:

```powershell
npx vitest run src/stores/__tests__/ai.test.ts src/stores/__tests__/ai-workflow.test.ts src/utils/ai/__tests__/workspace-context.test.ts src/components/ai/__tests__/ai-panel.test.ts
```

Expected RED: Store still exposes materials/actions, snapshot requires IDs, and `AiPanel` still mounts `AiMaterialList`.

- [ ] **Step 4: Remove source registration state and methods**

Delete `materials`, `addUrlMaterial`, `addFileMaterial`, `removeMaterial`, all material errors and `clearAiMaterials()` calls. Keep conversation ID lifecycle, messages, tool cards, run state, pending approvals and all existing race guards unchanged.

Change `createExecutionSnapshot(fileStore, materialIds)` to `createExecutionSnapshot(fileStore)` and remove `materialIds` from both no-document and document branches.

- [ ] **Step 5: Make AiPanel a full-width conversation view**

Remove `AiMaterialList` import/rendering, pending-material bookkeeping and sidebar CSS. Keep `AiComposer` as plain text input; optional placeholder copy may mention pasting a public HTTPS URL or quoted absolute path, but it must not parse input or imply pre-reading.

- [ ] **Step 6: Delete the legacy sidebar component and stale mocks**

Delete `src/components/ai/AiMaterialList.vue`. Remove `addAiUrlMaterial`, file chooser/drop registration, add/remove/clear methods from every test `ElectronAPI` mock.

- [ ] **Step 7: Run focused tests, web typecheck and focused lint**

Run:

```powershell
npx vitest run src/stores/__tests__/ai.test.ts src/stores/__tests__/ai-workflow.test.ts src/utils/ai/__tests__/workspace-context.test.ts src/components/ai/__tests__/ai-panel.test.ts
npm run typecheck:web
npx eslint src/stores/ai.ts src/utils/ai/workspace-context.ts src/components/ai/AiPanel.vue src/components/ai/AiComposer.vue
```

Expected GREEN: all commands exit 0. The exact natural-language message reaches `startAiRun()` unchanged and no Renderer source-registration API remains.

---

### Task 7: Add Local-File Approval Preview and Preserve Execution Sequencing

**Files:**

- Create: `src/components/ai/approval/LocalFileReadPreview.vue`
- Modify: `src/components/ai/approval/NetworkRequestPreview.vue`
- Modify: `src/components/ai/AiApprovalDialog.vue`
- Modify: `src/components/ai/__tests__/ai-approval.test.ts`
- Modify: `src/stores/__tests__/ai.test.ts` approval cases

**Interfaces:**

- Consumes: updated `ApprovalPreview` union and existing `ToolApprovalRequest.execution` discriminator.
- Produces: exhaustive preview validation/rendering for `markdown-diff`, `document`, `network-request`, `local-file-read`; unsupported/malformed payloads fail closed.

- [ ] **Step 1: Write malformed and rendering tests**

Assert a valid local preview displays requested path, normalized path, file type, formatted optional byte size and reason. Assert network preview displays `GET`, URL and reason. Pass malformed variants missing `reason`, using non-number `size`, or unknown `type`; assert the dialog shows the unsupported message and no Allow button.

- [ ] **Step 2: Write location-specific approval sequencing tests**

For `execution: { location: 'main' }`, clicking Allow must call only:

```ts
resolveApproval(id, { status: 'approved', scope: 'once' })
```

and must not claim, call `applyDocumentOperation` or fabricate a completed result. For Renderer document writes, retain claim -> apply -> resolve with actual result. Rejection for either location sends only rejected decision and performs no operation.

- [ ] **Step 3: Run approval tests and verify RED**

Run:

```powershell
npx vitest run src/components/ai/__tests__/ai-approval.test.ts src/stores/__tests__/ai.test.ts
```

Expected RED: `local-file-read` is unsupported and network reason is not rendered.

- [ ] **Step 4: Implement typed local preview and exhaustive validation**

Add strict runtime field checks in `validPreview()`, render `LocalFileReadPreview`, and extend the `switch` with a `local-file-read` branch plus `never` exhaustiveness. Do not dynamically resolve a component from model-provided names.

- [ ] **Step 5: Keep Main and Renderer approval paths separate**

Do not add source-specific Store execution. Existing `aiStore.resolveApproval()` already claims only when `approval.execution.location === 'renderer'`; retain and test this discriminator. Main source execution remains invisible to Renderer after the decision and returns through normal tool/run events.

- [ ] **Step 6: Run focused tests, web typecheck and focused lint**

Run:

```powershell
npx vitest run src/components/ai/__tests__/ai-approval.test.ts src/stores/__tests__/ai.test.ts
npm run typecheck:web
npx eslint src/components/ai/AiApprovalDialog.vue src/components/ai/approval/LocalFileReadPreview.vue src/components/ai/approval/NetworkRequestPreview.vue src/stores/ai.ts
```

Expected GREEN: all commands exit 0; malformed previews cannot be approved; Main approvals never invoke Renderer claim/execution.

---

### Task 8: Replace Material Integration Tests with Source Security Workflows

**Files:**

- Modify: `electron/ai/__tests__/integration.test.ts`
- Modify: `electron/ai/__tests__/runtime.test.ts`
- Modify: `src/stores/__tests__/ai-workflow.test.ts`
- Modify implementation files only when a failing integration case demonstrates a concrete defect

**Interfaces:**

- Consumes: complete Runtime, source authorization/tools/service, approval manager, Provider adapter contract, reduced preload API and AI Store.
- Produces: cross-layer evidence that model selection never bypasses Main authorization or user approval.

- [ ] **Step 1: Add an approved web-source continuation test**

Script Provider to receive the natural user message, invoke `read_web_url` with the exact URL, wait for `approval-required`, resolve once, receive `ToolExecutionResult<WebSourceReadResult>`, then emit final text. Assert in order:

1. No DNS/request before approval.
2. Preview is `GET` plus original canonical URL and reason.
3. Approved resolution uses no claim/result.
4. Pinned public HTTPS request occurs after approval.
5. Extracted result reaches Provider before final text.

- [ ] **Step 2: Add an approved local-file continuation test**

Use an injected filesystem and parser fixture. Assert exact candidate match, metadata-only preview before approval, no body read before approval, post-approval open/identity/signature/size checks, bounded extracted result returned to Provider, and final model continuation.

- [ ] **Step 3: Add zero-access terminal-path tests**

Parameterize `rejected`, `cancelled`, expired approval and run cancellation. For both source tools assert zero DNS, request, open, read and parser calls. Assert Provider receives `rejected` or `cancelled` rather than source content.

- [ ] **Step 4: Add unauthorized target tests**

Cover model-invented URL/path, modified query/subpath, assistant-only target, relative path, ambiguous unquoted path and credentialed URL. Assert `status: 'failed'` with source authorization/policy message, no `approval-required` event, no metadata inspection and no access. Add the positive control that an exact target from an earlier user history message is accepted and proceeds to approval.

- [ ] **Step 5: Add redirect and local-file policy regressions**

Web cases: safe HTTPS redirect succeeds although redirect target was not in the user message; HTTP downgrade, credential redirect, private/loopback/link-local/metadata DNS and redirect limits fail.

Local cases: unsupported extension, directory, oversize, symlink/junction/reparse simulation, realpath mismatch, identity race, bad PDF signature, binary text, unsafe MDX entry and ZIP limits fail before content is returned. Do not keep old tests that imply registration itself authorizes access or that unknown IDs are the security boundary.

- [ ] **Step 6: Add privacy-log regression**

Spy on `console.log/info/warn/error` during successful and failed source runs. Assert serialized calls exclude API key, Authorization header, complete request body, user Prompt, document body and extracted source body; status/tool/error-code metadata may remain.

- [ ] **Step 7: Run integration tests and verify RED before fixes**

Run:

```powershell
npx vitest run electron/ai/__tests__/integration.test.ts electron/ai/__tests__/runtime.test.ts src/stores/__tests__/ai-workflow.test.ts
```

Expected RED: each newly added workflow must fail for a specific missing ordering/security behavior before its minimal implementation fix; no test may be weakened to accept pre-approval access.

- [ ] **Step 8: Apply only evidence-driven fixes and rerun**

Make the smallest implementation changes demonstrated by failures. Re-run the same command until GREEN. Confirm the suite contains no test names or fixtures asserting preregistered source behavior, source IDs, source sidebars or registration-based authorization.

---

### Task 9: Align Product Documentation and Perform Final Verification

**Files:**

- Modify: `docs/task.md`
- Modify: `docs/开发计划.md`
- Modify: `docs/需求文档.md`
- Modify: `docs/代码结构文档.md`
- Modify only for a user-approved implementation deviation: `docs/AI助手设计方案.md`
- Verify, do not modify for this task unless implementation requires it: all files changed in Tasks 1-8

**Interfaces:**

- Consumes: verified behavior and final source/tool/API names.
- Produces: product documentation consistent with the approved design and an auditable verification record for user review.

- [ ] **Step 1: Update task and product requirements**

State that users enter public HTTPS URLs or quoted Windows absolute paths naturally in chat; the model selects a read tool; Main validates exact user-message authorization; each read requires one-time approval; and approved content is sent to the configured third-party model. Remove source-registration/sidebar/file-picker instructions and claims that registration preloads or authorizes content.

- [ ] **Step 2: Update development plan and code structure**

Document `source-authorization.ts`, stateless `source-access-service.ts`, `source-access-tools.ts`, the seven-tool set, Main-vs-Renderer approval execution split and `LocalFileReadPreview.vue`. Remove deleted files and material IPC/preload APIs from diagrams and file trees.

- [ ] **Step 3: Scan for stale implementation terminology**

Run:

```powershell
$stale = 'AiMaterial|materialIds|MaterialService|material-tools|list_attached_materials|read_attached_material|addAiUrlMaterial|addAiFileMaterial|chooseAiMaterialFiles|registerDroppedAiFile|removeAiMaterial|clearAiMaterials|AI\.MATERIAL|AiMaterialList'
$scanFiles = @(
  Get-ChildItem shared,electron,src -Recurse -File
  Get-Item docs/task.md,docs/开发计划.md,docs/需求文档.md,docs/代码结构文档.md
)
$staleMatches = $scanFiles | Select-String -Pattern $stale
if ($staleMatches) { $staleMatches; throw '发现遗留材料实现术语' }
```

Expected: no matches. The migration plan is intentionally excluded because it must name deleted files and removed interfaces; current product and architecture docs must have none.

- [ ] **Step 4: Scan for placeholders and contract drift**

Run:

```powershell
$placeholderPattern = @(
  'TB' + 'D'
  'TO' + 'DO'
  'implement' + '\s+later'
  'fill' + '\s+in\s+details'
  '后续' + '补充'
  '待' + '实现'
) -join '|'
$placeholderMatches = Select-String -Path docs/AI助手实施方案.md -Pattern $placeholderPattern
if ($placeholderMatches) { $placeholderMatches; throw '实施方案包含占位符' }
$contracts = Get-ChildItem shared,electron,src,docs -Recurse -File |
  Select-String -Pattern 'read_web_url|read_local_file|SourceAuthorizationContext|SourceAccessService|LocalFileReadPreview'
$contracts
```

Expected: placeholder scan has no matches. Contract scan shows exactly the names defined in the interface matrix; no alternate `readUrl`, `readFileSource`, mutable candidate set or Renderer source executor exists.

- [ ] **Step 5: Format all implementation-touched files, then check formatting**

During implementation, run Prettier only on the touched files rather than the whole dirty worktree. For this plan document specifically run:

```powershell
npx prettier --write docs/AI助手实施方案.md
npx prettier --check docs/AI助手实施方案.md
```

Expected: write exits 0; check reports `All matched files use Prettier code style!`.

- [ ] **Step 6: Run the complete test and static validation suite**

Run in this order:

```powershell
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Expected: tests, typecheck and build exit 0. `npm run lint` should exit 0; if the repository still has unrelated pre-existing lint errors, record the exact command, exit code, paths and messages, then run ESLint over every file touched by Tasks 1-8 and require that focused command to exit 0. Do not silently classify a new AI/source error as unrelated.

- [ ] **Step 7: Review the final diff without staging**

Run:

```powershell
git status --short
git diff --check
git diff -- docs/AI助手实施方案.md shared/ai electron/ai electron/ipc/channels.ts electron/preload.ts src/stores/ai.ts src/utils/ai src/components/ai docs/task.md docs/开发计划.md docs/需求文档.md docs/代码结构文档.md
```

Expected: `git diff --check` exits 0; deleted files include `src/components/ai/AiMaterialList.vue` and `electron/ai/tools/material-tools.ts`; the diff contains no API key, test secret outside fixtures, accidental source body or unrelated file edit. Do not stage or commit.

- [ ] **Step 8: Update the approved design only for an approved deviation**

If implementation evidence requires a design change, stop and obtain explicit user approval before editing `D:\jzh\code\markdown-plus\docs\AI助手设计方案.md`. If there is no approved deviation, leave the design document byte-for-byte unchanged.

---

## Implementation Self-Review Checklist

- [ ] Every approved design requirement for natural-language source input, Main-only candidate derivation, exact matching, one-time approval, post-approval access, redirects, local-file safety, UI removal and privacy has a task and a concrete test.
- [ ] No task treats candidate extraction as tool routing or sends candidates proactively to the model.
- [ ] Earlier user-message targets are accepted; assistant/system/tool-only, invented and model-modified targets are rejected before approval and access.
- [ ] Preview ordering is explicit: authorization first; web preview has zero DNS/network; local preview has metadata only; body access starts only after approval.
- [ ] The local-file plan uses available Node path/identity controls and injected reparse simulation without promising unsupported universal Windows reparse-tag detection.
- [ ] Main source approvals use ordinary resolution; claim and Renderer execution results remain exclusive to Renderer document writes.
- [ ] Shared type names and signatures match the Cross-Task Interface Matrix in every task.
- [ ] The final tool registry contains exactly 7 tools: `read_current_document`, `read_selected_text`, `read_web_url`, `read_local_file`, `replace_current_document`, `insert_into_current_document`, `create_document`.
- [ ] Deletion strategy is explicit for `src/components/ai/AiMaterialList.vue`, `electron/ai/tools/material-tools.ts`, `electron/ai/material-service.ts` and its replaced test.
- [ ] There are no placeholder implementation instructions, generic “add tests” steps, commit steps or staging commands.
- [ ] Final verification includes full tests, both typechecks, lint, build, Prettier check, stale-term scan and `git diff --check`.
