# Markdown+ 编辑器任务列表

> **关联文档**: [需求文档](./需求文档.md) | [开发计划](./开发计划.md) | [原型](./prototype/index.html)

---

## 阶段 1：项目基础搭建

### 1.1 项目初始化
- [x] 使用 electron-vite 脚手架创建 Electron + Vue 3 + TypeScript 项目
- [x] 初始化 Git 仓库，配置 .gitignore
- [x] 安装核心依赖：vue、electron、typescript、tailwindcss
- [x] 验证项目可正常启动（主进程 + 渲染进程）

### 1.2 开发工具链配置
- [x] 配置 electron-vite（主进程/预加载/渲染进程分离构建）
- [x] 配置 Tailwind CSS
- [x] 配置 ESLint + @typescript-eslint
- [x] 配置 Prettier
- [ ] 配置 husky + lint-staged（提交前检查）
- [x] 验证 dev / build 命令正常

### 1.3 主界面布局
- [x] 创建 App.vue 根组件
- [x] 实现无边框窗口（frameless BrowserWindow）
- [x] 实现自定义标题栏 AppHeader（Logo + 菜单栏 + 窗口控制按钮）
- [x] 实现标题栏窗口控制（最小化/最大化/关闭，最大化状态监听）
- [x] 实现 ToolBar 组件（格式化按钮组 + 插入对话框）
- [x] 实现 SideBar 组件（文件浏览器，可折叠）
- [x] 实现 StatusBar 组件（字数/文件大小/光标位置/模式切换/保存状态）
- [x] 实现主区域弹性布局（侧边栏 + 编辑器）
- [x] 响应式适配：侧边栏可折叠（图标栏 / 展开状态切换）

### 1.4 侧边栏功能
- [x] 实现文件浏览器面板（文件列表 + 新建按钮）
- [x] 实现资源管理器面板（图片缩略图网格 + 添加按钮）
- [x] 侧边栏面板切换（文件 / 资源）
- [x] 文件项选中高亮状态

### 1.5 主题系统
- [x] 定义 CSS 变量体系（颜色、字号、间距）
- [x] 实现浅色主题
- [x] 实现深色主题
- [x] 实现主题切换按钮（Header 右侧）
- [x] 主题偏好持久化（localStorage）
- [x] 跟随系统主题选项

### 1.6 IPC 通信层
- [x] 配置 contextBridge 暴露安全 API
- [x] 封装 ipcRenderer 调用（invoke / send / on）
- [x] 定义 IPC 通道常量（文件操作、mdx 操作等）
- [x] 主进程注册 ipcMain handlers
- [x] 编写通信层类型定义（请求/响应类型）
- [x] 验证双向通信正常（需实现具体 handlers）

### 1.7 多文件标签页系统
- [x] 实现 TabBar 组件（标签列表 + 当前激活高亮）
- [x] 标签页未保存指示器（圆点标记）
- [x] 标签页关闭（点击关闭按钮 / 鼠标中键）
- [x] 关闭未保存标签时保存确认对话框
- [x] 标签栏水平滚动支持
- [x] file store 多标签状态管理（tabs 数组 + activeTabId）
- [x] 向后兼容 computed 代理（currentFile/document/fileContent 从 activeTab 读取）
- [x] 关闭窗口前遍历所有脏 tab 逐一确认

### 1.8 文件夹浏览
- [x] 打开文件夹功能（AppHeader 菜单 + 侧边栏图标）
- [x] 文件夹内容展示（文件 + 子文件夹列表）
- [x] 文件夹导航（进入子文件夹 / 返回上一级 / 关闭文件夹）
- [x] 当前打开文件高亮
- [x] 未保存文件修改指示器
- [x] 空状态提示

### 1.9 右键菜单与文件操作
- [x] 空白区域右键菜单（新建文件/文件夹、刷新）
- [x] 文件右键菜单（打开/重命名/删除/复制路径）
- [x] 文件夹右键菜单（新建/刷新/重命名/删除/复制路径）
- [x] 自定义输入对话框（新建/重命名操作，非 prompt()）
- [x] 文件/文件夹 CRUD IPC 通道（create/rename/delete）

