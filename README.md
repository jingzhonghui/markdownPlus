# Markdown+ 编辑器

一款桌面端 Markdown 编辑器，支持自定义的 `.mdx` 文件格式——将 Markdown 内容与图片等资源打包为单一 ZIP 文件。

## 特性

- 📝 自包含的 `.mdx` 文件格式（ZIP 压缩包）
- 🖼️ 图片自动打包到文档内
- 🎨 三种编辑模式：所见即所得 / 分屏预览 / 源码编辑
- 🌓 浅色/深色主题切换
- 💾 自动保存与崩溃恢复
- 📤 导出为 Markdown / HTML / PDF

## 技术栈

- Electron 34+
- Vue 3 + TypeScript
- Pinia 状态管理
- Tailwind CSS
- electron-vite

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 代码格式化
npm run format

# 构建
npm run build

# 打包
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 项目结构

```
markdown-plus/
├── electron/           # Electron 主进程
│   ├── main.ts        # 主进程入口
│   ├── preload.ts     # 预加载脚本
│   └── ...
├── src/               # Vue 渲染进程
│   ├── components/    # Vue 组件
│   ├── stores/        # Pinia 状态
│   ├── styles/        # 样式
│   └── ...
├── docs/              # 文档
└── ...
```

## 许可证

MIT
