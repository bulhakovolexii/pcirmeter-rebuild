import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App.svelte'

describe('App', () => {
  it('рендериться з українським інтерфейсом за замовчуванням', () => {
    const { body } = render(App)
    expect(body).toContain('Аналіз термограм')
    expect(body).toContain('English')
  })
})
