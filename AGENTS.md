# AGENTS.md

> 本文件是 AI 编码助手的项目上下文指南。在开始任何开发任务前，请完整阅读本文件。

---

## 1. 项目概述

**Markdown+** 是一款桌面端 Markdown 编辑器，核心特色是自定义的 `.mdx` 文件格式——将 Markdown 内容与图片等资源打包为单一 ZIP 文件，类似 `.docx` 的自包含文档。

- **定位**: 桌面 Markdown 编辑器
- **目标用户**: 需要便携、自包含 Markdown 文档的开发者和写作者
- **当前阶段**: 前期规划完成，即将进入开发

---

## 2. 技术栈

| 层面 | 技术 |
|------|------|
| 桌面框架 | Electron 33+ |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| 编辑器内核 | ProseMirror（WYSIWYG）+ CodeMirror 6（源码） |
| Markdown 解析 | markdown-it |
| 代码高亮 | Shiki |
| 样式 | Tailwind CSS |
| 构建 | electron-vite |
| 打包 | electron-builder |
| 文件格式 | ZIP（archiver + adm-zip） |

---

## 3. 项目结构

```
markdown-plus/
├── AGENTS.md                    # ← 你正在读的文件
├── docs/                        # 项目文档
│   ├── 需求文档.md               # 完整需求规格
│   ├── 开发计划.md               # 6 阶段开发计划
│   ├── task.md                  # 205 项任务清单
│   └── prototype/               # HTML 原型
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本（contextBridge）
│   ├── mdx/                     # .mdx 文件格式读写
│   │   ├── schema.ts            # mdx.json 类型定义
│   │   ├── reader.ts            # 读取/解压
│   │   └── writer.ts            # 打包/压缩
│   ├── ipc/                     # IPC 通信 handlers
│   └── utils/
│       └── fs.ts                # 文件系统工具
├── src/                         # Vue 渲染进程
│   ├── App.vue
│   ├── main.ts
│   ├── components/
│   │   ├── layout/              # Header / ToolBar / SideBar / StatusBar
│   │   ├── editor/              # WysiwygEditor / SourceEditor / PreviewPanel
│   │   ├── sidebar/             # FileExplorer / AssetManager
│   │   └── modals/              # Export / Image / Link / Settings
│   ├── composables/             # Vue 组合式函数
│   ├── stores/                  # Pinia 状态
│   ├── utils/                   # 工具函数
│   └── styles/                  # 主题 + 编辑器样式
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
└── tailwind.config.js
```

---

## 4. 开发命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 代码格式化
npm run format

# 运行测试
npm run test

# 运行单个测试文件
npm run test -- path/to/test.ts

# 构建
npm run build

