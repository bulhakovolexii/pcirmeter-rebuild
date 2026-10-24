<script lang="ts" module>
  // Сегментовані перемикачі в стилі ХПІ: увімкнений — червоний (primary); overlay — на темних смугах
  // Без tailwind-variants: класи не зливаються (див. cn у $lib/utils), тож вистачає таблиць
  const TOGGLE_BASE =
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm whitespace-nowrap transition-[background-color,border-color,color] disabled:cursor-default disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
  const TOGGLE_VARIANTS = {
    default:
      'enabled:hover:bg-accent data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary-hover bg-transparent',
    outline:
      'border-input bg-card enabled:hover:bg-accent data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:enabled:hover:bg-primary-hover border',
    overlay:
      'enabled:hover:border-gold enabled:hover:text-gold data-[state=on]:border-gold data-[state=on]:text-gold border border-white/25 bg-white/10 text-white',
  }
  const TOGGLE_SIZES = {
    default: 'h-9 min-w-9 px-2.5',
    sm: 'h-7.5 min-w-7.5 px-2',
  }

  export function toggleVariants({
    variant = 'default',
    size = 'default',
  }: { variant?: ToggleVariant; size?: ToggleSize } = {}) {
    return `${TOGGLE_BASE} ${TOGGLE_VARIANTS[variant]} ${TOGGLE_SIZES[size]}`
  }

  export type ToggleVariant = keyof typeof TOGGLE_VARIANTS
  export type ToggleSize = keyof typeof TOGGLE_SIZES
  export type ToggleVariants = { variant?: ToggleVariant; size?: ToggleSize }
</script>

<script lang="ts">
  import { Toggle as TogglePrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    pressed = $bindable(false),
    class: className,
    size = 'default',
    variant = 'default',
    ...restProps
  }: TogglePrimitive.RootProps & {
    variant?: ToggleVariant
    size?: ToggleSize
  } = $props()
</script>

<TogglePrimitive.Root
  bind:ref
  bind:pressed
  data-slot="toggle"
  class={cn(toggleVariants({ variant, size }), className)}
  {...restProps}
/>
