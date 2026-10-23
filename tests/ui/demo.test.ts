import { describe, expect, it } from 'vitest'
import { demoSources, isDemoPath } from '../../src/ui/demo'

describe('демо', () => {
  it('лише шлях …/demo; корінь і ?demo — звичайний режим', () => {
    expect(isDemoPath('/pcirmeter-rebuild/demo/')).toBe(true)
    expect(isDemoPath('/pcirmeter-rebuild/demo')).toBe(true)
    expect(isDemoPath('/pcirmeter-rebuild/demo/index.html')).toBe(true)
    expect(isDemoPath('/demo/')).toBe(true)
    expect(isDemoPath('/pcirmeter-rebuild/')).toBe(false)
    expect(isDemoPath('/pcirmeter-rebuild/index.html')).toBe(false)
    expect(isDemoPath('/pcirmeter-rebuild/demo/samples/x.jpg')).toBe(false)
    expect(isDemoPath('/pcirmeter-rebuild/nodemo/')).toBe(false)
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
