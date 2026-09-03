// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import Tooltip from '../Tooltip.vue'

const TooltipHost = defineComponent({
  setup() {
    return () => h(Tooltip, { content: '完整文件名称.pdf' }, {
      default: () => h('span', { class: 'trigger' }, '文件名称.pdf')
    })
  }
})

describe('Tooltip', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('shows content after hovering the trigger', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TooltipHost, { attachTo: document.body })
    const trigger = wrapper.find('.trigger')

    await trigger.trigger('mouseover')
    vi.advanceTimersByTime(400)
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe('完整文件名称.pdf')
  })

  it('shows content when the trigger receives keyboard focus', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TooltipHost, { attachTo: document.body })

    await wrapper.find('.trigger').trigger('focusin')
    vi.advanceTimersByTime(400)
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull()
  })

  it('hides content when the pointer leaves the trigger', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TooltipHost, { attachTo: document.body })
    const trigger = wrapper.find('.trigger')

    await trigger.trigger('mouseenter')
    vi.advanceTimersByTime(400)
    await wrapper.vm.$nextTick()
    await trigger.trigger('mouseleave')
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('keeps the tooltip inside the left viewport boundary', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('innerWidth', 800)
    const wrapper = mount(TooltipHost, { attachTo: document.body })
    const trigger = wrapper.find('.trigger')
    vi.spyOn(trigger.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 20,
      top: 100,
      bottom: 120,
      width: 20,
      height: 20,
      x: 0,
      y: 100,
      toJSON: () => ({})
    })

    await trigger.trigger('mouseover')
    vi.advanceTimersByTime(400)
    await wrapper.vm.$nextTick()

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]')
    expect(Number.parseFloat(tooltip?.style.left ?? '0')).toBeGreaterThanOrEqual(12)
  })

  it('moves left when there is not enough room on the right', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('innerWidth', 800)
    const wrapper = mount(TooltipHost, { attachTo: document.body })
    const trigger = wrapper.find('.trigger')
    vi.spyOn(trigger.element, 'getBoundingClientRect').mockReturnValue({
      left: 760,
      right: 800,
      top: 100,
      bottom: 120,
      width: 40,
      height: 20,
      x: 760,
      y: 100,
      toJSON: () => ({})
    })

    await trigger.trigger('mouseover')
    vi.advanceTimersByTime(400)
    await wrapper.vm.$nextTick()

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]')
    expect(tooltip?.style.width).toBe('max-content')
    Object.defineProperty(tooltip, 'offsetWidth', { configurable: true, value: 160 })
    window.dispatchEvent(new Event('resize'))

    expect(Number.parseFloat(tooltip?.style.left ?? '800')).toBeLessThanOrEqual(708)
  })
})
