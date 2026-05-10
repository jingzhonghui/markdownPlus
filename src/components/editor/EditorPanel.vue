<script setup lang="ts">
import { computed, ref, provide } from 'vue'
import { useFileStore } from '../../stores/file'
import WysiwygEditor from './WysiwygEditor.vue'
import SourceEditor from './SourceEditor.vue'
import PreviewPanel from './PreviewPanel.vue'
import type { EditorView } from 'prosemirror-view'

const fileStore = useFileStore()

/**
 * WysiwygEditor 组件引用
 */
const wysiwygEditorRef = ref<InstanceType<typeof WysiwygEditor> | null>(null)

/**
 * 是否显示 WYSIWYG 编辑器
 */
const showWysiwyg = computed(() => fileStore.editorMode === 'wysiwyg')

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
  return wysiwygEditorRef.value?.getView() || null
}

/**
 * 在 WYSIWYG 编辑器中应用格式
 */
function applyFormat(format: string): void {
  if (!wysiwygEditorRef.value) return

  const view = wysiwygEditorRef.value.getView()
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
  wysiwygEditorRef.value?.toggleHeadingLevel(level)
}

/**
 * 插入链接
 */
function insertLink(href?: string, title?: string): void {
  if (!wysiwygEditorRef.value) return

  const view = wysiwygEditorRef.value.getView()
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
  wysiwygEditorRef.value?.insertImage(src || '', alt, title)
}

/**
 * 插入代码块
 */
function insertCodeBlock(language?: string): void {
  if (!wysiwygEditorRef.value) return

  const view = wysiwygEditorRef.value.getView()
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
  wysiwygEditorRef.value?.setBlockTypeCommand(type, attrs)
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
    <!-- WYSIWYG 编辑器 -->
    <WysiwygEditor
      v-if="showWysiwyg"
      ref="wysiwygEditorRef"
    />
    
    <!-- 源码编辑器（分屏模式或源码模式） -->
    <SourceEditor
      v-if="showSource"
      :class="{ 'split-mode': showPreview }"
    />
    
    <!-- 预览面板（仅分屏模式） -->
    <PreviewPanel v-if="showPreview" />
  </div>
</template>

<style scoped>
.editor-panel {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.split-mode {
  flex: 1;
  border-right: 1px solid var(--color-border);
}
</style>
