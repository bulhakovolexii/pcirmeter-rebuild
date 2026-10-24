<script lang="ts" module>
  import { getContext, setContext } from 'svelte'
  import type { ToggleVariants } from '$lib/components/ui/toggle/index.js'

  interface ToggleGroupContext extends ToggleVariants {
    spacing?: number
  }

  export function setToggleGroupCtx(props: ToggleGroupContext) {
    setContext('toggleGroup', props)
  }

  export function getToggleGroupCtx() {
    return getContext<Required<ToggleGroupContext>>('toggleGroup')
  }
</script>

<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'
  import type { AriaRole } from 'svelte/elements'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size = 'default',
    spacing = 0,
    variant = 'default',
    role,
    children,
    ...restProps
  }: ToggleGroupPrimitive.RootProps &
    ToggleVariants & {
      spacing?: number
      /** bits-ui ставить role="group"; для одиночного вибору (пункти — role="radio") — "radiogroup". */
      role?: AriaRole
    } = $props()

  setToggleGroupCtx({
    get variant() {
      return variant
    },
    get size() {
      return size
    },
    get spacing() {
      return spacing
    },
  })
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<ToggleGroupPrimitive.Root
  bind:value={value as never}
  bind:ref
  data-slot="toggle-group"
  data-variant={variant}
  data-size={size}
  data-spacing={spacing}
  style={`--gap: ${spacing}`}
  class={cn('group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md', className)}
  {...restProps}
>
  {#snippet child({ props })}
    <div {...props} role={(role ?? props.role) as AriaRole}>
      {@render children?.()}
    </div>
  {/snippet}
</ToggleGroupPrimitive.Root>
