<script lang="ts" module>
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

  // Варіанти й розміри — під стиль ХПІ (токени app.css); фокус — спільна золота рамка :focus-visible
  // Без tailwind-variants: класи не зливаються (див. cn у $lib/utils), тож вистачає таблиць
  const BUTTON_BASE =
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm whitespace-nowrap transition-[background-color,border-color,color] disabled:cursor-default disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
  const BUTTON_VARIANTS = {
    default: 'border-input bg-card enabled:hover:border-foreground border',
    primary:
      'border-primary bg-primary text-primary-foreground enabled:hover:border-primary-hover enabled:hover:bg-primary-hover border font-semibold',
    ghost: 'enabled:hover:bg-accent',
    /** На темних смугах (шапка, панелі поверх зображення). */
    overlay:
      'enabled:hover:border-gold enabled:hover:text-gold aria-expanded:border-gold aria-expanded:text-gold data-[state=on]:border-gold data-[state=on]:text-gold border border-white/25 bg-white/10 text-white',
    link: 'text-primary underline-offset-4 hover:underline',
  }
  const BUTTON_SIZES = {
    default: 'h-9 px-3',
    sm: 'h-7.5 px-2',
    icon: 'size-9',
    'icon-sm': 'size-7.5',
  }

  export function buttonVariants({
    variant = 'default',
    size = 'default',
  }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
    return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`
  }

  export type ButtonVariant = keyof typeof BUTTON_VARIANTS
  export type ButtonSize = keyof typeof BUTTON_SIZES

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
      variant?: ButtonVariant
      size?: ButtonSize
    }
</script>

<script lang="ts">
  let {
    class: className,
    variant = 'default',
    size = 'default',
    ref = $bindable(null),
    href = undefined,
    type = 'button',
    disabled,
    children,
    ...restProps
  }: ButtonProps = $props()
</script>

{#if href}
  <a
    bind:this={ref}
    data-slot="button"
    class={cn(buttonVariants({ variant, size }), className)}
    href={disabled ? undefined : href}
    aria-disabled={disabled}
    role={disabled ? 'link' : undefined}
    tabindex={disabled ? -1 : undefined}
    {...restProps}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    class={cn(buttonVariants({ variant, size }), className)}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
