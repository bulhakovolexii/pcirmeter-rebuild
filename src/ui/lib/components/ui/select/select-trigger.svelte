<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down'
  import { cn, type WithoutChild } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    children,
    size = 'default',
    variant = 'default',
    ...restProps
  }: WithoutChild<SelectPrimitive.TriggerProps> & {
    size?: 'sm' | 'default'
    /** overlay — на темних смугах (шапка, панелі поверх зображення). */
    variant?: 'default' | 'overlay'
  } = $props()
</script>

<SelectPrimitive.Trigger
  bind:ref
  data-slot="select-trigger"
  data-size={size}
  class={cn(
    "data-[placeholder]:text-muted-foreground aria-invalid:border-destructive flex w-fit cursor-pointer items-center justify-between gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap transition-[border-color] select-none disabled:cursor-default disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-7.5 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variant === 'overlay'
      ? 'enabled:hover:border-gold border-white/25 bg-white/10 text-white [&_svg]:text-white'
      : 'border-input bg-card enabled:hover:border-foreground',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
  <ChevronDownIcon class="size-4 opacity-60" />
</SelectPrimitive.Trigger>