### 1.10 窗口控制
- [x] 无边框窗口（frameless BrowserWindow）
- [x] 自定义标题栏拖拽区域（-webkit-app-region: drag）
- [x] 窗口控制按钮（最小化/最大化/关闭）
- [x] 最大化状态监听与 UI 反馈
- [x] IPC 窗口控制通道（minimize/maximize/close/isMaximized）

### 1.11 最近文件
- [x] 最近打开文件记录（持久化到 recent-files.json，最多 20 条）
- [x] AppHeader 最近文件子菜单（显示文件名 + 路径）
- [x] 清除最近文件列表
- [x] 打开已删除文件时自动从列表移除

---

## 阶段 2：.mdx 文件格式实现

### 2.1 mdx.json Schema 定义
- [x] 定义 MdxMetadata TypeScript 接口（version/created_at/modified_at/author/title）
- [x] 定义 MdxAsset 接口（id/filename/path/mime_type/size/checksum）
- [x] 定义 MdxSettings 接口（editor_theme/preview_style）
- [x] 定义 MdxFile 顶层接口（metadata + content_file + assets + settings）
- [x] 编写 Schema 验证函数

### 2.2 .mdx 文件读取
- [x] 安装 archiver / adm-zip 依赖
- [x] 实现 openMdx(filePath) 函数：解压到临时目录
- [x] 解析 mdx.json 元数据
- [x] 读取 content.md 内容
- [x] 读取 assets 目录资源列表
- [x] 返回结构化的 MdxDocument 对象
- [x] 错误处理：文件损坏/格式不符/缺失必要文件

### 2.3 .mdx 文件写入
- [x] 实现 saveMdx(filePath, document) 函数
- [x] 生成 mdx.json（更新 modified_at、checksum）
- [x] 写入 content.md
- [x] 写入 assets 资源文件
- [x] 压缩打包为 .mdx
- [x] 原子写入：先写临时文件再 rename，防止损坏
- [x] 错误处理：磁盘空间不足/权限问题

### 2.4 文件操作 UI
- [x] 实现新建文件（Ctrl+N）：创建空白 .mdx 模板
- [x] 实现打开文件（Ctrl+O）：调用系统文件选择器
- [x] 实现保存文件（Ctrl+S）：直接保存当前文件
- [x] 实现另存为（Ctrl+Shift+S）：选择新路径保存
- [x] 文件修改状态追踪（标题栏 * 标记）
- [x] 关闭未保存文件时提示保存
- [x] 最近打开文件记录

### 2.5 .md 导入转换
- [x] 实现导入 .md 文件功能
- [x] 解析 .md 中的图片引用路径
- [x] 将引用的本地图片复制到 assets 目录
- [x] 更新图片引用路径为 assets/images/ 相对路径
- [x] 生成 mdx.json 元数据
- [x] 打包为 .mdx

### 2.6 .mdx 导出为 .md
- [x] 实现导出为 .md 功能
- [x] 将 .mdx 中的 assets/images/ 提取到同级文件夹
- [x] 更新 Markdown 中的图片路径指向提取后的文件夹
- [x] 导出对话框：选择输出目录

### 2.7 文件完整性校验
- [x] 实现资源文件 SHA256 计算（crypto模块）
- [x] 保存时写入 checksum 到 mdx.json
- [x] 打开时校验 checksum，不一致则警告
- [ ] 提供修复选项（移除损坏资源引用）

### 2.8 单元测试
- [x] 测试：创建空白 .mdx → 读取 → 内容一致
- [x] 测试：写入含图片的 .mdx → 读取 → 图片数据一致
- [x] 测试：修改内容 → 保存 → 重新打开 → 修改保留
- [x] 测试：损坏文件/格式错误 → 正确报错
- [x] 测试：.md 导入 → .mdx 导出 → 内容无损

---

## 阶段 3：编辑器核心

### 3A：源码编辑器 ✅

