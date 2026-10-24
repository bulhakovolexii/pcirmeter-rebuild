<script lang="ts">
  /**
   * Межа між двома областями: вертикальна (між колонками) або горизонтальна (між рядами). Перетягування
   * мишею/пальцем, стрілки ←/→ (↑/↓ для горизонтальної) з фокусом (Shift — більший крок), подвійний клік —
   * стандартне значення. Саме значення (ширину, висоту, частку) зберігає й обмежує власник: межа лише повідомляє зсув.
   * Вигляд — як ResizableHandle shadcn-svelte з ручкою (withHandle). Сам Resizable (paneforge) не підходить:
   * розміри в ньому — лише частки контейнера, а тут — пікселі з межами (ширина бічної панелі, висота гістограми
   * в прокручуваній панелі, висота нижньої смуги з мінімумом для зображення).
   */
  import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical'
  interface Props {
    label: string
    /** Орієнтація самої межі (як `aria-orientation`); за замовчуванням вертикальна. */
    orientation?: 'vertical' | 'horizontal'

    valuenow: number
    valuemin: number
    valuemax: number
    /** Початок перетягування — запам'ятати поточне значення. */
    onstart: () => void
    /** Зсув указівника в px від початку перетягування: по x для вертикальної межі, по y — для горизонтальної. */
    ondrag: (delta: number) => void
    /** Крок з клавіатури (←/↑ — від'ємний): −1/+1, з Shift — −4/+4. */
    onstep: (steps: number) => void
    onreset: () => void
  }

  let {
    label,
    orientation = 'vertical',
    valuenow,
    valuemin,
    valuemax,
    onstart,
    ondrag,
    onstep,
    onreset,
  }: Props = $props()

  const horizontal = $derived(orientation === 'horizontal')
  let active = $state(false)
  let from = 0
  const coord = (e: PointerEvent) => (horizontal ? e.clientY : e.clientX)

  function down(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget as Element
    handle.setPointerCapture(e.pointerId)
    active = true
    from = coord(e)
    onstart()
  }

  function key(e: KeyboardEvent) {
    const [less, more] = horizontal ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    const dir = e.key === less ? -1 : e.key === more ? 1 : 0
    if (!dir) return
    e.preventDefault()
    onstep(dir * (e.shiftKey ? 4 : 1))
  }
</script>

<!-- Фокусований separator зі значенням за WAI-ARIA інтерактивний (стрілки змінюють розмір), Svelte цього не знає -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="splitter"
  class:active
  class:horizontal
  role="separator"
  aria-orientation={orientation}
  aria-label={label}
  aria-valuemin={valuemin}
  aria-valuemax={valuemax}
  aria-valuenow={Math.round(valuenow)}
  title={label}
  tabindex="0"
  onpointerdown={down}
  onpointermove={(e) => active && ondrag(coord(e) - from)}
  onpointerup={() => (active = false)}
  onpointercancel={() => (active = false)}
  ondblclick={onreset}
  onkeydown={key}
>
  <div class="grip"><GripVerticalIcon class={horizontal ? 'size-2.5 rotate-90' : 'size-2.5'} /></div>
</div>

<style>
  .splitter {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    cursor: col-resize;
    touch-action: none;
    outline: none;
  }
  /* Лінія межі (bg-border) */
  .splitter::before {
    content: '';
    position: absolute;
    inset: 0 auto;
    left: calc(50% - 0.5px);
    width: 1px;
    background: var(--border);
    transition: background 0.15s;
  }
  .splitter.horizontal {
    width: auto;
    height: 12px;
    cursor: row-resize;
  }
  .splitter.horizontal::before {
    inset: auto 0;
    top: calc(50% - 0.5px);
    width: auto;
    height: 1px;
  }
  /* Ручка (rounded-xs border bg-border, h-4 w-3) */
  .grip {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 16px;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--border);
    color: var(--fg);
  }
  .horizontal .grip {
    width: 16px;
    height: 12px;
  }
  .splitter:hover::before,
  .splitter.active::before {
    background: var(--border-strong);
  }
  .splitter:focus-visible .grip {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--gold) 50%, transparent);
    border-color: var(--gold);
  }
  .splitter:focus-visible::before {
    background: var(--gold);
  }
</style>
