<script lang="ts">
  // Кнопка «?» з довідкою — стандартний Popover shadcn-svelte: клік / Enter — показати або сховати,
  // Esc / клік поза панеллю — сховати. Панель — у порталі, тож її не перекривають сусідні шари.
  // Кнопка — розміру смуг над зображеннями (icon-xs, див. .float-bar у app.css).
  import * as Popover from '$lib/components/ui/popover'
  import { buttonVariants } from '$lib/components/ui/button'
  import CircleHelpIcon from '@lucide/svelte/icons/circle-help'

  interface Props {
    /** Підпис кнопки для читачів екрана. */
    label: string
    /** Рядки довідки. */
    items: readonly string[]
    /** Край, до якого вирівнюється спливна панель. */
    align?: 'left' | 'right'
  }

  let { label, items, align = 'left' }: Props = $props()
</script>

<Popover.Root>
  <Popover.Trigger
    class={buttonVariants({ variant: 'outline', size: 'icon-xs' })}
    aria-label={label}
    title={label}><CircleHelpIcon /></Popover.Trigger
  >
  <Popover.Content side="bottom" align={align === 'right' ? 'end' : 'start'} class="w-80">
    <ul class="m-0 list-disc ps-4 [&>li+li]:mt-1">
      {#each items as item, i (i)}
        <li>{item}</li>
      {/each}
    </ul>
  </Popover.Content>
</Popover.Root>
