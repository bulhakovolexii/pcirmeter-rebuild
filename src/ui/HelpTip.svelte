<script lang="ts">
  // Кнопка «?» з довідкою (shadcn-svelte Popover): наведення або фокус з клавіатури — показати, клік — закріпити,
  // Esc / клік поза нею — сховати. Панель — у порталі, тож її не перекривають сусідні шари.
  import * as Popover from '$lib/components/ui/popover'
  import { buttonVariants } from '$lib/components/ui/button'

  interface Props {
    /** Підпис кнопки для читачів екрана. */
    label: string
    /** Рядки довідки. */
    items: readonly string[]
    /** Край, до якого вирівнюється спливна панель. */
    align?: 'left' | 'right'
  }

  let { label, items, align = 'left' }: Props = $props()

  let pinned = $state(false)
  let hovered = $state(false)
  let focused = $state(false)
  const open = $derived(pinned || hovered || focused)
  /** Затримка перед закриттям після наведення — щоб устигнути перевести вказівник з кнопки на панель. */
  let leaveTimer: ReturnType<typeof setTimeout> | undefined

  function close() {
    pinned = hovered = focused = false
  }

  function enter(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    clearTimeout(leaveTimer)
    hovered = true
  }

  function leave() {
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => (hovered = false), 120)
  }
</script>

<Popover.Root {open} onOpenChange={(v) => !v && close()}>
  <Popover.Trigger
    class="{buttonVariants({ variant: 'overlay', size: 'icon-sm' })} rounded-full font-bold"
    aria-label={label}
    onclick={(e) => {
      // Власне перемикання замість вбудованого: клік закріплює панель, показану наведенням
      e.preventDefault()
      pinned = !pinned
    }}
    onfocus={(e) => (focused = e.currentTarget.matches(':focus-visible'))}
    onblur={() => (focused = false)}
    onpointerenter={enter}
    onpointerleave={leave}>?</Popover.Trigger
  >
  <Popover.Content
    side="bottom"
    align={align === 'right' ? 'end' : 'start'}
    sideOffset={6}
    trapFocus={false}
    onOpenAutoFocus={(e) => e.preventDefault()}
    onCloseAutoFocus={(e) => e.preventDefault()}
    onpointerenter={enter}
    onpointerleave={leave}
  >
    <ul class="m-0 list-disc ps-4 [&>li+li]:mt-1">
      {#each items as item, i (i)}
        <li>{item}</li>
      {/each}
    </ul>
  </Popover.Content>
</Popover.Root>
