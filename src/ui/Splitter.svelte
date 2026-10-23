<script lang="ts">
  /**
   * Вертикальна межа між двома областями: перетягування мишею/пальцем, стрілки ←/→ з фокусом
   * (Shift — більший крок), подвійний клік — стандартне значення. Саме значення (ширину, частку)
   * зберігає й обмежує власник: межа лише повідомляє зсув.
   */
  interface Props {
    label: string
    valuenow: number
    valuemin: number
    valuemax: number
    /** Початок перетягування — запам'ятати поточне значення. */
    onstart: () => void
    /** Зсув указівника в px від початку перетягування. */
    ondrag: (dx: number) => void
    /** Крок з клавіатури: −1/+1, з Shift — −4/+4. */
    onstep: (steps: number) => void
    onreset: () => void
  }

  let { label, valuenow, valuemin, valuemax, onstart, ondrag, onstep, onreset }: Props = $props()

  let active = $state(false)
  let fromX = 0

  function down(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget as Element
    handle.setPointerCapture(e.pointerId)
    active = true
    fromX = e.clientX
    onstart()
  }

  function key(e: KeyboardEvent) {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
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
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuemin={valuemin}
  aria-valuemax={valuemax}
  aria-valuenow={Math.round(valuenow)}
  title={label}
  tabindex="0"
  onpointerdown={down}
  onpointermove={(e) => active && ondrag(e.clientX - fromX)}
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
  .splitter:hover::after,
  .splitter.active::after,
  .splitter:focus-visible::after {
    background: var(--accent);
  }
  .splitter:focus-visible {
    outline: none;
  }
</style>
