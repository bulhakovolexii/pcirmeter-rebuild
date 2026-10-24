<script lang="ts">
  import { RadioGroup as RadioGroupPrimitive } from 'bits-ui'
  import CircleIcon from '@lucide/svelte/icons/circle'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<RadioGroupPrimitive.ItemProps> = $props()
</script>

<RadioGroupPrimitive.Item
  bind:ref
  data-slot="radio-group-item"
  class={cn(
    'border-input bg-card text-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aspect-square size-4.5 shrink-0 cursor-pointer rounded-full border transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked })}
    <div data-slot="radio-group-indicator" class="relative flex items-center justify-center">
      {#if checked}
        <CircleIcon
          class="fill-primary absolute start-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2"
        />
      {/if}
    </div>
  {/snippet}
</RadioGroupPrimitive.Item>