#### 3A.1 CodeMirror 6 集成 ✅
- [x] 安装 @codemirror/view、@codemirror/state、@codemirror/lang-markdown
- [x] 创建 SourceEditor.vue 组件
- [x] 初始化 EditorView 实例
- [x] 配置基础扩展（行号、折叠槽、光标行高亮）
- [x] 绑定 Vue 响应式状态（内容双向绑定）

#### 3A.2 语法高亮 ✅
- [x] 配置 Markdown 语法高亮（@codemirror/lang-markdown）
- [x] 配置代码块语言高亮（@codemirror/lang-javascript 等）
- [x] 自定义高亮主题（匹配应用浅色/深色主题）
- [x] 代码块语言标识着色

#### 3A.3 分屏预览模式 ✅
- [x] 创建 PreviewPanel.vue 组件
- [x] 使用 Splitpanes 实现可拖拽左右分栏（源码 + 预览）
- [x] 集成 markdown-it 渲染预览
- [x] 集成 Shiki 代码高亮（github-light/github-dark 主题）
- [x] .mdx 内图片路径转换（相对路径 → data URL，带缓存）
- [x] 实时同步：源码变化 → 防抖渲染预览（100ms）
- [x] 预览面板滚动同步（可选）

#### 3A.4 自动补全 ✅
- [x] 输入 `#` 自动补全标题标记
- [x] 列表项回车自动续行（- / 1. / - [ ]）
- [x] 代码块自动闭合（``` → ```闭合）
- [x] 输入 `>` 自动补全引用块

#### 3A.5 快捷键 ✅
- [x] Ctrl+B：粗体（包裹 **）
- [x] Ctrl+I：斜体（包裹 *）
- [x] Ctrl+K：插入链接
- [x] Ctrl+Shift+K：插入图片
- [x] Ctrl+H：切换标题级别
- [x] Tab / Shift+Tab：缩进/反缩进
- [x] Ctrl+/：行注释/取消注释

#### 3A.6 查找替换 ✅
- [x] Ctrl+F：打开查找栏
- [x] Ctrl+H：打开查找替换栏
- [x] 高亮所有匹配项
- [x] 上一个/下一个匹配导航
- [x] 替换/全部替换
- [x] 正则表达式模式
- [x] 大小写敏感选项

### 3C：即时渲染（IR）编辑器 ✅ 已实现并启用

#### 3C.1 IR 模式基础 ✅
- [x] 创建 IrEditor.vue 组件（基于 ProseMirror）
- [x] CSS 块级标记（标题 `#`、引用 `>`、分割线 `---`、代码块 `` ``` ``）
- [x] CSS 列表标记（无序 `-`、有序 `1.`、任务 `- [ ]`/`- [x]`）
- [x] Schema 扩展：`data-mark`、`data-lang`、`data-checked` 属性

#### 3C.2 内联标记与展开/折叠 ✅
- [x] CSS 内联标记（粗体 `**`、斜体 `*`、删除线 `~~`、代码 `` ` ``、链接 `[]()`）
- [x] 选区追踪 plugin（`ir-plugin.ts`）：检测光标附近标记文本
- [x] 展开/折叠机制：内联标记默认隐藏，光标靠近时淡入显示

#### 3C.3 模式集成 ✅
- [x] 默认编辑模式设置为 `ir`（`file.ts`）
- [x] StatusBar 模式循环包含 `ir`
- [x] EditorPanel 条件渲染 IrEditor
- [x] 与 fileStore 双向内容同步

### 3B：WYSIWYG 编辑器（已废弃，不再启用）

> 以下条目仅保留历史实现记录，不属于当前产品路线。ProseMirror 依旧用于 IR 即时渲染模式。

#### 3B.1 ProseMirror 初始化 ✅
- [x] 安装 prosemirror-* 系列依赖
- [x] 创建 WysiwygEditor.vue 组件
- [x] 定义 ProseMirror Schema（doc/paragraph/heading/list/blockquote/code_block/table/image/hr/...）
- [x] 定义行内 Mark Schema（bold/italic/strikethrough/link/code/...）
- [x] 初始化 EditorState + EditorView
- [x] 绑定 Vue 响应式状态

