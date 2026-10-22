import { render } from 'svelte/server'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/ui/App.svelte'
import { applyUpdate, onLaunchFiles, pwa, registerServiceWorker, type SwContainer } from '../../src/ui/pwa'

class FakeWorker extends EventTarget {
  posted: unknown[] = []
  constructor(public state: string) {
    super()
  }
  postMessage(m: unknown) {
    this.posted.push(m)
  }
  set(state: string) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  found(sw: FakeWorker) {
    this.installing = sw
    this.dispatchEvent(new Event('updatefound'))
  }
}

function container(controlled: boolean, reg = new FakeRegistration()) {
  const target = new EventTarget()
  const c = {
    controller: controlled ? {} : null,
    register: vi.fn(async () => reg),
    addEventListener: target.addEventListener.bind(target),
    fire: () => target.dispatchEvent(new Event('controllerchange')),
  }
  return { c: c as unknown as SwContainer & { fire(): void }, reg }
}

const flush = () => new Promise((r) => setTimeout(r))

beforeEach(() => pwa.set({ update: false, offlineReady: false }))

describe('registerServiceWorker', () => {
  it('перше встановлення: повідомлення «працює офлайн», без перезавантаження', async () => {
    const { c, reg } = container(false)
    const reload = vi.fn()
    reg.installing = new FakeWorker('installing')
    await registerServiceWorker(c, reload)
    expect(c.register).toHaveBeenCalledWith('./sw.js')
    expect(get(pwa)).toEqual({ update: false, offlineReady: false })
    reg.installing.set('installed')
    expect(get(pwa)).toEqual({ update: false, offlineReady: true })
    c.fire() // clients.claim() першого SW
    expect(reload).not.toHaveBeenCalled()
  })

  it('оновлення: чекає на «Оновити», потім skip-waiting і перезавантаження після зміни контролера', async () => {
    const { c, reg } = container(true)
    const reload = vi.fn()
    await registerServiceWorker(c, reload)
    const sw = new FakeWorker('installing')
    reg.found(sw)
    expect(get(pwa).update).toBe(false)
    sw.set('installed')
    expect(get(pwa)).toEqual({ update: true, offlineReady: false })
    expect(reload).not.toHaveBeenCalled()

    applyUpdate()
    expect(sw.posted).toEqual(['skip-waiting'])
    c.fire()
    c.fire()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('нова версія, що вже чекала з минулого візиту, теж дає банер', async () => {
    const reg = new FakeRegistration()
    reg.waiting = new FakeWorker('installed')
    const { c } = container(true, reg)
    await registerServiceWorker(c, vi.fn())
    expect(get(pwa).update).toBe(true)
  })
})

describe('onLaunchFiles', () => {
  it('передає файли з launchQueue', async () => {
    let consumer: ((p: { files?: { getFile(): Promise<File> }[] }) => void) | undefined
    const open = vi.fn()
    onLaunchFiles(open, { launchQueue: { setConsumer: (c) => (consumer = c) } })
    const file = { name: 'a.jpg' } as File
    consumer!({ files: [{ getFile: async () => file }] })
    consumer!({ files: [] })
    await flush()
    expect(open).toHaveBeenCalledExactlyOnceWith([file])
  })

  it('без підтримки нічого не робить', () => {
    expect(() => onLaunchFiles(vi.fn(), {})).not.toThrow()
  })
})

describe('банер у App', () => {
  it('показує пропозицію оновитися', () => {
    pwa.set({ update: true, offlineReady: false })
    const { body } = render(App)
    expect(body).toContain('Доступна нова версія')
    expect(body).toContain('Оновити')
  })

  it('показує «працює без інтернету» один раз після встановлення', () => {
    pwa.set({ update: false, offlineReady: true })
    expect(render(App).body).toContain('працює й без інтернету')
    pwa.set({ update: false, offlineReady: false })
    expect(render(App).body).not.toContain('без інтернету')
  })
})
