<script lang="ts" generics="T extends string">
  // Випадний список з фіксованим набором значень (shadcn-svelte Select)
  import * as Select from '$lib/components/ui/select'

  interface Props {
    value: T
    options: readonly { value: T; label: string }[]
    /** Підпис для читачів екрана, якщо поруч немає видимого. */
    ariaLabel?: string
    id?: string
    /** overlay — на темних смугах (шапка, панелі поверх зображення). */
    variant?: 'default' | 'overlay'
    class?: string
    onchange?: (value: T) => void
  }

  let { value = $bindable(), options, ariaLabel, id, variant, class: className, onchange }: Props = $props()
</script>

<Select.Root
  type="single"
  bind:value={() => value, (v) => ((value = v as T), onchange?.(v as T))}
  items={options.map((o) => ({ ...o }))}
>
  <Select.Trigger {id} {variant} aria-label={ariaLabel} class={className}>
    {options.find((o) => o.value === value)?.label ?? value}
  </Select.Trigger>
  <Select.Content>
    {#each options as o (o.value)}
      <Select.Item value={o.value} label={o.label} />
    {/each}
  </Select.Content>
</Select.Root>
