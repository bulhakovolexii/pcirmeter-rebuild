<script lang="ts">
  /**
   * Межа між двома областями: вертикальна (між колонками) або горизонтальна (між рядами). Перетягування
   * мишею/пальцем, стрілки ←/→ (↑/↓ для горизонтальної) з фокусом (Shift — більший крок), подвійний клік —
   * стандартне значення. Саме значення (ширину, висоту, частку) зберігає й обмежує власник: межа лише повідомляє зсув.
   */
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
></div>

<style>
  .splitter {
    position: relative;
    flex: none;
    width: 12px;
    cursor: col-resize;
    touch-action: none;
  }
  .splitter::after {
    content: '';
    position: absolute;
    inset: 0 5px;
    border-radius: 1px;
    transition: background 0.15s;
  }
  .splitter.horizontal {
    width: auto;
    height: 12px;
    cursor: row-resize;
  }
  .splitter.horizontal::after {
    inset: 5px 0;
  }
  .splitter:hover::after,
  .splitter.active::after,
  .splitter:focus-visible::after {
    background: var(--accent);
  }
  .splitter:focus-visible {
    outline: none;
  }
</style>
