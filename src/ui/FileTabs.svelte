<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  // Вкладки відкритих файлів у шапці. Якщо не вміщаються — кнопки «‹ ›» перемикають на попередню / наступну,
  // активна вкладка прокручується в поле зору.
  import { tr } from '../i18n'

  interface Props {
    files: readonly { id: number; name: string }[]
    activeId: number | null
    onselect: (id: number) => void
    onclose: (id: number) => void
    oncloseall: () => void
  }

  let { files, activeId, onselect, onclose, oncloseall }: Props = $props()

  let strip: HTMLDivElement | undefined = $state()
  let overflow = $state(false)
  const index = $derived(files.findIndex((f) => f.id === activeId))

  // Переповнення — після зміни розміру смуги або набору вкладок
  $effect(() => {
    const el = strip
    if (!el) return
    void files.length
    const update = () => (overflow = el.scrollWidth > el.clientWidth + 1)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  })

  // Активна вкладка — завжди видима
  $effect(() => {
    if (activeId === null || !strip) return
    void overflow
    strip
      .querySelector<HTMLElement>(`[data-id="${activeId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  function step(n: number) {
    const f = files[index + n]
    if (f) onselect(f.id)
  }
</script>

<div class="file-tabs">
  {#if overflow}
    <Button
      variant="overlay"
      size="icon"
      class="shrink-0 font-bold"
      disabled={index <= 0}
      onclick={() => step(-1)}
      title={$tr('files.prev')}
      aria-label={$tr('files.prev')}>‹</Button
    >
  {/if}
  <div class="strip" role="tablist" bind:this={strip}>
    {#each files as f (f.id)}
      <div class="tab" class:active={f.id === activeId} data-id={f.id}>
        <button
          type="button"
          role="tab"
          class="name"
          aria-selected={f.id === activeId}
          title={f.name}
          onclick={() => onselect(f.id)}
        >
          {f.name}
        </button>
        <button
          type="button"
          class="close"
          aria-label="{$tr('files.close')} {f.name}"
          onclick={() => onclose(f.id)}>×</button
        >
      </div>
    {/each}
  </div>
  {#if overflow}
    <Button
      variant="overlay"
      size="icon"
      class="shrink-0 font-bold"
      disabled={index >= files.length - 1}
      onclick={() => step(1)}
      title={$tr('files.next')}
      aria-label={$tr('files.next')}>›</Button
    >
  {/if}
  {#if files.length > 1}
    <Button variant="overlay" class="shrink-0" onclick={oncloseall}>{$tr('files.closeAll')}</Button>
  {/if}
</div>

<style>
  .file-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .strip {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-behavior: smooth;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  .tab {
    display: flex;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.06);
  }
  .tab:hover {
    border-color: rgba(255, 255, 255, 0.4);
  }
  .tab.active {
    background: rgba(255, 255, 255, 0.16);
    border-color: var(--gold);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .tab button {
    border: none;
    background: none;
    color: #fff;
  }
  .name {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab.active .name {
    font-weight: 600;
  }
  .close {
    color: #bdbdbd;
    padding-left: 2px;
  }
  .close:hover {
    color: #fff;
  }
</style>
