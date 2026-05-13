<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore } from '../../stores/file'
import SourceEditor from './SourceEditor.vue'
import PreviewPanel from './PreviewPanel.vue'
import TabBar from './TabBar.vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

const fileStore = useFileStore()

/**
 * 是否显示预览面板
 */
const showPreview = computed(() => fileStore.editorMode === 'split')
</script>

<template>
  <div class="editor-panel">
    <!-- 标签栏 -->
    <TabBar />

    <!-- 源码模式：仅显示编辑器 -->
    <SourceEditor
      v-if="!showPreview"
    />

    <!-- 分屏模式：可拖拽调整左右面板 -->
    <Splitpanes
      v-else
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
  flex-direction: column;
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
  width: 2px;
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
