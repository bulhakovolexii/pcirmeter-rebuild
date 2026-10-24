<script lang="ts">
  import { Popover as PopoverPrimitive } from 'bits-ui'
  import PopoverPortal from './popover-portal.svelte'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'
  import type { ComponentProps } from 'svelte'

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    align = 'center',
    portalProps,
    ...restProps
  }: PopoverPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>
  } = $props()
</script>

<PopoverPortal {...portalProps}>
  <PopoverPrimitive.Content
    bind:ref
    data-slot="popover-content"
    {sideOffset}
    {align}
    class={cn(
      'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 border-input border-t-primary z-50 w-max max-w-[min(360px,80vw)] origin-(--bits-popover-content-transform-origin) rounded-lg border border-t-3 px-3 py-2 text-xs shadow-xl outline-hidden',
      className,
    )}
    {...restProps}
  />
</PopoverPortal>
