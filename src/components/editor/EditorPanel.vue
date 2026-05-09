<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore } from '../../stores/file'
import WysiwygEditor from './WysiwygEditor.vue'
import SourceEditor from './SourceEditor.vue'
import PreviewPanel from './PreviewPanel.vue'

const fileStore = useFileStore()

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
</script>

<template>
  <div class="editor-panel">
    <!-- WYSIWYG 编辑器 -->
    <WysiwygEditor v-if="showWysiwyg" />
    
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