#### 3B.2 ProseMirror ↔ Markdown 双向转换 ✅
- [x] 集成 prosemirror-markdown
- [x] 实现 Markdown → ProseMirror Doc 解析器
- [x] 实现 ProseMirror Doc → Markdown 序列化器
- [x] 扩展支持 GFM（表格、任务列表、删除线）
- [x] 扩展支持图片（alt + src 属性）
- [x] 边界情况处理：嵌套列表、混合格式等

#### 3B.3 块级节点 ✅
- [x] 标题节点（H1-H4，快捷键切换）
- [x] 段落节点
- [x] 无序列表 + 有序列表（Tab 缩进/反缩进）
- [x] 引用块
- [x] 代码块（语言选择 + 语法高亮）
- [x] 表格（插入/删除行列，单元格编辑）
- [x] 分割线
- [x] 回车键行为：各块级节点的换行逻辑

#### 3B.4 行内标记 ✅
- [x] 粗体（Ctrl+B）
- [x] 斜体（Ctrl+I）
- [x] 删除线
- [x] 链接（Ctrl+K，弹出编辑弹窗）
- [x] 行内代码
- [x] 多标记叠加（如粗体+斜体）

#### 3B.5 浮动工具栏 ✅
- [x] 创建 FloatToolbar.vue 组件
- [x] 监听选区变化，选中文字时显示
- [x] 计算浮动位置（选区上方居中）
- [x] 工具按钮：粗体/斜体/删除线/链接/行内代码
- [x] 点击外部或选区消失时隐藏
- [x] 深色主题适配

#### 3B.6 图片节点 ✅
- [x] 图片节点 Schema（src/alt/title/width）
- [x] 图片渲染（居中、自适应宽度）
- [x] 点击图片显示 ImageToolbar
- [ ] ImageToolbar：小/中/大尺寸切换 + 删除（预留接口）
- [ ] 图片拖拽调整大小（拖拽角点）（预留接口）
- [ ] 图片居左/居中/居右对齐（预留接口）

#### 3B.7 任务列表 ✅
- [x] 任务列表节点 Schema（checked 属性）
- [x] 渲染 checkbox
- [x] 点击 checkbox 切换完成状态
- [x] 与 Markdown - [x] / - [ ] 语法互转

#### 3B.8 模式切换（历史记录）
- [x] 实现历史模式状态管理（不再维护）
- [x] 模式切换 UI（工具栏按钮组）
- [x] WYSIWYG → 源码：ProseMirror Doc → Markdown
- [x] 源码 → WYSIWYG：Markdown → ProseMirror Doc
- [x] 切换时保持光标位置（尽可能）
- [x] 切换时保持滚动位置

#### 3B.9 图片拖放 ✅
- [x] 监听编辑器 dragover/drop 事件
- [x] 拖入本地图片文件 → 读取为 Data URL → 插入图片节点
- [x] 粘贴图片（clipboard image）→ 插入图片节点
- [x] 拖入网络图片 URL → 插入图片节点
- [x] 拖放视觉反馈（放置区域高亮）

---

## 阶段 4：图片与资源管理 ✅ 已完成

### 4.1 图片存入 .mdx ✅
- [x] 编辑器中插入图片时，通过 IPC 发送图片数据到主进程
- [x] 主进程将图片写入 .mdx 临时解压目录的 assets/images/
- [x] 更新 mdx.json 中的 assets 列表
- [x] 编辑器中图片 src 替换为 assets/images/xxx.png 相对路径
- [x] 保存时将临时目录重新打包为 .mdx

### 4.2 图片自动重命名与去重 ✅
- [x] 计算图片文件内容 hash（SHA256 前 12 位）
- [x] 以 hash 重命名图片文件（避免中文/特殊字符文件名问题）
- [x] 插入前检查 hash 是否已存在，存在则复用不重复存储
- [x] 更新所有引用该图片的路径

### 4.3 图片压缩 ✅
- [x] 安装 sharp 依赖（主进程端压缩）
- [x] 实现图片压缩函数（支持 JPEG/PNG/WebP）
- [x] 压缩设置 UI：质量滑块（1-100）
- [x] 压缩设置 UI：最大宽度/高度限制
- [x] 压缩设置 UI：自动压缩开关（插入时自动压缩）
- [x] 压缩前后大小对比显示

