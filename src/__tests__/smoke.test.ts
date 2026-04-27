import { describe, it, expect } from 'vitest'

describe('vitest harness smoke test', () => {
  it('runs basic assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('has a happy-dom document', () => {
    const el = document.createElement('div')
    el.textContent = 'hello'
    expect(el.textContent).toBe('hello')
  })
})
