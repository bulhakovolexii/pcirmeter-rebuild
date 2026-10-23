<script lang="ts">
  // Кнопка «?» з довідкою: наведення або фокус з клавіатури — показати, клік — закріпити,
  // Esc / клік поза нею — сховати
  interface Props {
    /** Підпис кнопки для читачів екрана. */
    label: string
    /** Рядки довідки. */
    items: readonly string[]
    /** Край, до якого вирівнюється спливна панель. */
    align?: 'left' | 'right'
  }

  let { label, items, align = 'left' }: Props = $props()

  const uid = $props.id()
  let pinned = $state(false)
  let hovered = $state(false)
  let focused = $state(false)
  let root: HTMLSpanElement | undefined = $state()
  const open = $derived(pinned || hovered || focused)

  function close() {
    pinned = hovered = focused = false
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (pinned && root && !root.contains(e.target as Node)) close()
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && open) close()
  }}
/>

<span
  class="help"
  bind:this={root}
  role="presentation"
  onpointerenter={(e) => {
    if (e.pointerType === 'mouse') hovered = true
  }}
  onpointerleave={() => (hovered = false)}
>
  <button
    type="button"
    class="icon"
    class:active={open}
    aria-label={label}
    aria-expanded={open}
    aria-controls={uid}
    onclick={() => (pinned = !pinned)}
    onfocus={(e) => (focused = e.currentTarget.matches(':focus-visible'))}
    onblur={() => (focused = false)}>?</button
  >
  {#if open}
    <div class="tip {align}" id={uid} role="tooltip">
      <ul>
        {#each items as item, i (i)}
          <li>{item}</li>
        {/each}
      </ul>
    </div>
  {/if}
</span>

<style>
  .help {
    position: relative;
    display: inline-flex;
  }
  /* Кольори кнопки перевизначаються змінними --help-* (напр. на темних смугах поверх зображення) */
  .icon {
    width: var(--help-size, 24px);
    height: var(--help-size, 24px);
    min-width: 0;
    padding: 0;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.85rem;
    line-height: 1;
    background: var(--help-bg, var(--surface));
    border-color: var(--help-border, var(--border-strong));
    color: var(--help-fg, var(--muted));
  }
  .icon.active,
  .icon:hover {
    border-color: var(--help-active, var(--accent));
    color: var(--help-active, var(--accent));
  }
  .tip {
    position: absolute;
    top: calc(100% + 6px);
    z-index: 50;
    width: max-content;
    max-width: min(360px, 80vw);
    padding: 8px 12px;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border-strong);
    border-top: 3px solid var(--accent);
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    font-size: 0.85rem;
    font-weight: 400;
    text-align: left;
    white-space: normal;
  }
  .tip.left {
    left: 0;
  }
  .tip.right {
    right: 0;
  }
  ul {
    margin: 0;
    padding-left: 16px;
  }
  li + li {
    margin-top: 3px;
  }
</style>
