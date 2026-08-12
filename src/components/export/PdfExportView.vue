<script setup lang="ts">
/* eslint-disable vue/no-v-html */
import { pdfHtml, pdfSource } from '../../utils/pdf-export'
</script>

<template>
  <section
    v-if="pdfSource"
    id="pdf-export-view"
    aria-hidden="true"
  >
    <article
      id="pdf-export-content"
      v-html="pdfHtml"
    />
  </section>
</template>

<style>
#pdf-export-view {
  display: none;
}

@media print {
  @page {
    size: A4 portrait;
  }

  html,
  body,
  #app {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }

  body > :not(#app) {
    display: none !important;
  }

  #app > .app-container {
    height: auto !important;
    overflow: visible !important;
  }

  #app > .app-container > :not(#pdf-export-view) {
    display: none !important;
  }

  #pdf-export-view {
    display: block !important;
    color: #24292f;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.65;
  }

  #pdf-export-content h1,
  #pdf-export-content h2,
  #pdf-export-content h3,
  #pdf-export-content h4,
  #pdf-export-content h5,
  #pdf-export-content h6 {
    color: #1f2328;
    line-height: 1.25;
    break-after: avoid-page;
  }

  #pdf-export-content h1 { font-size: 2em; border-bottom: 2px solid #d0d7de; padding-bottom: 0.3em; }
  #pdf-export-content h2 { font-size: 1.5em; border-bottom: 1px solid #d8dee4; padding-bottom: 0.3em; }
  #pdf-export-content h3 { font-size: 1.25em; }
  #pdf-export-content p { margin: 0 0 12px; orphans: 3; widows: 3; }
  #pdf-export-content a { color: #0969da; text-decoration: none; }
  #pdf-export-content ul,
  #pdf-export-content ol { padding-left: 2em; }
  #pdf-export-content blockquote { margin: 0 0 12px; padding: 0 1em; color: #57606a; border-left: 4px solid #d0d7de; }
  #pdf-export-content code { padding: 0.2em 0.4em; font-family: Consolas, Monaco, monospace; font-size: 85%; background: #f6f8fa; border-radius: 3px; }
  #pdf-export-content pre { padding: 12px; overflow-wrap: anywhere; white-space: pre-wrap; background: #f6f8fa !important; border-radius: 6px; break-inside: avoid-page; }
  #pdf-export-content pre code { padding: 0; background: transparent; }
  #pdf-export-content .shiki { background: #f6f8fa !important; }
  #pdf-export-content table { width: 100%; border-spacing: 0; border-collapse: collapse; break-inside: avoid-page; }
  #pdf-export-content th,
  #pdf-export-content td { padding: 6px 10px; border: 1px solid #d0d7de; }
  #pdf-export-content th,
  #pdf-export-content tr:nth-child(2n) { background: #f6f8fa; }
  #pdf-export-content img { display: block; max-width: 100%; max-height: 235mm; margin: 8px auto; break-inside: avoid-page; }
  #pdf-export-content hr { height: 2px; margin: 20px 0; background: #d0d7de; border: 0; }
  #pdf-export-content .katex-display { overflow: hidden; break-inside: avoid-page; }
  #pdf-export-content li.task-list-item { list-style: none; }
}
</style>
