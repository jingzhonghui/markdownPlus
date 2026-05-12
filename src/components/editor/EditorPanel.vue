<script setup lang="ts">
import { computed, ref, provide } from 'vue'
import { useFileStore } from '../../stores/file'
import InstantEditor from './InstantEditor.vue'
import SourceEditor from './SourceEditor.vue'
import PreviewPanel from './PreviewPanel.vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import type { EditorView } from 'prosemirror-view'

const fileStore = useFileStore()

/**
 * InstantEditor 组件引用
 */
const instantEditorRef = ref<InstanceType<typeof InstantEditor> | null>(null)

/**
 * 是否显示即时渲染编辑器
 */
const showInstant = computed(() => fileStore.editorMode === 'instant')

/**
 * 是否显示源码编辑器
 */
const showSource = computed(() => fileStore.editorMode === 'source' || fileStore.editorMode === 'split')

/**
 * 是否显示预览面板
 */
const showPreview = computed(() => fileStore.editorMode === 'split')

/**
 * 获取 ProseMirror EditorView 实例
 */
function getEditorView(): EditorView | null {
  return instantEditorRef.value?.getView() || null
}

/**
 * 在即时渲染编辑器中应用格式
 */
function applyFormat(format: string): void {
  if (!instantEditorRef.value) return

  const view = instantEditorRef.value.getView()
  if (!view) return

  const { state, dispatch } = view
  const { schema } = state

  switch (format) {
    case 'bold':
      import('../../utils/prosemirror/keymap').then(({ toggleMark }) => {
        toggleMark(schema.marks.bold)(view.state, dispatch)
        view.focus()
      })
      break
    case 'italic':
      import('../../utils/prosemirror/keymap').then(({ toggleMark }) => {
        toggleMark(schema.marks.italic)(view.state, dispatch)
        view.focus()
      })
      break
    case 'strikethrough':
      import('../../utils/prosemirror/keymap').then(({ toggleMark }) => {
        toggleMark(schema.marks.strikethrough)(view.state, dispatch)
        view.focus()
      })
      break
    case 'code':
      import('../../utils/prosemirror/keymap').then(({ toggleMark }) => {
        toggleMark(schema.marks.code)(view.state, dispatch)
        view.focus()
      })
      break
    case 'unorderedList':
      import('prosemirror-schema-list').then(({ wrapInList }) => {
        wrapInList(schema.nodes.bullet_list)(view.state, dispatch)
        view.focus()
      })
      break
    case 'orderedList':
      import('prosemirror-schema-list').then(({ wrapInList }) => {
        wrapInList(schema.nodes.ordered_list)(view.state, dispatch)
        view.focus()
      })
      break
    case 'blockquote':
      import('prosemirror-commands').then(({ wrapIn }) => {
        wrapIn(schema.nodes.blockquote)(view.state, dispatch)
        view.focus()
      })
      break
  }
}

/**
 * 设置标题级别
 */
function setHeading(level: number): void {
  instantEditorRef.value?.toggleHeadingLevel(level)
}

/**
 * 插入链接
 */
function insertLink(href?: string, title?: string): void {
  if (!instantEditorRef.value) return

  const view = instantEditorRef.value.getView()
  if (!view) return

  const { state, dispatch } = view
  const { schema } = state

  import('../../utils/prosemirror/keymap').then(({ insertLink: insertLinkCmd }) => {
    insertLinkCmd(href || '', title)(view.state, dispatch)
    view.focus()
  })
}

/**
 * 插入图片
 */
function insertImage(src?: string, alt?: string, title?: string): void {
  instantEditorRef.value?.insertImage(src || '', alt, title)
}

/**
 * 插入代码块
 */
function insertCodeBlock(language?: string): void {
  if (!instantEditorRef.value) return

  const view = instantEditorRef.value.getView()
  if (!view) return

  const { state, dispatch } = view
  const { schema } = state

  import('prosemirror-commands').then(({ setBlockType }) => {
    setBlockType(schema.nodes.code_block, { language: language || '' })(view.state, dispatch)
    view.focus()
  })
}

/**
 * 设置块级类型
 */
function setBlockTypeCommand(type: string, attrs?: Record<string, unknown>): void {
  instantEditorRef.value?.setBlockTypeCommand(type, attrs)
}

// 提供编辑器控制方法给子组件
provide('editorController', {
  applyFormat,
  setHeading,
  insertLink,
  insertImage,
  insertCodeBlock,
  setBlockTypeCommand,
  getEditorView
})
</script>

<template>
  <div class="editor-panel">
    <!-- 即时渲染编辑器 -->
    <InstantEditor
      v-if="showInstant"
      ref="instantEditorRef"
    />

    <!-- 源码模式：仅显示编辑器 -->
    <SourceEditor
      v-if="showSource && !showPreview"
    />

    <!-- 分屏模式：可拖拽调整左右面板 -->
    <Splitpanes
      v-if="showSource && showPreview"
      class="splitpanes-theme"
    >
      <Pane :min-size="20">
        <SourceEditor />
      </Pane>
      <Pane :min-size="20">
        <PreviewPanel />
      </Pane>
    </Splitpanes>
  </div>
</template>

<style scoped>
.editor-panel {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

/* Splitpanes 主题适配 */
.splitpanes-theme {
  flex: 1;
  display: flex;
}

.splitpanes-theme :deep(.splitpanes__pane) {
  background-color: var(--color-bg-primary);
  overflow: hidden;
}

.splitpanes-theme :deep(.splitpanes__splitter) {
  background-color: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  position: relative;
  width: 7px;
  cursor: col-resize;
  transition: background-color 0.2s;
}

.splitpanes-theme :deep(.splitpanes__splitter:hover) {
  background-color: var(--color-primary);
}

.splitpanes-theme :deep(.splitpanes__splitter::before) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 24px;
  background-color: var(--color-border);
  border-radius: 1px;
  transition: background-color 0.2s;
}

.splitpanes-theme :deep(.splitpanes__splitter:hover::before) {
  background-color: white;
}
</style>