### 4.4 资源管理器面板 ✅
- [x] 创建 AssetManager.vue 组件（模态框）
- [x] 列出当前 .mdx 中所有资源文件（缩略图 + 文件名 + 大小）
- [x] 点击资源插入到编辑器
- [x] 删除资源（同时移除编辑器中的引用）
- [x] 替换资源（保留引用路径，替换文件内容）
- [x] 资源排序（按名称/大小/类型）

### 4.5 图片引用路径管理 ✅
- [x] 删除图片时自动清理 Markdown 中的引用
- [x] 重命名图片时自动更新引用路径
- [x] 检测孤立资源（未被引用的图片）并提示清理
- [x] 引用路径验证：打开文件时检查引用的资源是否存在

### 4.6 附件管理 ✅
- [x] 扩展 assets 目录结构（attachments/ 子目录）
- [x] 支持插入任意文件附件
- [x] 附件在编辑器中显示为卡片（文件名 + 大小 + 下载按钮）
- [x] 附件点击可打开/保存到本地

---

## 阶段 5：导出与高级功能

### 5.1 PDF 导出 ✅
- [x] 使用 Electron `webContents.printToPDF` 将 HTML 转为 PDF（非 Puppeteer）
- [x] 实现 Markdown → HTML 渲染（带完整样式 + Shiki 代码高亮）
- [x] PDF 页面设置（A4 纸张、边距、页眉页脚 + 页码）
- [x] PDF 中图片嵌入（data URL，图片懒加载解析）
- [x] 单文件导出 + 文件夹递归批量导出（保留目录结构）
- [x] 批量导出进度提示（PdfBatchProgressDialog）

### 5.2 HTML 导出
- [ ] 实现 Markdown → HTML 转换
- [ ] 内联 CSS 样式（生成独立可打开的 HTML）
- [ ] 图片转为 base64 内嵌
- [ ] 代码高亮样式内嵌
- [ ] 导出设置：是否包含目录、是否内嵌图片

### 5.3 自动保存
- [x] 实现定时自动保存（默认 30 秒）
- [x] 实现失焦自动保存（窗口切换时）
- [x] 自动保存默认间隔 30 秒
- [x] 自动保存状态指示（状态栏显示）
- [x] 自动保存失败时保留"未保存"标记和恢复快照
- [x] 编辑后 1 秒内更新恢复快照，降低定时保存间隔内的数据丢失风险
- [x] 保存期间继续编辑时保留新内容的未保存状态

### 5.4 撤销/重做
- [x] IR 模式：ProseMirror 内置 undo/redo
- [x] 源码模式：CodeMirror 内置 undo/redo
- [x] Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 快捷键绑定
- [x] 模式切换时由编辑器实例隔离历史栈
- [x] 编辑器右键菜单显示撤销/重做
- [x] 源码、分屏和 IR 模式统一右键菜单样式与通用功能

### 5.5 大纲视图
- [ ] 创建 OutlinePanel.vue 组件
- [ ] 解析文档标题结构（H1-H4）
- [ ] 树形展示文档大纲
- [ ] 点击大纲项跳转到对应位置
- [ ] 大纲实时更新（内容变化时）
- [ ] 大纲面板可折叠（侧边栏或独立面板）

### 5.6 多预览主题
- [ ] 实现 GitHub 风格预览主题
- [ ] 实现 GitLab 风格预览主题
- [ ] 实现极简预览主题
- [ ] 预览主题切换下拉菜单
- [ ] 预览主题偏好持久化

### 5.7 .docx 导入
- [ ] 安装 mammoth.js 依赖
- [ ] 实现 .docx → HTML 转换
- [ ] HTML → Markdown 转换
- [ ] 提取 .docx 中的图片并存入 assets
- [ ] 导入进度提示
- [ ] 格式丢失警告提示

