<script lang="ts">
  import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js'
  import type { HTMLTextareaAttributes } from 'svelte/elements'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    'data-slot': dataSlot = 'textarea',
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props()
</script>

<textarea
  bind:this={ref}
  data-slot={dataSlot}
  class={cn(
    'border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive flex min-h-16 w-full resize-y rounded-md border px-2 py-1 text-sm transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
  bind:value
  {...restProps}></textarea>
