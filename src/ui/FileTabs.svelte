<script lang="ts">
  // Вкладки відкритих файлів у шапці — список вкладок shadcn-svelte (Tabs.List; Tabs.Root і панелі — в App).
  // Стрілки ←/→ переходять між вкладками, Delete закриває вкладку у фокусі, середня кнопка миші — вкладку під
  // вказівником. Якщо вкладки не вміщаються — кнопки «‹ ›» перемикають на попередню / наступну, активна
  // вкладка прокручується в поле зору.
  import * as Tabs from '$lib/components/ui/tabs'
  import { Button } from '$lib/components/ui/button'
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left'
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'
  import XIcon from '@lucide/svelte/icons/x'
  import { tr } from '../i18n'

  interface Props {
    files: readonly { id: number; name: string }[]
    activeId: number | null
    onselect: (id: number) => void
    onclose: (id: number) => void
    oncloseall: () => void
  }

  let { files, activeId, onselect, onclose, oncloseall }: Props = $props()

  let strip: HTMLElement | null = $state(null)
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
      .querySelector<HTMLElement>(`[data-value="${activeId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  function step(n: number) {
    const f = files[index + n]
    if (f) onselect(f.id)
  }
</script>

<div class="flex min-w-0 items-center gap-1">
  {#if overflow}
    <Button
      variant="ghost"
      size="icon"
      class="shrink-0"
      disabled={index <= 0}
      onclick={() => step(-1)}
      title={$tr('files.prev')}
      aria-label={$tr('files.prev')}><ChevronLeftIcon /></Button
    >
  {/if}
  <Tabs.List
    bind:ref={strip}
    class="max-w-full min-w-0 justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {#each files as f (f.id)}
      <div class="relative flex h-full shrink-0">
        <Tabs.Trigger
          value={String(f.id)}
          title={f.name}
          class="max-w-56 flex-none pe-7"
          onkeydown={(e) => {
            if (e.key === 'Delete') onclose(f.id)
          }}
          onauxclick={(e) => {
            if (e.button === 1) onclose(f.id)
          }}
        >
          <span class="truncate">{f.name}</span>
        </Tabs.Trigger>
        <!-- Закриття — окрема кнопка поверх вкладки (кнопка в кнопці неприпустима); з клавіатури — Delete -->
        <Button
          variant="ghost"
          size="icon-sm"
          tabindex={-1}
          class="absolute end-1 top-1/2 size-5 -translate-y-1/2 rounded-sm opacity-60 hover:opacity-100"
          title="{$tr('files.close')} {f.name}"
          aria-label="{$tr('files.close')} {f.name}"
          onclick={() => onclose(f.id)}><XIcon class="size-3.5" /></Button
        >
      </div>
    {/each}
  </Tabs.List>
  {#if overflow}
    <Button
      variant="ghost"
      size="icon"
      class="shrink-0"
      disabled={index >= files.length - 1}
      onclick={() => step(1)}
      title={$tr('files.next')}
      aria-label={$tr('files.next')}><ChevronRightIcon /></Button
    >
  {/if}
  {#if files.length > 1}
    <Button variant="outline" class="shrink-0" onclick={oncloseall}>{$tr('files.closeAll')}</Button>
  {/if}
</div>