# 打包安装程序
npm run package
```

> 如果上述命令尚未配置，请先完成配置再使用。检查 package.json scripts 字段确认可用命令。

---

## 5. 架构约束

### 5.1 进程模型
- **主进程** (`electron/`): 负责文件 I/O、窗口管理、系统 API 调用。不包含任何 UI 逻辑。
- **渲染进程** (`src/`): 负责 UI 渲染和用户交互。不直接访问 Node.js API 或文件系统。
- **预加载脚本** (`electron/preload.ts`): 通过 `contextBridge` 暴露安全的 IPC API 给渲染进程。
- **通信**: 所有跨进程通信必须通过 IPC（`ipcMain.handle` / `ipcRenderer.invoke`）。

### 5.2 文件格式 (.mdx)
- `.mdx` 文件本质是 ZIP 压缩包。
- 内部结构固定：`mdx.json`（元数据）+ `content.md`（内容）+ `assets/`（资源）。
- 元数据 Schema 定义在 `electron/mdx/schema.ts`。
- 图片引用使用相对路径 `assets/images/xxx.png`。

### 5.3 编辑器模式
- 三种模式：WYSIWYG（ProseMirror）/ 分屏预览 / 源码编辑（CodeMirror 6）。
- 模式切换时必须同步内容：ProseMirror Doc ↔ Markdown 双向转换。
- 内容同步时尽可能保持光标和滚动位置。

---

## 6. 编码规范

### 6.1 通用
- TypeScript strict 模式，禁止 `any` 类型。
- 使用 ES Modules（`import/export`），不使用 CommonJS（`require`）。
- 文件命名：组件用 PascalCase（`WysiwygEditor.vue`），工具/composable 用 camelCase（`useEditor.ts`）。
- 所有公共函数和接口必须有 JSDoc 注释。
- 不添加无意义的注释，注释应说明"为什么"而非"做什么"。

### 6.2 Vue 组件
- 使用 `<script setup lang="ts">` 语法。
- 组件 Props 必须定义 TypeScript 接口。
- 使用 `defineProps` + `defineEmits`，不使用 Options API。
- 组合式逻辑抽取到 `composables/` 目录。

### 6.3 样式
- 使用 Tailwind CSS utility classes。
- 编辑器相关样式（ProseMirror/CodeMirror）放在 `styles/editor.css`。
- 不使用内联 `style` 属性。
- 主题通过 CSS 变量控制（`--color-bg`、`--color-text` 等）。

### 6.4 Electron 主进程
- 所有 IPC handler 注册集中在 `electron/ipc/` 目录。
- 文件操作必须使用原子写入（写临时文件 → rename）。
- 错误必须通过 IPC 返回结构化错误对象，不抛出未捕获异常。

### 6.5 测试
- 使用 Vitest 作为测试框架。
- 单元测试放在 `__tests__/` 目录，与源文件同级。
- .mdx 读写必须有完整的往返测试。
- 测试命名：`describe('模块名')` + `it('should 行为描述')`。

---

## 7. 安全规则

- **禁止** 在渲染进程直接使用 `fs`、`child_process`、`net` 等 Node.js 模块。
- **禁止** 在 `preload.ts` 中暴露完整的 `ipcRenderer`，只暴露必要的 invoke 方法。
- **禁止** 将密钥、令牌等敏感信息硬编码在代码中。
- **禁止** 使用 `eval()`、`new Function()` 或动态代码执行。
- `.mdx` 解压时必须校验路径，防止 ZIP 路径穿越攻击（如 `../../etc/passwd`）。
- 图片文件必须校验 MIME 类型，不信任文件扩展名。

---

## 8. 常见错误与修复

| 错误模式 | 正确做法 |
|----------|----------|
| 在 Vue 组件中直接调用 `fs.readFile` | 通过 IPC 调用主进程文件操作 |
| 使用 `npm` 安装依赖 | 本项目使用 `npm`（尚未决定包管理器，暂用 npm） |
| ProseMirror 节点不匹配 Schema | 修改节点前先检查 Schema 定义 |
| CodeMirror 扩展顺序错误 | 基础扩展在前（state），UI 扩展在后（view） |
| Tailwind 类名在 Electron 中不生效 | 检查 `content` 配置是否覆盖 `.vue` 和 `.ts` 文件 |
| IPC 通信返回 Promise 未处理 | 所有 `invoke` 调用必须 `await` 或 `.catch()` |
| .mdx 文件保存后损坏 | 确认使用原子写入，检查临时文件清理逻辑 |

---

## 9. 关键文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求文档 | `docs/需求文档.md` | 完整功能需求、文件格式规范 |
| 开发计划 | `docs/开发计划.md` | 6 阶段 16 周开发计划 |
| 任务清单 | `docs/task.md` | 205 项可勾选任务 |
| UI 原型 | `docs/prototype/index.html` | 浏览器可交互原型 |

---

## 10. Harness 工程约束

本文件遵循 **Harness Engineering** 原则：将 AI 代理视为项目贡献者，通过标准化的上下文层（AGENTS.md）使其高效工作。

### 约束策略

1. **架构约束**: 严格遵循主进程/渲染进程分离，禁止跨层直接调用。
2. **命名约束**: 文件名、组件名、函数名遵循上述规范，不一致时拒绝。
3. **测试约束**: 每个 .mdx 读写功能必须有往返测试，编辑器功能需要手动验证。
4. **反馈循环**: 每次修改后运行 `npm run typecheck` 和 `npm run lint`，确保无错误。
5. **上下文边界**: 单次对话只处理一个阶段内的任务，跨阶段需重新确认上下文。

### 执行清单

每次完成编码任务后，必须执行以下检查：

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] 新增代码无 `any` 类型
- [ ] 公共接口有类型定义和注释
- [ ] IPC 调用有错误处理
- [ ] 文件操作使用原子写入

---

*本文件应随项目演进持续更新。当架构决策或技术选型变更时，同步更新本文件。*
