// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SourceEditor from '../SourceEditor.vue'
import { useFileStore } from '../../../stores/file'

describe('SourceEditor AI selection publication', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
    Object.defineProperty(window, 'electronAPI', { value: {}, configurable: true })
    Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList)
    Range.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({})
    }))
  })

  it('publishes selection on initialization and document changes', async () => {
    const store = useFileStore()
    const tab = store.createGeneratedDocument('One', 'hello', 'markdown')
    const wrapper = mount(SourceEditor, { global: { stubs: { EditorContextMenu: true } } })

    expect(store.editorSelection).toEqual({ tabId: tab.id, from: 0, to: 0, cursor: 0, text: '' })

    const view = wrapper.vm.getView()!
    view.dispatch({ changes: { from: 0, to: 5, insert: 'goodbye' } })
    await nextTick()

    expect(store.editorSelection).toEqual({ tabId: tab.id, from: 0, to: 0, cursor: 0, text: '' })
    expect(store.fileContent).toBe('goodbye')
    wrapper.unmount()
  })

  it('publishes the active tab selection after external tab synchronization', async () => {
    const store = useFileStore()
    store.createGeneratedDocument('One', 'first', 'markdown')
    const second = store.createGeneratedDocument('Two', 'second', 'markdown')
    await store.setActiveTab(store.tabs[0].id)
    const wrapper = mount(SourceEditor, { global: { stubs: { EditorContextMenu: true } } })

    await store.setActiveTab(second.id)
    await nextTick()

    expect(wrapper.vm.getView()!.state.doc.toString()).toBe('second')
    expect(store.editorSelection).toEqual({ tabId: second.id, from: 0, to: 0, cursor: 0, text: '' })
    wrapper.unmount()
  })

  it('publishes the new tab id when switching between identical documents', async () => {
    const store = useFileStore()
    const first = store.createGeneratedDocument('One', 'same', 'markdown')
    const second = store.createGeneratedDocument('Two', 'same', 'markdown')
    await store.setActiveTab(first.id)
    const wrapper = mount(SourceEditor, { global: { stubs: { EditorContextMenu: true } } })
    wrapper.vm.getView()!.dispatch({ selection: { anchor: 4 } })
    expect(store.editorSelection?.cursor).toBe(4)

    await store.setActiveTab(second.id)
    await nextTick()

    expect(store.editorSelection).toEqual({ tabId: second.id, from: 0, to: 0, cursor: 0, text: '' })
    expect(store.cursorLine).toBe(1)
    expect(store.cursorColumn).toBe(1)
    wrapper.unmount()
  })
})
