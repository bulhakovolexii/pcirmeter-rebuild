import { describe, expect, it } from 'vitest'
import { demoSources, isDemoUrl, withoutDemo } from '../../src/ui/demo'

describe('демо', () => {
  it('?demo вмикає, ?demo=false / 0 — ні', () => {
    const on = (q: string) => isDemoUrl(new URL('https://x.org/app/' + q))
    expect(on('?demo')).toBe(true)
    expect(on('?demo=true')).toBe(true)
    expect(on('?demo=1')).toBe(true)
    expect(on('?demo=false')).toBe(false)
    expect(on('?demo=0')).toBe(false)
    expect(on('')).toBe(false)
  })

  it('прибирає параметр, решту адреси лишає', () => {
    expect(withoutDemo(new URL('https://x.org/app/?a=1&demo=true#h')).href).toBe('https://x.org/app/?a=1#h')
  })

  it('усі зразки legacy-2013 за назвою', () => {
    expect(demoSources().map((s) => s.name)).toEqual([
      '130604_0001T.jpg',
      '130604_0002T.jpg',
      '130604_0003T.jpg',
      '130924_0002T.jpg',
      '130924_0010T.jpg',
      '130924_0018T.jpg',
      '130924_0021T.jpg',
    ])
  })
})