### 5.8 崩溃恢复
- [x] 编辑过程中定时写入独立恢复快照
- [x] 启动时检测异常退出标记和恢复快照
- [x] 弹出恢复提示对话框
- [x] 用户选择恢复或丢弃
- [x] 恢复后清理恢复快照
- [x] 正常退出时清理恢复快照和运行标记
- [x] 恢复 MDX 图片、附件及资源清单
- [x] 损坏或空快照自动清理

---

## 阶段 6：打磨与发布

### 6.1 大文件性能优化
- [ ] CodeMirror 虚拟滚动配置
- [ ] ProseMirror 大文档性能测试与优化
- [ ] 预览渲染防抖优化（500ms）
- [ ] 图片懒加载（滚动到可视区域再渲染）
- [ ] .mdx 大文件流式解压（避免一次性加载全部资源）

### 6.2 快捷键自定义
- [ ] 定义快捷键配置 Schema
- [ ] 快捷键设置 UI（分类展示、搜索、冲突检测）
- [ ] 快捷键录制（按键捕获）
- [ ] 重置为默认快捷键
- [ ] 快捷键配置持久化

### 6.3 帮助系统
- [ ] 帮助文档页面（Markdown 语法参考）
- [ ] 快捷键速查表
- [ ] 关于对话框（版本信息、开源协议）
- [ ] 首次启动引导（可选）

### 6.4 打包 ✅（Windows/Linux 已就绪，macOS 待启用）
- [x] 配置 electron-builder（electron-builder.yml）
- [x] Windows 打包（NSIS 安装包 + zip，x64）
- [ ] macOS 打包（DMG + 代码签名，签名未就绪暂未启用）
- [x] Linux 打包（AppImage + deb）
- [x] 应用图标设计（各平台适配）
- [x] 打包体积优化（asar 精简、排除 renderer 开发依赖、locales 裁剪、去 ia32）
- [x] GitHub Actions 发布流水线（release.yml，tag 触发，Windows/Linux）

### 6.5 应用签名
- [ ] macOS 代码签名（Developer ID）
- [ ] macOS 公证（Notarization）
- [ ] Windows 代码签名（EV 证书）
- [ ] 签名验证测试

### 6.6 集成测试与 Bug 修复
- [x] 单元测试（vitest：schema/writer/import/recovery/markdown 转换/theme/file store，77 项）
- [ ] 编写 E2E 测试（Playwright / Spectron）
- [ ] 测试：完整编辑流程（新建→编辑→插入图片→保存→重新打开）
- [ ] 测试：三种模式切换数据一致性
- [ ] 测试：大文件性能基准
- [ ] 测试：跨平台 UI 一致性
- [ ] Bug 修复与回归测试

### 6.7 自动更新
- [ ] 集成 electron-updater
- [ ] 配置更新源（GitHub Releases）
- [ ] 实现更新检查逻辑
- [ ] 更新提示 UI（版本号、更新内容、下载进度）
- [ ] 后台下载 + 重启安装
- [ ] 支持回滚

### 6.8 首次发布
- [ ] 版本号锁定为首次正式发布版本
- [ ] 编写 CHANGELOG.md
- [ ] 编写用户使用文档
- [ ] GitHub Release 发布
- [ ] 官网/落地页（可选）

---

## 任务统计

| 阶段 | 已完成 | 待完成 | 状态 |
|------|--------|--------|------|
| 阶段 1：项目基础搭建 | ~45 | 1 (husky) | ✅ 基本完成 |
| 阶段 2：.mdx 文件格式 | ~30 | 1 (修复选项) | ✅ 基本完成 |
| 阶段 3A：源码编辑器 | ~25 | 0 | ✅ 完成 |
| 阶段 3B：WYSIWYG 编辑器 | 历史实现 | 不再维护 | 已废弃 |
| 阶段 3C：即时渲染(IR)编辑器 | ~12 | 0 | ✅ 已实现并启用 |
| 阶段 4：图片与资源管理 | ~25 | 0 | ✅ 完成 |
| 阶段 5：导出与高级功能 | ~24 | ~13 | 🔄 部分完成（PDF/自动保存/撤销重做/崩溃恢复已完成） |
| 阶段 6：打磨与发布 | ~8 | ~22 | 🔄 部分完成（打包 + CI 已完成） |

---

*文档结束*
