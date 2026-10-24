<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import DialogPortal from './dialog-portal.svelte'
  import XIcon from '@lucide/svelte/icons/x'
  import type { Snippet } from 'svelte'
  import * as Dialog from './index.js'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'
  import type { ComponentProps } from 'svelte'

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    showCloseButton = true,
    closeLabel = 'Close',
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>
    children: Snippet
    showCloseButton?: boolean
    /** Підпис кнопки закриття для читачів екрана. */
    closeLabel?: string
  } = $props()
</script>

<DialogPortal {...portalProps}>
  <Dialog.Overlay />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn(
      'bg-card text-card-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 border-input border-t-primary fixed top-[50%] left-[50%] z-50 flex max-h-[calc(100vh-48px)] w-[min(720px,calc(100vw-32px))] translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg border border-t-3 shadow-2xl duration-200',
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
    {#if showCloseButton}
      <DialogPrimitive.Close
        class="absolute end-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5"
      >
        <XIcon />
        <span class="sr-only">{closeLabel}</span>
      </DialogPrimitive.Close>
    {/if}
  </DialogPrimitive.Content>
</DialogPortal>
